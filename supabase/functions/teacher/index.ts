// Edge Function: teacher
// All routes require a teacher JWT (Authorization: Bearer <token>).
// Routes, matched by path after /functions/v1/teacher:
//   MCQ-family papers (mcq / true_false / fill_blank / match, mixable in one paper)
//   POST   /mcq/generate     { text, difficulty, typeCounts }      -> { questions }
//   POST   /mcq/save         { subject, topic, semester, questions } -> { id }
//   GET    /mcq                                                    -> { sets }
//   GET    /mcq/:id                                                -> { set, questions }
//   PUT    /mcq/:id          { subject, topic, semester, questions } -> { ok }   ('ready' only)
//   DELETE /mcq/:id                                                -> { ok }
//   POST   /mcq/:id/upload                                         -> { ok }
//   POST   /mcq/:id/close                                          -> { ok }
//   GET    /mcq/:id/results                                        -> { results }
//   PATCH  /mcq/:id/label     { subject, topic, semester }         -> { ok }   (any status - fixes typos)
//   GET    /scores/detailed                                        -> { attempts }  (one row per student per test)
//
//   Short-answer papers (photo upload, AI-graded) - also reachable as a
//   choice from the same "New Paper" screen as the MCQ-family types above.
//   Questions can be typed by the teacher, or generated with Gemini from
//   pasted/uploaded source text (the teacher picks which, per paper).
//   POST   /short/generate   { text, count, difficulty }             -> { questions }
//   POST   /short/save       { subject, topic, semester, questions } -> { id }
//   GET    /short                                                  -> { sets }
//   GET    /short/:id                                              -> { set, questions }
//   PUT    /short/:id        { subject, topic, semester, questions } -> { ok }
//   DELETE /short/:id                                              -> { ok }
//   POST   /short/:id/upload                                       -> { ok }
//   POST   /short/:id/close                                        -> { ok }
//   GET    /short/:id/results                                      -> { results }
//   PATCH  /short/:id/label   { subject, topic, semester }         -> { ok }   (any status - fixes typos)

import { query } from "../_shared/db.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";
import { generateQuestionsFromText, generateShortAnswerQuestions, type TypeCounts } from "../_shared/gemini.ts";

