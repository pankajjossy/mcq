// Edge Function: auth
// Routes (all POST), matched by the path after /functions/v1/auth:
//   /teacher/register  /teacher/login
//   /student/register  /student/login
//
// This mirrors the old Express auth.js route-for-route - same validation,
// same error messages, same unique-violation (23505) handling for
// duplicate login names / roll numbers.

import bcrypt from "npm:bcryptjs@2.4.3";
import { query } from "../_shared/db.ts";
import { signToken } from "../_shared/jwt.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  // Path looks like /auth/teacher/register - strip the function name itself.
  const path = url.pathname.replace(/^\/auth/, "");

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  try {
    if (path === "/teacher/register") return await teacherRegister(body);
    if (path === "/teacher/login") return await teacherLogin(body);
    if (path === "/student/register") return await studentRegister(body);
    if (path === "/student/login") return await studentLogin(body);
    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function teacherRegister(body: Record<string, unknown>) {
  const { name, loginName, password } = body as { name?: string; loginName?: string; password?: string };
  if (!name || !loginName || !password) {
    return json({ error: "Name, login name and password are all required." }, 400);
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO teachers (name, login_name, password_hash) VALUES ($1,$2,$3) RETURNING id, name, login_name",
      [name, loginName, hash]
    );
    const teacher = result.rows[0];
    const token = signToken({ id: teacher.id, role: "teacher", name: teacher.name });
    return json({ token, teacher });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "That login name is already taken." }, 409);
    }
    throw err;
  }
}

async function teacherLogin(body: Record<string, unknown>) {
  const { loginName, password } = body as { loginName?: string; password?: string };
  const result = await query("SELECT * FROM teachers WHERE login_name=$1", [loginName]);
  const teacher = result.rows[0];
  if (!teacher || !password || !(await bcrypt.compare(password, teacher.password_hash))) {
    return json({ error: "Incorrect login name or password." }, 401);
  }
  const token = signToken({ id: teacher.id, role: "teacher", name: teacher.name });
  return json({ token, teacher: { id: teacher.id, name: teacher.name, login_name: teacher.login_name } });
}

async function studentRegister(body: Record<string, unknown>) {
  const { name, semester, rollno, password } = body as {
    name?: string;
    semester?: string;
    rollno?: string;
    password?: string;
  };
  if (!name || !semester || !rollno || !password) {
    return json({ error: "Name, semester, roll number and password are all required." }, 400);
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO students (name, semester, rollno, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, semester, rollno",
      [name, semester, rollno, hash]
    );
    const student = result.rows[0];
    const token = signToken({ id: student.id, role: "student", name: student.name, semester: student.semester });
    return json({ token, student });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "That roll number is already registered for this semester." }, 409);
    }
    throw err;
  }
}

async function studentLogin(body: Record<string, unknown>) {
  const { semester, rollno, password } = body as { semester?: string; rollno?: string; password?: string };
  const result = await query("SELECT * FROM students WHERE semester=$1 AND rollno=$2", [semester, rollno]);
  const student = result.rows[0];
  if (!student || !password || !(await bcrypt.compare(password, student.password_hash))) {
    return json({ error: "Incorrect semester, roll number or password." }, 401);
  }
  const token = signToken({ id: student.id, role: "student", name: student.name, semester: student.semester });
  return json({
    token,
    student: { id: student.id, name: student.name, semester: student.semester, rollno: student.rollno },
  });
}
