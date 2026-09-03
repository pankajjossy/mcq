import { useEffect, useState } from "react";
import Collapsible from "../components/Collapsible.jsx";

// Deliberately NOT reusing api.js's saveSession/getSession/token - those
// hold the logged-in teacher or student's session. Admin is a separate,
// single, hardcoded account and shouldn't share storage with whichever
// teacher/student happens to be logged in on the same browser.
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function adminApi(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json", apikey: ANON_KEY };
  const token = localStorage.getItem("admin_token");
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${FUNCTIONS_URL}/admin${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token"));

  if (!token) return <AdminLogin onLoggedIn={(t) => { localStorage.setItem("admin_token", t); setToken(t); }} />;

  return (
    <AdminPanel
      onLogout={() => {
        localStorage.removeItem("admin_token");
        setToken(null);
      }}
    />
  );
}

function AdminLogin({ onLoggedIn }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await adminApi("/login", { method: "POST", body: form });
      onLoggedIn(data.token);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 380 }}>
      <span className="eyebrow">LMS</span>
      <h1>Admin</h1>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={submit} className="card">
        <div className="field">
          <label>Username</label>
          <input value={form.username} onChange={set("username")} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set("password")} required />
        </div>
        <button type="submit">Log in</button>
      </form>
    </div>
  );
}

function AdminPanel({ onLogout }) {
  const [tab, setTab] = useState("teachers");
  const [teachers, setTeachers] = useState(null);
  const [students, setStudents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi("/teachers").then((d) => setTeachers(d.teachers)).catch((err) => setError(err.message));
    adminApi("/students").then((d) => setStudents(d.students)).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="app-shell">
      <div className="top-bar">
        <span className="eyebrow">LMS — Admin</span>
        <a onClick={onLogout} style={{ cursor: "pointer" }}>Log out</a>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        <button className={tab === "teachers" ? "active" : ""} onClick={() => setTab("teachers")}>
          Teachers {teachers ? `(${teachers.length})` : ""}
        </button>
        <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>
          Students {students ? `(${students.length})` : ""}
        </button>
      </div>

      {tab === "teachers" && (
        <>
          {!teachers && <p className="muted">Loading…</p>}
          {teachers?.length === 0 && <p className="muted">No teacher accounts yet.</p>}
          {teachers?.map((t) => (
            <Collapsible key={t.id} head={t.name} meta={`${t.login_name} · joined ${new Date(t.created_at).toLocaleDateString()}`}>
              <ResetPasswordForm table="teachers" id={t.id} />
            </Collapsible>
          ))}
        </>
      )}

      {tab === "students" && (
        <>
          {!students && <p className="muted">Loading…</p>}
          {students?.length === 0 && <p className="muted">No student accounts yet.</p>}
          {students?.map((s) => (
            <Collapsible
              key={s.id}
              head={s.name}
              meta={`${s.semester} · Roll ${s.rollno} · joined ${new Date(s.created_at).toLocaleDateString()}`}
            >
              <ResetPasswordForm table="students" id={s.id} />
            </Collapsible>
          ))}
        </>
      )}
    </div>
  );
}

function ResetPasswordForm({ table, id }) {
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");

  async function submit(e) {
    e.preventDefault();
    setStatus("");
    try {
      await adminApi(`/${table}/${id}/reset-password`, { method: "POST", body: { newPassword } });
      setStatus("Password updated.");
      setNewPassword("");
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <form onSubmit={submit} className="actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <label style={{ margin: 0 }}>
        Set a new password (they can't be shown their old one - it's hashed)
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={4}
        />
        <button type="submit">Reset</button>
      </div>
      {status && <span className="muted">{status}</span>}
    </form>
  );
}
