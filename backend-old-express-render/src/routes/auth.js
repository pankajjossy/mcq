import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db.js";

const router = Router();

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "12h" });
}

// ---------- Teacher ----------

router.post("/teacher/register", async (req, res) => {
  const { name, loginName, password } = req.body;
  if (!name || !loginName || !password) {
    return res.status(400).json({ error: "Name, login name and password are all required." });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO teachers (name, login_name, password_hash) VALUES ($1,$2,$3) RETURNING id, name, login_name",
      [name, loginName, hash]
    );
    const teacher = result.rows[0];
    const token = signToken({ id: teacher.id, role: "teacher", name: teacher.name });
    res.json({ token, teacher });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That login name is already taken." });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed." });
  }
});

router.post("/teacher/login", async (req, res) => {
  const { loginName, password } = req.body;
  const result = await query("SELECT * FROM teachers WHERE login_name=$1", [loginName]);
  const teacher = result.rows[0];
  if (!teacher || !(await bcrypt.compare(password, teacher.password_hash))) {
    return res.status(401).json({ error: "Incorrect login name or password." });
  }
  const token = signToken({ id: teacher.id, role: "teacher", name: teacher.name });
  res.json({ token, teacher: { id: teacher.id, name: teacher.name, login_name: teacher.login_name } });
});

// ---------- Student ----------

router.post("/student/register", async (req, res) => {
  const { name, className, rollno, password } = req.body;
  if (!name || !className || !rollno || !password) {
    return res.status(400).json({ error: "Name, class, roll number and password are all required." });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO students (name, class, rollno, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, class, rollno",
      [name, className, rollno, hash]
    );
    const student = result.rows[0];
    const token = signToken({ id: student.id, role: "student", name: student.name, class: student.class });
    res.json({ token, student });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That roll number is already registered for this class." });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed." });
  }
});

router.post("/student/login", async (req, res) => {
  const { className, rollno, password } = req.body;
  const result = await query("SELECT * FROM students WHERE class=$1 AND rollno=$2", [className, rollno]);
  const student = result.rows[0];
  if (!student || !(await bcrypt.compare(password, student.password_hash))) {
    return res.status(401).json({ error: "Incorrect class, roll number or password." });
  }
  const token = signToken({ id: student.id, role: "student", name: student.name, class: student.class });
  res.json({ token, student: { id: student.id, name: student.name, class: student.class, rollno: student.rollno } });
});

export default router;
