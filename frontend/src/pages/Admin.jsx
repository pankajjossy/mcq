import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Collapsible from "../components/Collapsible.jsx";

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

  if (!token) {
    return <AdminLogin onLoggedIn={(t) => { localStorage.setItem("admin_token", t); setToken(t); }} />;
  }
  return (
    <AdminPanel
      onLogout={() => { localStorage.removeItem("admin_token"); setToken(null); }}
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
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 380 }}>
      <span className="eyebrow">LMS</span>
      <h1>Admin Login</h1>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={submit} className="card">
        <div className="field">
          <label>Username</label>
          <input value={form.username} onChange={set("username")} required autoFocus />
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
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [teachers, setTeachers] = useState(null);
  const [students, setStudents] = useState(null);
  const [error, setError] = useState("");

  // Debounce search input by 350ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { loadTeachers(); }, [debouncedQ]);
  useEffect(() => { if (tab === "students") loadStudents(); }, [debouncedQ, tab]);

  async function loadTeachers() {
    try {
      const d = await adminApi(`/teachers${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ""}`);
      setTeachers(d.teachers);
    } catch (e) { setError(e.message); }
  }

  async function loadStudents() {
    try {
      const d = await adminApi(`/students${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ""}`);
      setStudents(d.students);
    } catch (e) { setError(e.message); }
  }

  function onTabChange(t) {
    setTab(t);
    if (t === "students" && !students) loadStudents();
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">LMS</span>
          <h1 style={{ margin: 0 }}>Admin Panel</h1>
        </div>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Search box */}
      <div className="field" style={{ maxWidth: 360, marginBottom: 16 }}>
        <label>Search by name</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='e.g. "joh" → John, Johnny, Njohnas…'
          autoFocus
        />
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={tab === "teachers" ? "active" : ""} onClick={() => onTabChange("teachers")}>
          Teachers {teachers ? `(${teachers.length})` : ""}
        </button>
        <button className={tab === "students" ? "active" : ""} onClick={() => onTabChange("students")}>
          Students {students ? `(${students.length})` : ""}
        </button>
      </div>

      {tab === "teachers" && (
        <>
          {!teachers && <p className="muted">Loading…</p>}
          {teachers?.length === 0 && <p className="muted">No teachers match your search.</p>}
          {teachers?.map((t) => (
            <TeacherCard key={t.id} teacher={t} onRefresh={loadTeachers} setError={setError} />
          ))}
        </>
      )}

      {tab === "students" && (
        <>
          {!students && <p className="muted">Loading…</p>}
          {students?.length === 0 && <p className="muted">No students match your search.</p>}
          {students?.map((s) => (
            <StudentCard key={s.id} student={s} onRefresh={loadStudents} setError={setError} />
          ))}
        </>
      )}
    </div>
  );
}

