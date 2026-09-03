// Edge Function: student
// All routes require a student JWT (Authorization: Bearer <token>).
// Routes, matched by path after /functions/v1/student:
//   MCQ-family
//   GET  /mcq/active           -> { today, archive }   (today = live, uploaded in the last 30 minutes,
//                                                        AND matching this student's own semester)
//   GET  /mcq/:id              -> { set, questions }
//   POST /mcq/:id/submit       { answers } -> { score, total }
//   GET  /mcq/:id/review       -> { set, questions }    (this student's own past attempt, answer key + their picks)
//   GET  /dashboard            -> { averages, history }
//
//   Short-answer (photo upload, AI-graded)
//   GET  /short/active         -> { today, archive }
//   GET  /short/:id            -> { set, questions }
//   POST /short/:id/submit     { answers: [{questionId, photoBase64, mimeType}] } -> { score, total, breakdown }

import { getPool } from "../_shared/db.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";
import { gradeShortAnswerPhoto } from "../_shared/gemini.ts";

// A paper only sits in the "exam hall" (today's list) for this long after
// the teacher uploads it - after that it's expected to have already been
// taken, and it drops off students' landing view into the dashboard history.
const EXAM_HALL_MINUTES = 30;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const user = requireAuth(req, "student");
  if (!user) return json({ error: "Not logged in." }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/student/, "");
  const pool = getPool();

  try {
    if (req.method === "GET" && path === "/mcq/active") return await activePapers(pool, user.id, user.semester ?? "");
    if (req.method === "GET" && path === "/dashboard") return await dashboard(pool, user.id);

    const submitMatch = path.match(/^\/mcq\/(\d+)\/submit$/);
    if (req.method === "POST" && submitMatch) return await submit(req, pool, submitMatch[1], user.id);

    const reviewMatch = path.match(/^\/mcq\/(\d+)\/review$/);
    if (req.method === "GET" && reviewMatch) return await review(pool, reviewMatch[1], user.id);

    const getMatch = path.match(/^\/mcq\/(\d+)$/);
    if (req.method === "GET" && getMatch) return await getPaper(pool, getMatch[1], user.id, user.semester ?? "");

    if (req.method === "GET" && path === "/short/active") return await activeShortPapers(pool, user.id, user.semester ?? "");

    const shortSubmitMatch = path.match(/^\/short\/(\d+)\/submit$/);
    if (req.method === "POST" && shortSubmitMatch) return await submitShort(req, pool, shortSubmitMatch[1], user.id);

    const shortGetMatch = path.match(/^\/short\/(\d+)$/);
    if (req.method === "GET" && shortGetMatch) return await getShortPaper(pool, shortGetMatch[1], user.id, user.semester ?? "");

    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

// ---------- MCQ-family ----------

async function activePapers(pool: ReturnType<typeof getPool>, studentId: number, semester: string) {
  const today = await pool.query(
    `SELECT ms.id, ms.subject, ms.topic, ms.semester, ms.title, ms.opened_at
     FROM mcq_sets ms
     WHERE ms.status = 'live'
       AND ms.opened_at > now() - interval '${EXAM_HALL_MINUTES} minutes'
       AND ms.semester = $2
       AND NOT EXISTS (
         SELECT 1 FROM attempts a WHERE a.mcq_set_id = ms.id AND a.student_id = $1
       )
     ORDER BY ms.opened_at DESC`,
    [studentId, semester]
  );

  const archive = await pool.query(
    `SELECT ms.id, ms.subject, ms.topic, ms.semester, ms.title, a.score, a.total, a.submitted_at
     FROM attempts a JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     WHERE a.student_id = $1
     ORDER BY a.submitted_at DESC`,
    [studentId]
  );

  return json({ today: today.rows, archive: archive.rows });
}

async function getPaper(pool: ReturnType<typeof getPool>, setId: string, studentId: number, semester: string) {
  const setResult = await pool.query(
    `SELECT id, subject, topic, semester, title, teacher_id FROM mcq_sets
     WHERE id=$1 AND status='live' AND semester=$2
       AND opened_at > now() - interval '${EXAM_HALL_MINUTES} minutes'`,
    [setId, semester]
  );
  if (setResult.rowCount === 0) {
    return json({ error: "This paper is not available right now." }, 404);
  }

  const already = await pool.query("SELECT id FROM attempts WHERE mcq_set_id=$1 AND student_id=$2", [
    setId,
    studentId,
  ]);
  if ((already.rowCount ?? 0) > 0) {
    return json({ error: "You've already attempted this paper." }, 409);
  }

  // correct_option / full match_pairs are withheld here - only the shuffled
  // pieces a student needs to answer are sent; the real key comes back once
  // the paper is graded (see review()).
  const questions = await pool.query(
    `SELECT id, question_text, option_a, option_b, option_c, option_d, question_type, marks,
            CASE WHEN question_type = 'match' THEN
              (SELECT jsonb_agg(elem->'left') FROM jsonb_array_elements(match_pairs) elem)
            ELSE NULL END AS match_left,
            CASE WHEN question_type = 'match' THEN
              (SELECT jsonb_agg(elem->'right' ORDER BY random())
               FROM jsonb_array_elements(match_pairs) elem)
            ELSE NULL END AS match_right
     FROM mcq_questions WHERE mcq_set_id=$1 ORDER BY position`,
    [setId]
  );
  return json({ set: setResult.rows[0], questions: questions.rows });
}

async function submit(req: Request, pool: ReturnType<typeof getPool>, setId: string, studentId: number) {
  const body = await req.json().catch(() => ({}));
  const answers = body.answers as
    | Array<{ questionId: number; selected?: string; matchAnswer?: { left: string; right: string }[] }>
    | undefined;
  if (!Array.isArray(answers) || answers.length === 0) {
    return json({ error: "No answers received." }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const already = await client.query(
      "SELECT id FROM attempts WHERE mcq_set_id=$1 AND student_id=$2 FOR UPDATE",
      [setId, studentId]
    );
    if ((already.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return json({ error: "You've already attempted this paper." }, 409);
    }

    const questions = await client.query(
      "SELECT id, correct_option, question_type, marks, match_pairs FROM mcq_questions WHERE mcq_set_id=$1",
      [setId]
    );
    const byId: Record<
      number,
      { correct_option: string | null; question_type: string; marks: number; match_pairs: { left: string; right: string }[] | null }
    > = Object.fromEntries(questions.rows.map((q: { id: number } & Record<string, unknown>) => [q.id, q]));

    let score = 0;
    let total = 0;
    const graded = answers.map((a) => {
      const q = byId[a.questionId];
      if (!q) return { ...a, isCorrect: false, awardedMarks: 0 };
      total += Number(q.marks);

      let isCorrect = false;
      if (q.question_type === "mcq" || q.question_type === "true_false") {
        isCorrect = q.correct_option === a.selected;
      } else if (q.question_type === "fill_blank") {
        isCorrect = (a.selected || "").trim().toLowerCase() === (q.correct_option || "").trim().toLowerCase();
      } else if (q.question_type === "match") {
        const correctMap: Record<string, string> = Object.fromEntries(
          (q.match_pairs || []).map((p) => [p.left, p.right])
        );
        const given = a.matchAnswer || [];
        isCorrect =
          given.length === (q.match_pairs || []).length &&
          given.every((p) => correctMap[p.left] === p.right);
      }

      const awardedMarks = isCorrect ? Number(q.marks) : 0;
      if (isCorrect) score += awardedMarks;
      return { ...a, isCorrect, awardedMarks };
    });

    const attemptResult = await client.query(
      "INSERT INTO attempts (mcq_set_id, student_id, score, total) VALUES ($1,$2,$3,$4) RETURNING id",
      [setId, studentId, score, total]
    );
    const attemptId = attemptResult.rows[0].id;

    for (const g of graded) {
      await client.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_option, match_answer, is_correct, awarded_marks)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [attemptId, g.questionId, g.selected ?? null, g.matchAnswer ? JSON.stringify(g.matchAnswer) : null, g.isCorrect, g.awardedMarks]
      );
    }

    await client.query("COMMIT");
    return json({ score, total });
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "You've already attempted this paper." }, 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

// This student's own past attempt: the full answer key alongside what they
// picked - used to expand a past paper in the dashboard or a wall post.
async function review(pool: ReturnType<typeof getPool>, setId: string, studentId: number) {
  const attemptResult = await pool.query(
    "SELECT id, score, total, submitted_at FROM attempts WHERE mcq_set_id=$1 AND student_id=$2",
    [setId, studentId]
  );
  if (attemptResult.rowCount === 0) return json({ error: "You haven't attempted this paper." }, 404);
  const attempt = attemptResult.rows[0];

  const setResult = await pool.query("SELECT subject, topic, semester, title FROM mcq_sets WHERE id=$1", [setId]);
  const questions = await pool.query(
    `SELECT q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
            q.correct_option, q.question_type, q.marks, q.match_pairs,
            aa.selected_option, aa.match_answer, aa.is_correct, aa.awarded_marks
     FROM mcq_questions q
     JOIN attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = $1
     WHERE q.mcq_set_id = $2 ORDER BY q.position`,
    [attempt.id, setId]
  );

  return json({ set: setResult.rows[0], attempt, questions: questions.rows });
}

async function dashboard(pool: ReturnType<typeof getPool>, studentId: number) {
  const averages = await pool.query(
    `SELECT ms.subject,
            ROUND(100.0 * SUM(a.score) / NULLIF(SUM(a.total), 0), 1) AS avg_percent,
            SUM(a.score) AS total_score, SUM(a.total) AS total_possible
     FROM attempts a JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     WHERE a.student_id = $1
     GROUP BY ms.subject
     ORDER BY ms.subject`,
    [studentId]
  );

  const history = await pool.query(
    `SELECT ms.id AS mcq_set_id, ms.subject, a.score, a.total, a.submitted_at
     FROM attempts a JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     WHERE a.student_id = $1
     ORDER BY a.submitted_at DESC`,
    [studentId]
  );

  return json({ averages: averages.rows, history: history.rows });
}

// ---------- Short-answer (photo upload, AI-graded) ----------

async function activeShortPapers(pool: ReturnType<typeof getPool>, studentId: number, semester: string) {
  const today = await pool.query(
    `SELECT ss.id, ss.subject, ss.topic, ss.semester, ss.title, ss.opened_at
     FROM short_sets ss
     WHERE ss.status = 'live'
       AND ss.opened_at > now() - interval '${EXAM_HALL_MINUTES} minutes'
       AND ss.semester = $2
       AND NOT EXISTS (
         SELECT 1 FROM short_attempts a WHERE a.short_set_id = ss.id AND a.student_id = $1
       )
     ORDER BY ss.opened_at DESC`,
    [studentId, semester]
  );

  const archive = await pool.query(
    `SELECT ss.id, ss.subject, ss.topic, ss.title, a.score, a.total, a.submitted_at
     FROM short_attempts a JOIN short_sets ss ON ss.id = a.short_set_id
     WHERE a.student_id = $1
     ORDER BY a.submitted_at DESC`,
    [studentId]
  );

  return json({ today: today.rows, archive: archive.rows });
}

async function getShortPaper(pool: ReturnType<typeof getPool>, setId: string, studentId: number, semester: string) {
  const setResult = await pool.query(
    `SELECT id, subject, topic, semester, title FROM short_sets
     WHERE id=$1 AND status='live' AND semester=$2
       AND opened_at > now() - interval '${EXAM_HALL_MINUTES} minutes'`,
    [setId, semester]
  );
  if (setResult.rowCount === 0) {
    return json({ error: "This paper is not available right now." }, 404);
  }

  const already = await pool.query("SELECT id FROM short_attempts WHERE short_set_id=$1 AND student_id=$2", [
    setId,
    studentId,
  ]);
  if ((already.rowCount ?? 0) > 0) {
    return json({ error: "You've already attempted this paper." }, 409);
  }

  const questions = await pool.query(
    "SELECT id, question_text, max_marks FROM short_questions WHERE short_set_id=$1 ORDER BY position",
    [setId]
  );
  return json({ set: setResult.rows[0], questions: questions.rows });
}

async function submitShort(req: Request, pool: ReturnType<typeof getPool>, setId: string, studentId: number) {
  const body = await req.json().catch(() => ({}));
  const answers = body.answers as
    | Array<{ questionId: number; photoBase64: string; mimeType?: string }>
    | undefined;
  if (!Array.isArray(answers) || answers.length === 0) {
    return json({ error: "No photos received." }, 400);
  }

  const already = await pool.query("SELECT id FROM short_attempts WHERE short_set_id=$1 AND student_id=$2", [
    setId,
    studentId,
  ]);
  if ((already.rowCount ?? 0) > 0) {
    return json({ error: "You've already attempted this paper." }, 409);
  }

  const questions = await pool.query(
    "SELECT id, question_text, max_marks FROM short_questions WHERE short_set_id=$1",
    [setId]
  );
  const byId: Record<number, { question_text: string; max_marks: number }> = Object.fromEntries(
    questions.rows.map((q: { id: number; question_text: string; max_marks: number }) => [
      q.id,
      { question_text: q.question_text, max_marks: q.max_marks },
    ])
  );

  const graded: Array<{ questionId: number; marks: number; feedback: string; maxMarks: number }> = [];
  for (const a of answers) {
    const q = byId[a.questionId];
    if (!q) continue;
    const result = await gradeShortAnswerPhoto(
      q.question_text,
      q.max_marks,
      a.photoBase64,
      a.mimeType || "image/jpeg"
    );
    graded.push({ questionId: a.questionId, marks: result.marks, feedback: result.feedback, maxMarks: q.max_marks });
  }

  const score = graded.reduce((sum, g) => sum + g.marks, 0);
  const total = graded.reduce((sum, g) => sum + g.maxMarks, 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recheck = await client.query(
      "SELECT id FROM short_attempts WHERE short_set_id=$1 AND student_id=$2 FOR UPDATE",
      [setId, studentId]
    );
    if ((recheck.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return json({ error: "You've already attempted this paper." }, 409);
    }

    const attemptResult = await client.query(
      "INSERT INTO short_attempts (short_set_id, student_id, score, total) VALUES ($1,$2,$3,$4) RETURNING id",
      [setId, studentId, score, total]
    );
    const attemptId = attemptResult.rows[0].id;

    for (const g of graded) {
      await client.query(
        "INSERT INTO short_attempt_answers (attempt_id, question_id, awarded_marks, feedback) VALUES ($1,$2,$3,$4)",
        [attemptId, g.questionId, g.marks, g.feedback]
      );
    }

    await client.query("COMMIT");
    return json({ score, total, breakdown: graded });
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "You've already attempted this paper." }, 409);
    }
    throw err;
  } finally {
    client.release();
  }
}
