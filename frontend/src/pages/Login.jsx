import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveSession } from "../api.js";

export default function Login() {
  const [role, setRole] = useState("teacher");
  const [mode, setMode] = useState("login"); // login | register
  const [showPrincipal, setShowPrincipal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [form, setForm] = useState({ name: "", loginName: "", department: "", semester: "", rollno: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  // Ctrl+Alt+P reveals the Principal tab; Ctrl+Alt+A reveals the Admin tab
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.altKey && e.key === "p") {
        setShowPrincipal(true);
        setRole("principal");
        setMode("login");
        setNotice("");
        setError("");
      }
      if (e.ctrlKey && e.altKey && e.key === "a") {
        setShowAdmin(true);
        navigate("/admin");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
          : { name: form.name, loginName: form.loginName, department: form.department, password: form.password };

      } else if (role === "student") {
        path = mode === "login" ? "/auth/student/login" : "/auth/student/register";
        body = mode === "login"
          ? { semester: form.semester, rollno: form.rollno, department: form.department, password: form.password }
          : { name: form.name, department: form.department, semester: form.semester, rollno: form.rollno, password: form.password };

      } else {
        // principal
        path = mode === "login" ? "/auth/principal/login" : "/auth/principal/register";
        body = mode === "login"
          ? { loginName: form.loginName, password: form.password }
          : { name: form.name, loginName: form.loginName, password: form.password };
      }

      const data = await api(path, { method: "POST", body });

      if (mode === "register") {
        setMode("login");
        setForm({ ...form, name: "", department: "", password: "" });
        setNotice("Registered! Now log in.");
        return;
      }

      if (role === "principal") {
        saveSession(data.token, data.principal, "principal");
        navigate("/principal");
        return;
      }

      const user = role === "teacher" ? data.teacher : data.student;
      saveSession(data.token, user, role);
      navigate(role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      setError(err.message);
    }
  }

  function switchRole(r) {
    setRole(r);
    setMode("login");
    setNotice("");
    setError("");
    if (r !== "principal") setShowPrincipal(r === "principal");
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420 }}>
      <h1 className="lms-title">LMS — AI for better education</h1>

      <div className="role-toggle">
        <a className={role === "teacher" ? "active" : ""} onClick={() => switchRole("teacher")}>Teacher</a>
        <a className={role === "student" ? "active" : ""} onClick={() => switchRole("student")}>Student</a>
        {showPrincipal && (
          <a className={role === "principal" ? "active" : ""} onClick={() => switchRole("principal")}>Principal</a>
        )}
      </div>

      <div className="role-toggle" style={{ marginTop: 4 }}>
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
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={submit} className="card">
        {/* NAME — shown only on register */}
        {mode === "register" && (
          <div className="field">
            <label>Full name</label>
            <input value={form.name} onChange={set("name")} required />
          </div>
        )}

        {/* DEPARTMENT — shown on register for teacher & student */}
        {mode === "register" && role !== "principal" && (
          <div className="field">
            <label>Department (e.g. CS, IT, Mech)</label>
            <input value={form.department} onChange={set("department")} required />
          </div>
        )}

        {/* TEACHER / PRINCIPAL fields */}
        {(role === "teacher" || role === "principal") && (
          <div className="field">
            <label>Login name</label>
            <input value={form.loginName} onChange={set("loginName")} required autoComplete="username" />
          </div>
        )}

        {/* STUDENT fields */}
        {role === "student" && (
          <>
            {mode === "register" ? null : (
              <div className="field">
                <label>Department (e.g. CS, IT)</label>
                <input value={form.department} onChange={set("department")} required />
              </div>
            )}
            <div className="field">
              <label>Semester (e.g. Sem 1)</label>
              <input value={form.semester} onChange={set("semester")} required />
            </div>
            <div className="field">
              <label>Roll number</label>
              <input value={form.rollno} onChange={set("rollno")} required />
            </div>
          </>
        )}

        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set("password")} required autoComplete="current-password" />
        </div>

        <button type="submit">{mode === "login" ? "Log in" : "Register"}</button>
      </form>

      {role === "principal" && mode === "login" && (
        <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 6 }}>
          Press Ctrl+Alt+P to access the principal portal.
        </p>
      )}
    </div>
  );
}