// System-enforced Title Case: "python program" → "Python Program"
function initcap(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface DraftQuestionIn {
  type: "mcq" | "true_false" | "fill_blank" | "match";
  question: string;
  marks: number;
  difficulty?: "easy" | "medium" | "hard";
  options?: { A?: string; B?: string; C?: string; D?: string };
  correct?: string;
  pairs?: { left: string; right: string }[];
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const user = requireAuth(req, "teacher");
  if (!user) return json({ error: "Not logged in." }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/teacher/, "");
  const mcqIdMatch = path.match(/^\/mcq\/(\d+)$/);
  const mcqActionMatch = path.match(/^\/mcq\/(\d+)\/(upload|close|results|label)$/);
  const shortIdMatch = path.match(/^\/short\/(\d+)$/);
  const shortActionMatch = path.match(/^\/short\/(\d+)\/(upload|close|results|label)$/);

  try {
    if (req.method === "POST" && path === "/mcq/generate") return await generate(req);
    if (req.method === "POST" && path === "/mcq/save") return await saveMcq(req, user.id);
    if (req.method === "GET" && path === "/mcq") return await listMcqSets(user.id);
    if (req.method === "GET" && path === "/scores/detailed") return await detailedScores(user.id);

    if (mcqIdMatch) {
      const [, id] = mcqIdMatch;
      if (req.method === "GET") return await getMcqSet(id, user.id);
      if (req.method === "PUT") return await updateMcqSet(req, id, user.id);
      if (req.method === "DELETE") return await deleteSet("mcq_sets", id, user.id);
    }
    if (mcqActionMatch) {
      const [, id, action] = mcqActionMatch;
      if (req.method === "POST" && action === "upload") return await openSet("mcq_sets", id, user.id);
      if (req.method === "POST" && action === "close") return await closeSet("mcq_sets", id, user.id);
      if (req.method === "GET" && action === "results") return await liveResults(id, user.id);
      if (req.method === "PATCH" && action === "label") return await relabelSet("mcq_sets", req, id, user.id);
    }

    if (req.method === "POST" && path === "/short/generate") return await generateShort(req);
    if (req.method === "POST" && path === "/short/save") return await saveShort(req, user.id);
    if (req.method === "GET" && path === "/short") return await listShortSets(user.id);
    if (shortIdMatch) {
      const [, id] = shortIdMatch;
      if (req.method === "GET") return await getShortSet(id, user.id);
      if (req.method === "PUT") return await updateShortSet(req, id, user.id);
      if (req.method === "DELETE") return await deleteSet("short_sets", id, user.id);
    }
    if (shortActionMatch) {
      const [, id, action] = shortActionMatch;
      if (req.method === "POST" && action === "upload") return await openSet("short_sets", id, user.id);
      if (req.method === "POST" && action === "close") return await closeSet("short_sets", id, user.id);
      if (req.method === "GET" && action === "results") return await shortResults(id, user.id);
      if (req.method === "PATCH" && action === "label") return await relabelSet("short_sets", req, id, user.id);
    }

    if (req.method === "PATCH" && path === "/rename-subject") return await renameSubject(req, user.id);

    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

// ---------- MCQ-family ----------

async function generate(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sourceText = (body.text || "").toString();
  const difficulty = (body.difficulty || "medium") as "easy" | "medium" | "hard";
  const typeCounts = (body.typeCounts || {}) as TypeCounts;

  if (!sourceText || sourceText.trim().length < 20) {
    return json({ error: "Please paste more text - at least a full paragraph." }, 400);
  }
  try {
    const questions = await generateQuestionsFromText(sourceText, typeCounts, difficulty);
    return json({ questions });
  } catch (err) {
    return json({ error: (err as Error).message || "Could not generate questions." }, 500);
  }
}

async function insertQuestions(setId: number, questions: DraftQuestionIn[]) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const opts = q.options || {};
    await query(
      `INSERT INTO mcq_questions
        (mcq_set_id, question_text, option_a, option_b, option_c, option_d,
         correct_option, question_type, marks, difficulty, match_pairs, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        setId,
        q.question,
        opts.A ?? null,
        opts.B ?? null,
        opts.C ?? null,
        opts.D ?? null,
        q.type === "match" ? null : q.correct ?? null,
        q.type,
        q.marks || 1,
        q.difficulty || "medium",
        q.type === "match" ? JSON.stringify(q.pairs || []) : null,
        i,
      ]
    );
  }
}

function validateQuestions(questions: unknown): questions is DraftQuestionIn[] {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  return questions.every((q: DraftQuestionIn) => {
    if (!["mcq", "true_false", "fill_blank", "match"].includes(q.type)) return false;
    if (!q.question) return false;
    if (q.type === "mcq" && (!q.options?.A || !q.options?.B || !q.options?.C || !q.options?.D || !q.correct)) return false;
    if (q.type === "true_false" && (!q.options?.A || !q.options?.B || !q.correct)) return false;
    if (q.type === "fill_blank" && !q.correct) return false;
    if (q.type === "match" && (!Array.isArray(q.pairs) || q.pairs.length < 2)) return false;
    return true;
  });
}

async function saveMcq(req: Request, teacherId: number) {
  const body = await req.json().catch(() => ({}));
  const { subject, topic, semester, questions } = body as {
    subject?: string;
    topic?: string;
    semester?: string;
    questions?: unknown;
  };
  if (!subject || !topic || !semester || !validateQuestions(questions)) {
    return json({ error: "Subject, topic, semester and at least one valid question are required." }, 400);
  }

  const setResult = await query(
    "INSERT INTO mcq_sets (teacher_id, subject, topic, semester, title, status) VALUES ($1,$2,$3,$4,$5,'ready') RETURNING id",
    [teacherId, subject, topic, semester, subject]
  );
  const setId = setResult.rows[0].id;
  await insertQuestions(setId, questions as DraftQuestionIn[]);
  return json({ id: setId });
}

async function listMcqSets(teacherId: number) {
  const result = await query(
    `SELECT ms.id, ms.subject, ms.topic, ms.semester, ms.title, ms.status, ms.created_at, ms.opened_at, ms.closed_at,
            COALESCE(SUM(mq.marks), 0) AS total_marks
     FROM mcq_sets ms LEFT JOIN mcq_questions mq ON mq.mcq_set_id = ms.id
     WHERE ms.teacher_id=$1
     GROUP BY ms.id
     ORDER BY COALESCE(ms.opened_at, ms.created_at) DESC`,
    [teacherId]
  );
  return json({ sets: result.rows });
}

async function getMcqSet(id: string, teacherId: number) {
  const setResult = await query("SELECT * FROM mcq_sets WHERE id=$1 AND teacher_id=$2", [id, teacherId]);
  if (setResult.rowCount === 0) return json({ error: "MCQ set not found." }, 404);

  const questions = await query(
    `SELECT id, question_text, option_a, option_b, option_c, option_d,
            correct_option, question_type, marks, difficulty, match_pairs, position
     FROM mcq_questions WHERE mcq_set_id=$1 ORDER BY position`,
    [id]
  );
  return json({ set: setResult.rows[0], questions: questions.rows });
}

// Editing is only allowed before the paper goes live.
async function updateMcqSet(req: Request, id: string, teacherId: number) {
  const body = await req.json().catch(() => ({}));
  const { subject, topic, semester, questions } = body as {
    subject?: string;
    topic?: string;
    semester?: string;
    questions?: unknown;
  };
  if (!subject || !topic || !semester || !validateQuestions(questions)) {
    return json({ error: "Subject, topic, semester and at least one valid question are required." }, 400);
  }

  const setCheck = await query("SELECT status FROM mcq_sets WHERE id=$1 AND teacher_id=$2", [id, teacherId]);
  if (setCheck.rowCount === 0) return json({ error: "MCQ set not found." }, 404);
  if (setCheck.rows[0].status !== "ready") {
    return json({ error: "This paper has already been uploaded and can no longer be edited." }, 409);
  }

  await query("UPDATE mcq_sets SET subject=$1, topic=$2, semester=$3, title=$1 WHERE id=$4", [subject, topic, semester, id]);
  await query("DELETE FROM mcq_questions WHERE mcq_set_id=$1", [id]);
  await insertQuestions(Number(id), questions as DraftQuestionIn[]);
  return json({ ok: true });
}

// Fixes a typo'd subject/topic ONLY (semester/date/marks are not touched).
// Title Case is enforced automatically by the system on every save.
async function relabelSet(table: "mcq_sets" | "short_sets", req: Request, id: string, teacherId: number) {
  const body = await req.json().catch(() => ({}));
  const subject = initcap((body.subject || "").toString().trim());
  const topic = initcap((body.topic || "").toString().trim());
  if (!subject || !topic) {
    return json({ error: "Subject and topic are required." }, 400);
  }
  // Semester is intentionally NOT updated here — teachers can only fix text typos.
  const result = await query(
    `UPDATE ${table} SET subject=$1, topic=$2, title=$1 WHERE id=$3 AND teacher_id=$4 RETURNING id`,
    [subject, topic, id, teacherId]
  );
  if (result.rowCount === 0) return json({ error: "Paper not found." }, 404);
  return json({ ok: true });
}

// Renames a subject across ALL papers (mcq + short) for this teacher.
// Uses case-insensitive matching so "python", "Python", "Pyhton" → "Python"
// all merge into one subject in a single save. The newSubject value becomes
// the canonical spelling used everywhere going forward.
async function renameSubject(req: Request, teacherId: number) {
  const body = await req.json().catch(() => ({}));
  const newSubject = initcap((body.newSubject || "").toString().trim());
  const oldSubject = initcap((body.oldSubject || "").toString().trim());
  if (!oldSubject || !newSubject) {
    return json({ error: "oldSubject and newSubject are required." }, 400);
  }
  // Case-insensitive: also normalise all other case-variants of newSubject
  // (e.g. "python", "PYTHON") into the canonical spelling the teacher typed.
  await query(
    `UPDATE mcq_sets SET subject=$1, title=$1
     WHERE LOWER(subject) IN (LOWER($2::text), LOWER($1::text))
     AND teacher_id=$3`,
    [newSubject, oldSubject, teacherId]
  );
  await query(
    `UPDATE short_sets SET subject=$1, title=$1
     WHERE LOWER(subject) IN (LOWER($2::text), LOWER($1::text))
     AND teacher_id=$3`,
    [newSubject, oldSubject, teacherId]
  );
  return json({ ok: true });
}

async function deleteSet(table: "mcq_sets" | "short_sets", id: string, teacherId: number) {
  // Cascades to questions/attempts via the FKs' ON DELETE CASCADE. The
  // frontend is expected to confirm with the teacher once before calling
  // this - there's no undo on the server side.
  const result = await query(`DELETE FROM ${table} WHERE id=$1 AND teacher_id=$2 RETURNING id`, [id, teacherId]);
  if (result.rowCount === 0) return json({ error: "Paper not found." }, 404);
  return json({ ok: true });
}

async function openSet(table: "mcq_sets" | "short_sets", id: string, teacherId: number) {
  const result = await query(
    `UPDATE ${table} SET status='live', opened_at=now() WHERE id=$1 AND teacher_id=$2 RETURNING id`,
    [id, teacherId]
  );
  if (result.rowCount === 0) return json({ error: "Paper not found." }, 404);
  return json({ ok: true });
}

async function closeSet(table: "mcq_sets" | "short_sets", id: string, teacherId: number) {
  const result = await query(
    `UPDATE ${table} SET status='closed', closed_at=now() WHERE id=$1 AND teacher_id=$2 RETURNING id`,
    [id, teacherId]
  );
  if (result.rowCount === 0) return json({ error: "Paper not found." }, 404);
  return json({ ok: true });
}

async function liveResults(id: string, teacherId: number) {
  const setCheck = await query("SELECT id FROM mcq_sets WHERE id=$1 AND teacher_id=$2", [id, teacherId]);
  if (setCheck.rowCount === 0) return json({ error: "MCQ set not found." }, 404);

  const result = await query(
    `SELECT s.rollno, s.name, a.score, a.total, a.submitted_at
     FROM attempts a JOIN students s ON s.id = a.student_id
     WHERE a.mcq_set_id = $1
     ORDER BY a.score DESC, a.submitted_at ASC`,
    [id]
  );
  return json({ results: result.rows });
}

// One row per (student, test). The frontend builds the Subject Performance
// view (pick a subject, then a table broken down topic by topic) and the
// Overall Performance view (every subject summed per student) from this
// same feed. avg is always shown before the breakdown columns, and rows
// are sorted with the best performer on top - both views do that client-side.
async function detailedScores(teacherId: number) {
  const result = await query(
    `SELECT ms.id AS mcq_set_id, ms.subject, ms.topic, ms.semester, ms.opened_at,
            s.rollno, s.name, a.score, a.total, a.submitted_at
     FROM attempts a
     JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     JOIN students s ON s.id = a.student_id
     WHERE ms.teacher_id = $1
     ORDER BY ms.opened_at DESC`,
    [teacherId]
  );
  return json({ attempts: result.rows });
}

// ---------- Short-answer (photo upload, AI-graded) ----------

async function generateShort(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sourceText = (body.text || "").toString();
  const count = Number(body.count) || 3;
  const difficulty = (body.difficulty || "medium") as "easy" | "medium" | "hard";

  if (!sourceText || sourceText.trim().length < 20) {
    return json({ error: "Please paste more text - at least a full paragraph." }, 400);
  }
  try {
    const questions = await generateShortAnswerQuestions(sourceText, count, difficulty);
    return json({ questions });
  } catch (err) {
    return json({ error: (err as Error).message || "Could not generate questions." }, 500);
  }
}

async function saveShort(req: Request, teacherId: number) {
  const body = await req.json().catch(() => ({}));
  const { subject, topic, semester, questions } = body as {
    subject?: string;
    topic?: string;
    semester?: string;
    questions?: Array<{ text: string; maxMarks: number }>;
  };
  if (!subject || !topic || !semester || !Array.isArray(questions) || questions.length === 0) {
    return json({ error: "Subject, topic, semester and at least one question are required." }, 400);
  }
  for (const q of questions) {
    if (!q.text || !Number.isFinite(Number(q.maxMarks)) || Number(q.maxMarks) <= 0) {
      return json({ error: "Every question needs text and a positive mark value." }, 400);
    }
  }

  const setResult = await query(
    "INSERT INTO short_sets (teacher_id, subject, topic, semester, title, status) VALUES ($1,$2,$3,$4,$5,'ready') RETURNING id",
    [teacherId, subject, topic, semester, subject]
  );
  const setId = setResult.rows[0].id;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await query(
      "INSERT INTO short_questions (short_set_id, question_text, max_marks, position) VALUES ($1,$2,$3,$4)",
      [setId, q.text, q.maxMarks, i]
    );
  }
  return json({ id: setId });
}

async function listShortSets(teacherId: number) {
  const result = await query(
    `SELECT id, subject, topic, semester, title, status, created_at, opened_at, closed_at
     FROM short_sets WHERE teacher_id=$1
     ORDER BY COALESCE(opened_at, created_at) DESC`,
    [teacherId]
  );
  return json({ sets: result.rows });
}

async function getShortSet(id: string, teacherId: number) {
  const setResult = await query("SELECT * FROM short_sets WHERE id=$1 AND teacher_id=$2", [id, teacherId]);
  if (setResult.rowCount === 0) return json({ error: "Paper not found." }, 404);

  const questions = await query(
    "SELECT id, question_text, max_marks, position FROM short_questions WHERE short_set_id=$1 ORDER BY position",
    [id]
  );
  return json({ set: setResult.rows[0], questions: questions.rows });
}

async function updateShortSet(req: Request, id: string, teacherId: number) {
  const body = await req.json().catch(() => ({}));
  const { subject, topic, semester, questions } = body as {
    subject?: string;
    topic?: string;
    semester?: string;
    questions?: Array<{ text: string; maxMarks: number }>;
  };
  if (!subject || !topic || !semester || !Array.isArray(questions) || questions.length === 0) {
    return json({ error: "Subject, topic, semester and at least one question are required." }, 400);
  }

  const setCheck = await query("SELECT status FROM short_sets WHERE id=$1 AND teacher_id=$2", [id, teacherId]);
  if (setCheck.rowCount === 0) return json({ error: "Paper not found." }, 404);
  if (setCheck.rows[0].status !== "ready") {
    return json({ error: "This paper has already been uploaded and can no longer be edited." }, 409);
  }

  await query("UPDATE short_sets SET subject=$1, topic=$2, semester=$3, title=$1 WHERE id=$4", [subject, topic, semester, id]);
  await query("DELETE FROM short_questions WHERE short_set_id=$1", [id]);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await query(
      "INSERT INTO short_questions (short_set_id, question_text, max_marks, position) VALUES ($1,$2,$3,$4)",
      [id, q.text, q.maxMarks, i]
    );
  }
  return json({ ok: true });
}

async function shortResults(id: string, teacherId: number) {
  const setCheck = await query("SELECT id FROM short_sets WHERE id=$1 AND teacher_id=$2", [id, teacherId]);
  if (setCheck.rowCount === 0) return json({ error: "Paper not found." }, 404);

  const result = await query(
    `SELECT s.rollno, s.name, a.score, a.total, a.submitted_at
     FROM short_attempts a JOIN students s ON s.id = a.student_id
     WHERE a.short_set_id = $1
     ORDER BY a.score DESC, a.submitted_at ASC`,
    [id]
  );
  return json({ results: result.rows });
}
