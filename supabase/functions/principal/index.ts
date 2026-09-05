// Edge Function: principal
// All routes require a principal JWT.
// Routes:
//   GET /departments              -> { departments }  (distinct teacher departments)
//   GET /teachers?dept=X          -> teacher list with their MCQ publish activity per day
//   GET /students?dept=X&sem=Y    -> student performance in that dept/semester

import { query } from "../_shared/db.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const user = requireAuth(req, "principal");
  if (!user) return json({ error: "Not logged in as principal." }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/principal/, "");
  try {
    if (req.method === "GET" && path === "/departments") return await getDepartments();
    if (req.method === "GET" && path === "/teachers") return await getTeachers(url);
    if (req.method === "GET" && path === "/attendance") return await getAttendance(url);
    if (req.method === "GET" && path === "/students") return await getStudents(url);
    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong." }, 500);
  }
});

async function getDepartments() {
  const r = await query(
    "SELECT DISTINCT department FROM teachers WHERE department != '' ORDER BY department"
  );
  const sr = await query(
    "SELECT DISTINCT semester FROM students WHERE semester != '' ORDER BY semester"
  );
  return json({ 
    departments: r.rows.map((x: { department: string }) => x.department),
    semesters: sr.rows.map((x: { semester: string }) => x.semester)
  });
}

async function getAttendance(url: URL) {
  const dept = url.searchParams.get("dept");
  const sem = url.searchParams.get("sem");
  if (!dept || !sem) return json({ error: "dept and sem required." }, 400);
  const semNorm = (sem.match(/(\d+)/) || [sem])[0];

  // Papers (MCQ + short) published today in this department and semester
  const papers = await query(
    `SELECT ms.id, 'mcq' AS kind, ms.teacher_id, t.name AS teacher_name, ms.opened_at
     FROM mcq_sets ms JOIN teachers t ON t.id = ms.teacher_id
     WHERE t.department = $1 AND regexp_replace(ms.semester, '\\D', '', 'g') = $2 AND ms.status IN ('live','closed')
       AND (timezone('Asia/Kolkata', ms.opened_at))::date = (timezone('Asia/Kolkata', now()))::date
     UNION ALL
     SELECT ss.id, 'short' AS kind, ss.teacher_id, t.name AS teacher_name, ss.opened_at
     FROM short_sets ss JOIN teachers t ON t.id = ss.teacher_id
     WHERE t.department = $1 AND regexp_replace(ss.semester, '\\D', '', 'g') = $2 AND ss.status IN ('live','closed')
       AND (timezone('Asia/Kolkata', ss.opened_at))::date = (timezone('Asia/Kolkata', now()))::date
     ORDER BY opened_at`,
    [dept, semNorm]
  );

  // Students in this dept+sem
  const students = await query("SELECT id, rollno, name FROM students WHERE department=$1 AND regexp_replace(semester, '\\D', '', 'g') = $2 ORDER BY rollno", [dept, semNorm]);

  const attendanceMap: Record<string, number[]> = {};
  for (const p of papers.rows) {
    if (p.kind === 'mcq') {
      const a = await query(`SELECT s.id FROM attempts a JOIN students s ON s.id = a.student_id WHERE a.mcq_set_id=$1`, [p.id]);
      attendanceMap[`mcq-${p.id}`] = a.rows.map((r: any) => r.id);
    } else {
      const a = await query(`SELECT s.id FROM short_attempts a JOIN students s ON s.id = a.student_id WHERE a.short_set_id=$1`, [p.id]);
      attendanceMap[`short-${p.id}`] = a.rows.map((r: any) => r.id);
    }
  }

  return json({ papers: papers.rows, students: students.rows, attendance: attendanceMap });
}

async function getTeachers(url: URL) {
  const dept = url.searchParams.get("dept");
  if (!dept) return json({ error: "dept required." }, 400);

  // For each teacher: their name, and all MCQ sets grouped by date with time
  const teachers = await query(
    `SELECT id, name FROM teachers WHERE department = $1 ORDER BY name`,
    [dept]
  );

  const result = [];
  for (const t of teachers.rows) {
    // Each MCQ set published: subject (topic), opened_at
    const papers = await query(
      `SELECT subject, topic, semester, opened_at::date AS date,
              TO_CHAR(timezone('Asia/Kolkata', opened_at), 'FMHH12:MI AM') AS time_str
       FROM mcq_sets
       WHERE teacher_id = $1 AND status IN ('live','closed')
       ORDER BY opened_at`,
      [t.id]
    );
    result.push({
      id: t.id,
      name: t.name,
      papers: papers.rows,
    });
  }
  return json({ teachers: result });
}

async function getStudents(url: URL) {
  const dept = url.searchParams.get("dept");
  const sem = url.searchParams.get("sem");
  if (!dept || !sem) return json({ error: "dept and sem required." }, 400);

  // All students in this dept+semester
  const students = await query(
    `SELECT id, name, rollno FROM students WHERE department = $1 AND semester = $2 ORDER BY rollno`,
    [dept, sem]
  );

  const result = [];
  for (const s of students.rows) {
    // Attendance: how many MCQ sets were offered to this semester vs how many they appeared
    const offered = await query(
      `SELECT COUNT(*) AS cnt FROM mcq_sets ms
       JOIN teachers t ON t.id = ms.teacher_id
       WHERE t.department = $1 AND regexp_replace(ms.semester, '\\D', '', 'g') = $2 AND ms.status = 'closed'`,
      [dept, semNorm]
    );
    const appeared = await query(
      `SELECT COUNT(*) AS cnt FROM attempts a
       JOIN mcq_sets ms ON ms.id = a.mcq_set_id
       WHERE a.student_id = $1`,
      [s.id]
    );
    const totalOffered = Number(offered.rows[0].cnt);
    const totalAppeared = Number(appeared.rows[0].cnt);
    const attendance = totalOffered > 0 ? Math.round((100 * totalAppeared) / totalOffered) : 0;

    // Subject-wise performance with teacher name
    const subjectPerf = await query(
      `SELECT ms.subject,
              ROUND(100.0 * SUM(a.score) / NULLIF(SUM(a.total), 0), 1) AS avg_percent,
              SUM(a.score) AS total_score,
              SUM(a.total) AS total_possible,
              COUNT(a.id) AS tests_taken,
              t.name AS teacher_name
       FROM attempts a
       JOIN mcq_sets ms ON ms.id = a.mcq_set_id
       JOIN teachers t ON t.id = ms.teacher_id
       WHERE a.student_id = $1
       GROUP BY ms.subject, t.name
       ORDER BY avg_percent DESC NULLS LAST`,
      [s.id]
    );

    // Overall: average of subject percentages
    const subjectPcts = subjectPerf.rows.map((r: { avg_percent: string }) => Number(r.avg_percent) || 0);
    const overall = subjectPcts.length > 0
      ? Math.round(subjectPcts.reduce((a: number, b: number) => a + b, 0) / subjectPcts.length)
      : 0;

    result.push({
      id: s.id,
      name: s.name,
      rollno: s.rollno,
      attendance,
      total_offered: totalOffered,
      total_appeared: totalAppeared,
      overall,
      subjects: subjectPerf.rows,
    });
  }

  // Sort by overall descending
  result.sort((a, b) => b.overall - a.overall);
  return json({ students: result });
}
