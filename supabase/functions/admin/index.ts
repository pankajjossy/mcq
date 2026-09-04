// Edge Function: admin
// Routes (path after /functions/v1/admin):
//   POST /login
//   GET  /info
//   GET  /teachers?q=<search>               - search by name (ILIKE)
//   GET  /students?q=<search>               - search by name (ILIKE)
//   PATCH /teachers/:id                     - update name, login_name, department
//   PATCH /students/:id                     - update name, semester, rollno, department
//   POST  /teachers/:id/reset-password
//   POST  /students/:id/reset-password
//   DELETE /teachers/:id
//   DELETE /students/:id

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
    if (path === "/login" && req.method === "POST") return await login(req);

    if (path === "/info" && req.method === "GET") {
      return json({ name: Deno.env.get("ADMIN_USERNAME") ?? "Admin" });
    }

    const admin = requireAuth(req, "admin");
    if (!admin) return json({ error: "Not authorized." }, 401);

    // LIST with optional search
    if (path === "/teachers" && req.method === "GET") return await listTeachers(url);
    if (path === "/students" && req.method === "GET") return await listStudents(url);

    // PATCH (update fields)
    const teacherPatch = path.match(/^\/teachers\/(\d+)$/);
    if (teacherPatch && req.method === "PATCH") return await updateTeacher(req, Number(teacherPatch[1]));

    const studentPatch = path.match(/^\/students\/(\d+)$/);
    if (studentPatch && req.method === "PATCH") return await updateStudent(req, Number(studentPatch[1]));

    // RESET PASSWORD
    const teacherReset = path.match(/^\/teachers\/(\d+)\/reset-password$/);
    if (teacherReset && req.method === "POST") return await resetPassword(req, "teachers", Number(teacherReset[1]));

    const studentReset = path.match(/^\/students\/(\d+)\/reset-password$/);
    if (studentReset && req.method === "POST") return await resetPassword(req, "students", Number(studentReset[1]));

    // DELETE
    const teacherDel = path.match(/^\/teachers\/(\d+)$/);
    if (teacherDel && req.method === "DELETE") return await deleteRecord("teachers", Number(teacherDel[1]));

    const studentDel = path.match(/^\/students\/(\d+)$/);
    if (studentDel && req.method === "DELETE") return await deleteRecord("students", Number(studentDel[1]));

    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function login(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const { username, password } = body as { username?: string; password?: string };
  const validUsername = Deno.env.get("ADMIN_USERNAME");
  const validPassword = Deno.env.get("ADMIN_PASSWORD");
  if (!validUsername || !validPassword) return json({ error: "Admin login isn't configured yet." }, 500);
  if (username !== validUsername || password !== validPassword) return json({ error: "Incorrect username or password." }, 401);
  const token = signToken({ id: 0, role: "admin", name: "Admin" });
  return json({ token, admin: { name: "Admin" } });
}

async function listTeachers(url: URL) {
  const q = (url.searchParams.get("q") || "").trim();
  const result = q
    ? await query(
        "SELECT id, name, login_name, department, created_at FROM teachers WHERE name ILIKE $1 ORDER BY name",
        [`%${q}%`]
      )
    : await query("SELECT id, name, login_name, department, created_at FROM teachers ORDER BY name");
  return json({ teachers: result.rows });
}

async function listStudents(url: URL) {
  const q = (url.searchParams.get("q") || "").trim();
  const result = q
    ? await query(
        "SELECT id, name, semester, rollno, department, created_at FROM students WHERE name ILIKE $1 ORDER BY name",
        [`%${q}%`]
      )
    : await query("SELECT id, name, semester, rollno, department, created_at FROM students ORDER BY name");
  return json({ students: result.rows });
}

async function updateTeacher(req: Request, id: number) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, loginName, department } = body as { name?: string; loginName?: string; department?: string };
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (name?.trim()) { sets.push(`name=$${sets.length + 1}`); vals.push(name.trim()); }
  if (loginName?.trim()) { sets.push(`login_name=$${sets.length + 1}`); vals.push(loginName.trim()); }
  if (department !== undefined) { sets.push(`department=$${sets.length + 1}`); vals.push(department.trim()); }
  if (sets.length === 0) return json({ error: "Nothing to update." }, 400);
  vals.push(id);
  try {
    const r = await query(`UPDATE teachers SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING id`, vals);
    if (r.rowCount === 0) return json({ error: "Teacher not found." }, 404);
    return json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return json({ error: "That login name is already taken." }, 409);
    throw e;
  }
}

async function updateStudent(req: Request, id: number) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, semester, rollno, department } = body as { name?: string; semester?: string; rollno?: string; department?: string };
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (name?.trim()) { sets.push(`name=$${sets.length + 1}`); vals.push(name.trim()); }
  if (semester?.trim()) { sets.push(`semester=$${sets.length + 1}`); vals.push(semester.trim()); }
  if (rollno?.trim()) { sets.push(`rollno=$${sets.length + 1}`); vals.push(rollno.trim()); }
  if (department !== undefined) { sets.push(`department=$${sets.length + 1}`); vals.push(department.trim()); }
  if (sets.length === 0) return json({ error: "Nothing to update." }, 400);
  vals.push(id);
  try {
    const r = await query(`UPDATE students SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING id`, vals);
    if (r.rowCount === 0) return json({ error: "Student not found." }, 404);
    return json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return json({ error: "That roll number already exists for this semester." }, 409);
    throw e;
  }
}

async function resetPassword(req: Request, table: "teachers" | "students", id: number) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { newPassword } = body as { newPassword?: string };
  if (!newPassword || newPassword.length < 4) return json({ error: "Password must be at least 4 characters." }, 400);
  const hash = await bcrypt.hash(newPassword, 10);
  const r = await query(`UPDATE ${table} SET password_hash=$1 WHERE id=$2 RETURNING id`, [hash, id]);
  if (r.rowCount === 0) return json({ error: "Not found." }, 404);
  return json({ ok: true });
}

async function deleteRecord(table: "teachers" | "students", id: number) {
  const r = await query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [id]);
  if (r.rowCount === 0) return json({ error: "Not found." }, 404);
  return json({ ok: true });
}