function TeacherCard({ teacher: t, onRefresh, setError }) {
  const [form, setForm] = useState({ name: t.name, loginName: t.login_name, department: t.department || "" });
  const [newPwd, setNewPwd] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveDetails(e) {
    e.preventDefault();
    setSaving(true); setStatus("");
    try {
      await adminApi(`/teachers/${t.id}`, { method: "PATCH", body: { name: form.name, loginName: form.loginName, department: form.department } });
      setStatus("✓ Updated.");
      onRefresh();
    } catch (err) { setStatus(err.message); } finally { setSaving(false); }
  }

  async function resetPwd(e) {
    e.preventDefault();
    if (!newPwd.trim()) return;
    setSaving(true); setStatus("");
    try {
      await adminApi(`/teachers/${t.id}/reset-password`, { method: "POST", body: { newPassword: newPwd } });
      setStatus("✓ Password reset."); setNewPwd("");
    } catch (err) { setStatus(err.message); } finally { setSaving(false); }
  }

  async function del() {
    if (!confirm(`Delete teacher "${t.name}"? This cannot be undone.`)) return;
    try {
      await adminApi(`/teachers/${t.id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) { setError(err.message); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Collapsible
      head={t.name}
      meta={`${t.login_name} · ${t.department || "no dept"} · joined ${new Date(t.created_at).toLocaleDateString()}`}
    >
      {status && <p className="muted" style={{ marginBottom: 8 }}>{status}</p>}

      <form onSubmit={saveDetails}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="field" style={{ flex: "1 1 150px", margin: 0 }}>
            <label>Full name</label>
            <input value={form.name} onChange={set("name")} required />
          </div>
          <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
            <label>Login name</label>
            <input value={form.loginName} onChange={set("loginName")} required />
          </div>
          <div className="field" style={{ flex: "1 1 120px", margin: 0 }}>
            <label>Department</label>
            <input value={form.department} onChange={set("department")} />
          </div>
        </div>
        <button type="submit" disabled={saving}>Save details</button>
      </form>

      <form onSubmit={resetPwd} style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <label>New password</label>
          <input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} minLength={4} placeholder="Min 4 characters" />
        </div>
        <button type="submit" disabled={saving || !newPwd.trim()}>Reset password</button>
      </form>

      <div style={{ marginTop: 12 }}>
        <button
          className="action-btn danger"
          style={{ fontSize: 13, padding: "6px 14px" }}
          onClick={del}
        >
          🗑 Delete teacher
        </button>
      </div>
    </Collapsible>
  );
}

function StudentCard({ student: s, onRefresh, setError }) {
  const [form, setForm] = useState({ name: s.name, semester: s.semester, rollno: s.rollno, department: s.department || "" });
  const [newPwd, setNewPwd] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveDetails(e) {
    e.preventDefault();
    setSaving(true); setStatus("");
    try {
      await adminApi(`/students/${s.id}`, { method: "PATCH", body: { name: form.name, semester: form.semester, rollno: form.rollno, department: form.department } });
      setStatus("✓ Updated.");
      onRefresh();
    } catch (err) { setStatus(err.message); } finally { setSaving(false); }
  }

  async function resetPwd(e) {
    e.preventDefault();
    if (!newPwd.trim()) return;
    setSaving(true); setStatus("");
    try {
      await adminApi(`/students/${s.id}/reset-password`, { method: "POST", body: { newPassword: newPwd } });
      setStatus("✓ Password reset."); setNewPwd("");
    } catch (err) { setStatus(err.message); } finally { setSaving(false); }
  }

  async function del() {
    if (!confirm(`Delete student "${s.name}" (Roll ${s.rollno})?`)) return;
    try {
      await adminApi(`/students/${s.id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) { setError(err.message); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Collapsible
      head={s.name}
      meta={`Roll ${s.rollno} · ${s.semester} · ${s.department || "no dept"} · joined ${new Date(s.created_at).toLocaleDateString()}`}
    >
      {status && <p className="muted" style={{ marginBottom: 8 }}>{status}</p>}

      <form onSubmit={saveDetails}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="field" style={{ flex: "1 1 150px", margin: 0 }}>
            <label>Full name</label>
            <input value={form.name} onChange={set("name")} required />
          </div>
          <div className="field" style={{ flex: "1 1 100px", margin: 0 }}>
            <label>Semester</label>
            <input value={form.semester} onChange={set("semester")} required />
          </div>
          <div className="field" style={{ flex: "1 1 100px", margin: 0 }}>
            <label>Roll no</label>
            <input value={form.rollno} onChange={set("rollno")} required />
          </div>
          <div className="field" style={{ flex: "1 1 120px", margin: 0 }}>
            <label>Department</label>
            <input value={form.department} onChange={set("department")} />
          </div>
        </div>
        <button type="submit" disabled={saving}>Save details</button>
      </form>

      <form onSubmit={resetPwd} style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <label>New password</label>
          <input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} minLength={4} placeholder="Min 4 characters" />
        </div>
        <button type="submit" disabled={saving || !newPwd.trim()}>Reset password</button>
      </form>

      <div style={{ marginTop: 12 }}>
        <button
          className="action-btn danger"
          style={{ fontSize: 13, padding: "6px 14px" }}
          onClick={del}
        >
          🗑 Delete student
        </button>
      </div>
    </Collapsible>
  );
}
