// Edge Function: admin
// Routes (path after /functions/v1/admin):
//   POST   /login                          - the one admin account logs in
//   GET    /teachers                       - list every teacher (never a password)
//   GET    /students                       - list every student (never a password)
//   POST   /teachers                       - add a new teacher { name, loginName, password }
//   POST   /students                       - add a new student { name, semester, rollno, password }
//   PUT    /teachers/:id                   - edit a teacher's details { name, loginName }
//   PUT    /students/:id                   - edit a student's details { name, semester, rollno }
//   DELETE /teachers/:id                   - remove a teacher (blocked if they have papers/wall posts)
//   DELETE /students/:id                   - remove a student (blocked if they have attempts/wall posts)
//   POST   /teachers/:id/reset-password    - set a new password for a teacher
//   POST   /students/:id/reset-password    - set a new password for a student
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
//
// Deleting a teacher or student is deliberately NOT cascaded: a teacher
// with papers, or a student with attempts, can't be deleted outright -
// that would silently wipe real academic history. The delete routes below
// report that clearly instead of forcing it through.

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

    // Everything else requires an admin token.
    const admin = requireAuth(req, "admin");
    if (!admin) return json({ error: "Not authorized." }, 401);

    if (path === "/teachers" && req.method === "GET") return await listTeachers();
    if (path === "/students" && req.method === "GET") return await listStudents();
    if (path === "/teachers" && req.method === "POST") return await createTeacher(req);
    if (path === "/students" && req.method === "POST") return await createStudent(req);

    const teacherId = path.match(/^\/teachers\/(\d+)$/);
    if (teacherId && req.method === "PUT") return await updateTeacher(req, Number(teacherId[1]));
    if (teacherId && req.method === "DELETE") return await deleteAccount("teachers", Number(teacherId[1]));

    const studentId = path.match(/^\/students\/(\d+)$/);
    if (studentId && req.method === "PUT") return await updateStudent(req, Number(studentId[1]));
    if (studentId && req.method === "DELETE") return await deleteAccount("students", Number(studentId[1]));

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

async function createTeacher(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, loginName, password } = body as { name?: string; loginName?: string; password?: string };
  if (!name || !loginName || !password) {
    return json({ error: "Name, login name and password are all required." }, 400);
  }
  if (password.length < 4) return json({ error: "Password must be at least 4 characters." }, 400);
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO teachers (name, login_name, password_hash) VALUES ($1,$2,$3) RETURNING id, name, login_name, created_at",
      [name, loginName, hash]
    );
    return json({ teacher: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "That login name is already taken." }, 409);
    }
    throw err;
  }
}

async function createStudent(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, semester, rollno, password } = body as {
    name?: string;
    semester?: string;
    rollno?: string;
    password?: string;
  };
  if (!name || !semester || !rollno || !password) {
    return json({ error: "Name, semester, roll number and password are all required." }, 400);
  }
  if (password.length < 4) return json({ error: "Password must be at least 4 characters." }, 400);
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO students (name, semester, rollno, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, semester, rollno, created_at",
      [name, semester, rollno, hash]
    );
    return json({ student: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "That roll number is already registered for this semester." }, 409);
    }
    throw err;
  }
}

async function updateTeacher(req: Request, id: number) {
  const body = await req.json().catch(() => ({}));
  const { name, loginName } = body as { name?: string; loginName?: string };
  if (!name || !loginName) return json({ error: "Name and login name are both required." }, 400);
  try {
    const result = await query(
      "UPDATE teachers SET name=$1, login_name=$2 WHERE id=$3 RETURNING id, name, login_name, created_at",
      [name, loginName, id]
    );
    if (result.rowCount === 0) return json({ error: "Teacher not found." }, 404);
    return json({ teacher: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "That login name is already taken." }, 409);
    }
    throw err;
  }
}

async function updateStudent(req: Request, id: number) {
  const body = await req.json().catch(() => ({}));
  const { name, semester, rollno } = body as { name?: string; semester?: string; rollno?: string };
  if (!name || !semester || !rollno) return json({ error: "Name, semester and roll number are all required." }, 400);
  try {
    const result = await query(
      "UPDATE students SET name=$1, semester=$2, rollno=$3 WHERE id=$4 RETURNING id, name, semester, rollno, created_at",
      [name, semester, rollno, id]
    );
    if (result.rowCount === 0) return json({ error: "Student not found." }, 404);
    return json({ student: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return json({ error: "That roll number is already registered for this semester." }, 409);
    }
    throw err;
  }
}

async function deleteAccount(table: "teachers" | "students", id: number) {
  try {
    // `table` only ever comes from the two matched routes above, never
    // from request input, so this interpolation isn't a SQL-injection risk.
    const result = await query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [id]);
    if (result.rowCount === 0) return json({ error: "Not found." }, 404);
    return json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      const what = table === "teachers" ? "papers" : "test attempts";
      return json(
        { error: `Can't delete this account - it still has ${what} on record. Nothing was removed.` },
        409
      );
    }
    throw err;
  }
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
