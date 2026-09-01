import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import teacherRoutes from "./routes/teacher.js";
import studentRoutes from "./routes/student.js";

dotenv.config();
const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "").split(",").map((s) => s.trim());
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : "*" }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api", authRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MCQ backend running on port ${PORT}`));
