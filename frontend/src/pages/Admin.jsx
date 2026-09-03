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
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);

  useEffect(() => { load(); }, []);

  function load() {
    adminApi("/teachers").then((d) => setTeachers(d.teachers)).catch((err) => setError(err.message));
    adminApi("/students").then((d) => setStudents(d.students)).catch((err) => setError(err.message));
  }

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
          <div style={{ margin: "18px 0" }}>
            <button className="secondary" onClick={() => setShowAddTeacher((v) => !v)}>
              {showAddTeacher ? "Cancel" : "+ Add teacher"}
            </button>
          </div>
          {showAddTeacher && (
            <AddTeacherForm
              onCreated={() => { setShowAddTeacher(false); load(); }}
              onError={setError}
            />
          )}

          {!teachers && <p className="muted">Loading…</p>}
          {teachers?.length === 0 && <p className="muted">No teacher accounts yet.</p>}
          {teachers?.map((t) => (
            <Collapsible key={t.id} head={t.name} meta={`${t.login_name} · joined ${new Date(t.created_at).toLocaleDateString()}`}>
              <EditTeacherForm teacher={t} onSaved={load} onError={setError} />
              <ResetPasswordForm table="teachers" id={t.id} />
              <DeleteAccountButton table="teachers" id={t.id} label={t.name} onDeleted={load} onError={setError} />
            </Collapsible>
          ))}
        </>
      )}

      {tab === "students" && (
        <>
          <div style={{ margin: "18px 0" }}>
            <button className="secondary" onClick={() => setShowAddStudent((v) => !v)}>
              {showAddStudent ? "Cancel" : "+ Add student"}
            </button>
          </div>
          {showAddStudent && (
            <AddStudentForm
              onCreated={() => { setShowAddStudent(false); load(); }}
              onError={setError}
            />
          )}

          {!students && <p className="muted">Loading…</p>}
          {students?.length === 0 && <p className="muted">No student accounts yet.</p>}
          {students?.map((s) => (
            <Collapsible
              key={s.id}
              head={s.name}
              meta={`${s.semester} · Roll ${s.rollno} · joined ${new Date(s.created_at).toLocaleDateString()}`}
            >
              <EditStudentForm student={s} onSaved={load} onError={setError} />
              <ResetPasswordForm table="students" id={s.id} />
              <DeleteAccountButton table="students" id={s.id} label={s.name} onDeleted={load} onError={setError} />
            </Collapsible>
          ))}
        </>
      )}
    </div>
  );
}

function AddTeacherForm({ onCreated, onError }) {
  const [form, setForm] = useState({ name: "", loginName: "", password: "" });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    onError("");
    try {
      await adminApi("/teachers", { method: "POST", body: form });
      onCreated();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label>Name</label>
        <input value={form.name} onChange={set("name")} required />
      </div>
      <div className="field">
        <label>Login name</label>
        <input value={form.loginName} onChange={set("loginName")} required />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="text" value={form.password} onChange={set("password")} required minLength={4} />
      </div>
      <button type="submit">Create teacher</button>
    </form>
  );
}

function AddStudentForm({ onCreated, onError }) {
  const [form, setForm] = useState({ name: "", semester: "", rollno: "", password: "" });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    onError("");
    try {
      await adminApi("/students", { method: "POST", body: form });
      onCreated();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label>Name</label>
        <input value={form.name} onChange={set("name")} required />
      </div>
      <div className="field">
        <label>Semester</label>
        <input value={form.semester} onChange={set("semester")} placeholder="e.g. Sem 3" required />
      </div>
      <div className="field">
        <label>Roll number</label>
        <input value={form.rollno} onChange={set("rollno")} required />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="text" value={form.password} onChange={set("password")} required minLength={4} />
      </div>
      <button type="submit">Create student</button>
    </form>
  );
}

function EditTeacherForm({ teacher, onSaved, onError }) {
  const [name, setName] = useState(teacher.name);
  const [loginName, setLoginName] = useState(teacher.login_name);
  const [status, setStatus] = useState("");

  async function submit(e) {
    e.preventDefault();
    setStatus("");
    onError("");
    try {
      await adminApi(`/teachers/${teacher.id}`, { method: "PUT", body: { name, loginName } });
      setStatus("Saved.");
      onSaved();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <form onSubmit={submit} className="actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 14 }}>
      <label style={{ margin: 0 }}>Edit details</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="Login name" required />
        <button type="submit">Save</button>
      </div>
      {status && <span className="muted">{status}</span>}
    </form>
  );
}

function EditStudentForm({ student, onSaved, onError }) {
  const [name, setName] = useState(student.name);
  const [semester, setSemester] = useState(student.semester);
  const [rollno, setRollno] = useState(student.rollno);
  const [status, setStatus] = useState("");

  async function submit(e) {
    e.preventDefault();
    setStatus("");
    onError("");
    try {
      await adminApi(`/students/${student.id}`, { method: "PUT", body: { name, semester, rollno } });
      setStatus("Saved.");
      onSaved();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <form onSubmit={submit} className="actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 14 }}>
      <label style={{ margin: 0 }}>Edit details</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Semester" required />
        <input value={rollno} onChange={(e) => setRollno(e.target.value)} placeholder="Roll number" required />
        <button type="submit">Save</button>
      </div>
      {status && <span className="muted">{status}</span>}
    </form>
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
    <form onSubmit={submit} className="actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 14 }}>
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

function DeleteAccountButton({ table, id, label, onDeleted, onError }) {
  async function del() {
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    onError("");
    try {
      await adminApi(`/${table}/${id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      onError(err.message);
    }
  }

  return <button className="danger" onClick={del}>Delete account</button>;
}
