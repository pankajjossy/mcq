import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth("student"));

// "Exam hall" landing page: today's live papers (not yet attempted) + this student's history.
router.get("/mcq/active", async (req, res) => {
  const today = await query(
    `SELECT ms.id, ms.subject, ms.class, ms.title, ms.opened_at
     FROM mcq_sets ms
     WHERE ms.status = 'live'
       AND ms.opened_at::date = now()::date
       AND NOT EXISTS (
         SELECT 1 FROM attempts a WHERE a.mcq_set_id = ms.id AND a.student_id = $1
       )
     ORDER BY ms.opened_at DESC`,
    [req.user.id]
  );

  const archive = await query(
    `SELECT ms.id, ms.subject, ms.title, a.score, a.total, a.submitted_at
     FROM attempts a JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     WHERE a.student_id = $1
     ORDER BY a.submitted_at DESC`,
    [req.user.id]
  );

  res.json({ today: today.rows, archive: archive.rows });
});

// Fetch questions for a paper the student is about to take (no correct answers sent to client).
router.get("/mcq/:id", async (req, res) => {
  const setResult = await query(
    `SELECT id, subject, title FROM mcq_sets
     WHERE id=$1 AND status='live' AND opened_at::date = now()::date`,
    [req.params.id]
  );
  if (setResult.rowCount === 0) {
    return res.status(404).json({ error: "This paper is not available right now." });
  }

  const already = await query("SELECT id FROM attempts WHERE mcq_set_id=$1 AND student_id=$2", [
    req.params.id,
    req.user.id
  ]);
  if (already.rowCount > 0) {
    return res.status(409).json({ error: "You've already attempted this paper." });
  }

  const questions = await query(
    `SELECT id, question_text, option_a, option_b, option_c, option_d
     FROM mcq_questions WHERE mcq_set_id=$1 ORDER BY position`,
    [req.params.id]
  );
  res.json({ set: setResult.rows[0], questions: questions.rows });
});

// Submit answers -> graded instantly by the server, one attempt per student per paper.
router.post("/mcq/:id/submit", async (req, res) => {
  const { answers } = req.body; // [{ questionId, selected }]
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "No answers received." });
  }

  const setId = req.params.id;
  const client = await (await import("../db.js")).pool.connect();
  try {
    await client.query("BEGIN");

    const already = await client.query(
      "SELECT id FROM attempts WHERE mcq_set_id=$1 AND student_id=$2 FOR UPDATE",
      [setId, req.user.id]
    );
    if (already.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "You've already attempted this paper." });
    }

    const questions = await client.query(
      "SELECT id, correct_option FROM mcq_questions WHERE mcq_set_id=$1",
      [setId]
    );
    const correctByQ = Object.fromEntries(questions.rows.map((q) => [q.id, q.correct_option]));

    let score = 0;
    const total = questions.rowCount;
    const graded = answers.map((a) => {
      const isCorrect = correctByQ[a.questionId] === a.selected;
      if (isCorrect) score++;
      return { ...a, isCorrect };
    });

    const attemptResult = await client.query(
      "INSERT INTO attempts (mcq_set_id, student_id, score, total) VALUES ($1,$2,$3,$4) RETURNING id",
      [setId, req.user.id, score, total]
    );
    const attemptId = attemptResult.rows[0].id;

    for (const g of graded) {
      await client.query(
        "INSERT INTO attempt_answers (attempt_id, question_id, selected_option, is_correct) VALUES ($1,$2,$3,$4)",
        [attemptId, g.questionId, g.selected, g.isCorrect]
      );
    }

    await client.query("COMMIT");
    res.json({ score, total });
  } catch (err) {
    await client.query("ROLLBACK");
    // Two rapid submissions (double-click, double-tab) can both pass the
    // "already attempted" check before either commits. The UNIQUE(mcq_set_id,
    // student_id) constraint on `attempts` is the real safety net here -
    // catch its violation and report it the same way as a normal duplicate.
    if (err.code === "23505") {
      return res.status(409).json({ error: "You've already attempted this paper." });
    }
    console.error(err);
    res.status(500).json({ error: "Could not submit your answers." });
  } finally {
    client.release();
  }
});

// Subject-wise average first, then each test's score, newest to oldest.
router.get("/dashboard", async (req, res) => {
  const averages = await query(
    `SELECT ms.subject,
            ROUND(100.0 * SUM(a.score) / NULLIF(SUM(a.total), 0), 1) AS avg_percent,
            SUM(a.score) AS total_score, SUM(a.total) AS total_possible
     FROM attempts a JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     WHERE a.student_id = $1
     GROUP BY ms.subject
     ORDER BY ms.subject`,
    [req.user.id]
  );

  const history = await query(
    `SELECT ms.subject, a.score, a.total, a.submitted_at
     FROM attempts a JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     WHERE a.student_id = $1
     ORDER BY a.submitted_at DESC`,
    [req.user.id]
  );

  res.json({ averages: averages.rows, history: history.rows });
});

export default router;
