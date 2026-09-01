import { Router } from "express";
import multer from "multer";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { generateMcqFromText } from "../utils/gemini.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth("teacher"));

// Extract plain text from a pasted string OR an uploaded .txt/.docx/.pdf file.
async function extractText(req) {
  if (req.file) {
    const { mimetype, buffer } = req.file;
    if (mimetype === "application/pdf") {
      return (await pdfParse(buffer)).text;
    }
    if (mimetype.includes("wordprocessingml") || mimetype === "application/msword") {
      return (await mammoth.extractRawText({ buffer })).value;
    }
    return buffer.toString("utf-8"); // plain text fallback
  }
  return req.body.text || "";
}

// Step 1: generate questions with Gemini for the teacher to review (not saved yet).
router.post("/mcq/generate", upload.single("file"), async (req, res) => {
  try {
    const sourceText = await extractText(req);
    const count = Number(req.body.count) || 5;
    if (!sourceText || sourceText.trim().length < 20) {
      return res.status(400).json({ error: "Please paste more text or upload a document with real content." });
    }
    const questions = await generateMcqFromText(sourceText, count);
    res.json({ questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Could not generate questions." });
  }
});

// Step 2: teacher has reviewed/edited the questions and clicks "Done" -> save as a ready-to-upload set.
router.post("/mcq/save", async (req, res) => {
  const { subject, className, questions } = req.body;
  if (!subject || !className || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Subject, class and at least one question are required." });
  }
  try {
    const setResult = await query(
      "INSERT INTO mcq_sets (teacher_id, subject, class, title, status) VALUES ($1,$2,$3,$4,'ready') RETURNING id",
      [req.user.id, subject, className, subject]
    );
    const setId = setResult.rows[0].id;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await query(
        `INSERT INTO mcq_questions
          (mcq_set_id, question_text, option_a, option_b, option_c, option_d, correct_option, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [setId, q.question, q.options.A, q.options.B, q.options.C, q.options.D, q.correct, i]
      );
    }
    res.json({ id: setId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save the MCQ set." });
  }
});

// All of this teacher's MCQ sets, newest first (ready / live / closed).
router.get("/mcq", async (req, res) => {
  const result = await query(
    `SELECT id, subject, class, title, status, created_at, opened_at, closed_at
     FROM mcq_sets WHERE teacher_id=$1
     ORDER BY COALESCE(opened_at, created_at) DESC`,
    [req.user.id]
  );
  res.json({ sets: result.rows });
});

// Open a saved set for students to attempt ("Upload").
router.post("/mcq/:id/upload", async (req, res) => {
  const result = await query(
    "UPDATE mcq_sets SET status='live', opened_at=now() WHERE id=$1 AND teacher_id=$2 RETURNING id",
    [req.params.id, req.user.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "MCQ set not found." });
  res.json({ ok: true });
});

// Close it and switch the teacher's screen to live results ("Show Results").
router.post("/mcq/:id/close", async (req, res) => {
  const result = await query(
    "UPDATE mcq_sets SET status='closed', closed_at=now() WHERE id=$1 AND teacher_id=$2 RETURNING id",
    [req.params.id, req.user.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "MCQ set not found." });
  res.json({ ok: true });
});

// Live/final results for the big screen. Poll this every few seconds while live.
router.get("/mcq/:id/results", async (req, res) => {
  const setCheck = await query("SELECT id FROM mcq_sets WHERE id=$1 AND teacher_id=$2", [
    req.params.id,
    req.user.id
  ]);
  if (setCheck.rowCount === 0) return res.status(404).json({ error: "MCQ set not found." });

  const result = await query(
    `SELECT s.rollno, s.name, a.score, a.total, a.submitted_at
     FROM attempts a JOIN students s ON s.id = a.student_id
     WHERE a.mcq_set_id = $1
     ORDER BY a.score DESC, a.submitted_at ASC`,
    [req.params.id]
  );
  res.json({ results: result.rows });
});

// Cumulative subject-wise scores across all of this teacher's classes.
router.get("/scores", async (req, res) => {
  const result = await query(
    `SELECT ms.subject, ms.class, s.rollno, s.name,
            SUM(a.score) AS total_score, SUM(a.total) AS total_possible,
            COUNT(a.id) AS tests_taken
     FROM attempts a
     JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     JOIN students s ON s.id = a.student_id
     WHERE ms.teacher_id = $1
     GROUP BY ms.subject, ms.class, s.rollno, s.name
     ORDER BY ms.subject, ms.class, s.name`,
    [req.user.id]
  );
  res.json({ scores: result.rows });
});

export default router;
