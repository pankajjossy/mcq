// Edge Function: admin
// Routes (path after /functions/v1/admin):
//   POST /login                          - the one admin account logs in
//   GET  /teachers                       - list every teacher (never a password)
//   GET  /students                       - list every student (never a password)
//   POST /teachers/:id/reset-password    - set a new password for a teacher
//   POST /students/:id/reset-password    - set a new password for a student
//
// There is exactly one admin account, defined by two Supabase secrets
// (ADMIN_USERNAME / ADMIN_PASSWORD) rather than a database row - nothing
// to register, nothing extra sitting in the database to protect.
//
// Passwords are bcrypt-hashed and therefore one-way: nobody, including
// this function, can recover or display a teacher's or student's actual
// password - not even by querying the database directly. "Check a
// password" is implemented here as "set a new one," which is the only
// thing that's actually possible.

import bcrypt from "npm:bcryptjs@2.4.3";
import { query } from "../_shared/db.ts";
import { signToken, requireAuth } from "../_shared/jwt.ts";
import { handlePreflight, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/admin/, "");

  try {
    if (path === "/login" && req.method === "POST") {
      return await login(req);
    }

    // Public: return admin display name for the home page header.
    if (path === "/info" && req.method === "GET") {
      const adminName = Deno.env.get("ADMIN_USERNAME") ?? "Admin";
      return json({ name: adminName });
    }

    // Everything else requires an admin token.
    const admin = requireAuth(req, "admin");
    if (!admin) return json({ error: "Not authorized." }, 401);

    if (path === "/teachers" && req.method === "GET") return await listTeachers();
    if (path === "/students" && req.method === "GET") return await listStudents();

    const teacherReset = path.match(/^\/teachers\/(\d+)\/reset-password$/);
    if (teacherReset && req.method === "POST") {
      return await resetPassword(req, "teachers", Number(teacherReset[1]));
    }

    const studentReset = path.match(/^\/students\/(\d+)\/reset-password$/);
    if (studentReset && req.method === "POST") {
      return await resetPassword(req, "students", Number(studentReset[1]));
    }

    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function login(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const { username, password } = body as { username?: string; password?: string };

  const validUsername = Deno.env.get("ADMIN_USERNAME");
  const validPassword = Deno.env.get("ADMIN_PASSWORD");
  if (!validUsername || !validPassword) {
    return json({ error: "Admin login isn't configured yet - set ADMIN_USERNAME and ADMIN_PASSWORD." }, 500);
  }
  if (username !== validUsername || password !== validPassword) {
    return json({ error: "Incorrect username or password." }, 401);
  }

  const token = signToken({ id: 0, role: "admin", name: "Admin" });
  return json({ token, admin: { name: "Admin" } });
}

async function listTeachers() {
  const result = await query(
    "SELECT id, name, login_name, created_at FROM teachers ORDER BY created_at DESC"
  );
  return json({ teachers: result.rows });
}

async function listStudents() {
  const result = await query(
    "SELECT id, name, semester, rollno, created_at FROM students ORDER BY created_at DESC"
  );
  return json({ students: result.rows });
}

async function resetPassword(req: Request, table: "teachers" | "students", id: number) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const { newPassword } = body as { newPassword?: string };
  if (!newPassword || newPassword.length < 4) {
    return json({ error: "New password must be at least 4 characters." }, 400);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  // `table` only ever comes from the two matched routes above, never from
  // request input, so this interpolation isn't a SQL-injection risk.
  const result = await query(
    `UPDATE ${table} SET password_hash=$1 WHERE id=$2 RETURNING id`,
    [hash, id]
  );
  if (result.rows.length === 0) {
    return json({ error: "Not found." }, 404);
  }
  return json({ status: "ok" });
}
