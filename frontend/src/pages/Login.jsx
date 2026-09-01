import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveSession, wakeBackend } from "../api.js";

export default function Login() {
  const [role, setRole] = useState("teacher");
  const [mode, setMode] = useState("login"); // login | register
  const [form, setForm] = useState({ name: "", loginName: "", semester: "", rollno: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [waking, setWaking] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Render's free tier sleeps after idle; give people an honest status
    // instead of a login button that looks broken for up to a minute.
    wakeBackend(setWaking);
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      let path, body;
      if (role === "teacher") {
        path = mode === "login" ? "/auth/teacher/login" : "/auth/teacher/register";
        body = mode === "login"
          ? { loginName: form.loginName, password: form.password }
          : { name: form.name, loginName: form.loginName, password: form.password };
      } else {
        path = mode === "login" ? "/auth/student/login" : "/auth/student/register";
        body = mode === "login"
          ? { semester: form.semester, rollno: form.rollno, password: form.password }
          : { name: form.name, semester: form.semester, rollno: form.rollno, password: form.password };
      }
      const data = await api(path, { method: "POST", body });

      if (mode === "register") {
        // Registration no longer logs the person straight in - it hands
        // them to the login form instead, so "register then log in" is an
        // explicit, visible step rather than something that happens for
        // them silently.
        setMode("login");
        setForm({ ...form, name: "", password: "" });
        setNotice("Registered! Now log in below to appear your MCQ test.");
        return;
      }

      const user = role === "teacher" ? data.teacher : data.student;
      saveSession(data.token, user, role);
      navigate(role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420 }}>
      <span className="eyebrow">MCQ Test Hall</span>
      <h1>Welcome</h1>
      <p className="muted">Pick your role, then log in or register.</p>

      <div className="role-toggle">
        <a className={role === "teacher" ? "active" : ""} onClick={() => { setRole("teacher"); setNotice(""); }}>Teacher</a>
        <a className={role === "student" ? "active" : ""} onClick={() => { setRole("student"); setNotice(""); }}>Student</a>
        <a
          className={mode === "register" ? "active" : ""}
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setNotice(""); }}
        >
          {mode === "login" ? "New here? Register" : "Have an account? Log in"}
        </a>
      </div>

      {notice && (
        <div className="error-banner" style={{ background: "rgba(79,124,94,0.2)", borderColor: "var(--good)", color: "#d7ecdd" }}>
          {notice}
        </div>
      )}

      {waking && (
        <div className="error-banner" style={{ background: "#1e3a5f", color: "#cfe8ff" }}>
          Waking up the server (it sleeps when idle to stay free) — this can take up to a minute on
          the first try. Feel free to wait here; it'll be quick after this.
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={submit} className="card" aria-disabled={waking}>
        {mode === "register" && (
          <div className="field">
            <label>Full name</label>
            <input value={form.name} onChange={set("name")} required />
          </div>
        )}

        {role === "teacher" ? (
          <div className="field">
            <label>Login name</label>
            <input value={form.loginName} onChange={set("loginName")} required />
          </div>
        ) : (
          <>
            <div className="field">
              <label>Semester</label>
              <input value={form.semester} onChange={set("semester")} required placeholder="e.g. Sem 3" />
            </div>
            <div className="field">
              <label>Roll number</label>
              <input value={form.rollno} onChange={set("rollno")} required />
            </div>
          </>
        )}

        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set("password")} required />
        </div>

        <button type="submit">{mode === "login" ? "Log in" : "Register"}</button>
      </form>
    </div>
  );
}
