// Edge Function: auth
// Routes (all POST), matched by the path after /functions/v1/auth:
//   /teacher/register  /teacher/login
//   /student/register  /student/login
//   /principal/register  /principal/login

import bcrypt from "npm:bcryptjs@2.4.3";
import { query } from "../_shared/db.ts";
import { signToken } from "../_shared/jwt.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
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
    if (path === "/principal/register") return await principalRegister(body);
    if (path === "/principal/login") return await principalLogin(body);
    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function teacherRegister(body: Record<string, unknown>) {
  const { name, loginName, password, department } = body as {
    name?: string; loginName?: string; password?: string; department?: string;
  };
  if (!name || !loginName || !password || !department) {
    return json({ error: "Name, department, login name and password are all required." }, 400);
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO teachers (name, login_name, password_hash, department) VALUES ($1,$2,$3,$4) RETURNING id, name, login_name, department",
      [name, loginName, hash, department]
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
  return json({ token, teacher: { id: teacher.id, name: teacher.name, login_name: teacher.login_name, department: teacher.department } });
}

async function studentRegister(body: Record<string, unknown>) {
  const { name, semester, rollno, password, department } = body as {
    name?: string; semester?: string; rollno?: string; password?: string; department?: string;
  };
  if (!name || !semester || !rollno || !password || !department) {
    return json({ error: "Name, department, semester, roll number and password are all required." }, 400);
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO students (name, semester, rollno, password_hash, department) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, semester, rollno, department",
      [name, semester, rollno, hash, department]
    );
    const student = result.rows[0];
    const token = signToken({ id: student.id, role: "student", name: student.name, semester: student.semester });
    return json({ token, student });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "That roll number is already registered for this semester and department." }, 409);
    }
    throw err;
  }
}

async function studentLogin(body: Record<string, unknown>) {
  const { semester, rollno, department, password } = body as {
    semester?: string; rollno?: string; department?: string; password?: string;
  };
  if (!semester || !rollno || !department) {
    return json({ error: "Semester, department and roll number are required to log in." }, 400);
  }
  const result = await query(
    "SELECT * FROM students WHERE semester=$1 AND rollno=$2 AND department=$3",
    [semester, rollno, department]
  );
  const student = result.rows[0];
  if (!student || !password || !(await bcrypt.compare(password, student.password_hash))) {
    return json({ error: "Incorrect semester, department, roll number or password." }, 401);
  }
  const token = signToken({ id: student.id, role: "student", name: student.name, semester: student.semester });
  return json({
    token,
    student: { id: student.id, name: student.name, semester: student.semester, rollno: student.rollno, department: student.department },
  });
}

async function principalRegister(body: Record<string, unknown>) {
  const { name, loginName, password } = body as { name?: string; loginName?: string; password?: string };
  if (!name || !loginName || !password) {
    return json({ error: "Name, login name and password are all required." }, 400);
  }
  // Only allow one principal account
  const existing = await query("SELECT id FROM principals LIMIT 1", []);
  if ((existing.rowCount ?? 0) > 0) {
    return json({ error: "A principal account already exists. Please log in instead." }, 409);
  }
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    "INSERT INTO principals (name, login_name, password_hash) VALUES ($1,$2,$3) RETURNING id, name, login_name",
    [name, loginName, hash]
  );
  const principal = result.rows[0];
  const token = signToken({ id: principal.id, role: "principal", name: principal.name });
  return json({ token, principal });
}

async function principalLogin(body: Record<string, unknown>) {
  const { loginName, password } = body as { loginName?: string; password?: string };
  const result = await query("SELECT * FROM principals WHERE login_name=$1", [loginName]);
  const principal = result.rows[0];
  if (!principal || !password || !(await bcrypt.compare(password, principal.password_hash))) {
    return json({ error: "Incorrect login name or password." }, 401);
  }
  const token = signToken({ id: principal.id, role: "principal", name: principal.name });
  return json({ token, principal: { id: principal.id, name: principal.name, login_name: principal.login_name } });
}
