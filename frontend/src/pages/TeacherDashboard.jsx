import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, getSession, clearSession } from "../api.js";
import Collapsible from "../components/Collapsible.jsx";
import PaperReview from "../components/PaperReview.jsx";

function formatWhen(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function TeacherDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [mcqSets, setMcqSets] = useState([]);
  const [shortSets, setShortSets] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("subjectwise");

  useEffect(() => {
    if (!session || session.role !== "teacher") return navigate("/");
    load();
  }, []);

  async function load() {
    try {
      const [mcq, short] = await Promise.all([api("/teacher/mcq"), api("/teacher/short")]);
      setMcqSets(mcq.sets);
      setShortSets(short.sets);
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    clearSession();
    navigate("/");
  }

  async function deleteMcq(id) {
    if (!window.confirm("Delete this paper? This can't be undone.")) return;
    await api(`/teacher/mcq/${id}`, { method: "DELETE" });
    load();
  }

  async function deleteShort(id) {
    if (!window.confirm("Delete this paper? This can't be undone.")) return;
    await api(`/teacher/short/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">Teacher Dashboard</span>
          <h1>{session?.user?.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn secondary" to={`/wall/${session?.user?.id}`}>My Wall</Link>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <Link className="btn" to="/teacher/build">+ New MCQ Paper</Link>
        <Link className="btn secondary" to="/teacher/build-short">+ New Short-Answer Paper</Link>
      </div>

      <h2>Your papers</h2>
      {mcqSets.length === 0 && shortSets.length === 0 && <p className="muted">Nothing saved yet.</p>}

      {mcqSets.map((s) => (
        <McqRow key={`mcq-${s.id}`} set={s} onUpload={load} onDelete={deleteMcq} navigate={navigate} />
      ))}
      {shortSets.map((s) => (
        <ShortRow key={`short-${s.id}`} set={s} onUpload={load} onDelete={deleteShort} navigate={navigate} />
      ))}

      <div className="tabs">
        <button className={tab === "subjectwise" ? "active" : ""} onClick={() => setTab("subjectwise")}>Subject-wise performance</button>
        <button className={tab === "overall" ? "active" : ""} onClick={() => setTab("overall")}>Overall performance</button>
      </div>
      {tab === "subjectwise" ? <ScorePivot /> : <OverallPerformance />}
    </div>
  );
}

function McqRow({ set: s, onUpload, onDelete, navigate }) {
  const [paper, setPaper] = useState(null);

  async function upload() {
    await api(`/teacher/mcq/${s.id}/upload`, { method: "POST" });
    onUpload();
  }
  async function closeAndShow() {
    await api(`/teacher/mcq/${s.id}/close`, { method: "POST" });
    navigate(`/teacher/live/${s.id}`);
  }
  async function view() {
    if (paper) return setPaper(null);
    const data = await api(`/teacher/mcq/${s.id}`);
    setPaper(data);
  }

  return (
    <Collapsible
      head={`${s.semester} ${s.subject}`}
      meta={`${formatWhen(s.opened_at || s.created_at)} · status: ${s.status} · ${s.total_marks} marks`}
      done={s.status === "closed"}
    >
      <div className="actions">
        {s.status === "ready" && (
          <>
            <button onClick={upload}>Upload</button>
            <button className="secondary" onClick={view}>{paper ? "Hide" : "View"}</button>
            <button className="secondary" onClick={() => navigate(`/teacher/build/${s.id}`)}>Edit</button>
          </>
        )}
        {s.status === "live" && <button onClick={closeAndShow}>Show Results</button>}
        {s.status === "closed" && <Link className="btn" to={`/teacher/live/${s.id}`}>View Results</Link>}
        <button className="danger" onClick={() => onDelete(s.id)}>Delete</button>
      </div>
      {paper && <div style={{ marginTop: 14 }}><PaperReview questions={paper.questions} /></div>}
    </Collapsible>
  );
}

function ShortRow({ set: s, onUpload, onDelete, navigate }) {
  const [paper, setPaper] = useState(null);

  async function upload() {
    await api(`/teacher/short/${s.id}/upload`, { method: "POST" });
    onUpload();
  }
  async function close() {
    await api(`/teacher/short/${s.id}/close`, { method: "POST" });
    onUpload();
  }
  async function view() {
    if (paper) return setPaper(null);
    const data = await api(`/teacher/short/${s.id}`);
    setPaper(data);
  }

  return (
    <Collapsible
      head={`${s.semester} ${s.subject} (short answer)`}
      meta={`${formatWhen(s.opened_at || s.created_at)} · status: ${s.status}`}
      done={s.status === "closed"}
    >
      <div className="actions">
        {s.status === "ready" && (
          <>
            <button onClick={upload}>Upload</button>
            <button className="secondary" onClick={view}>{paper ? "Hide" : "View"}</button>
            <button className="secondary" onClick={() => navigate(`/teacher/build-short/${s.id}`)}>Edit</button>
          </>
        )}
        {s.status === "live" && <button onClick={close}>Close & grade</button>}
        {s.status === "closed" && <Link className="btn" to={`/teacher/live-short/${s.id}`}>View Results</Link>}
        <button className="danger" onClick={() => onDelete(s.id)}>Delete</button>
      </div>
      {paper && (
        <div style={{ marginTop: 14 }}>
          {paper.questions.map((q, i) => (
            <p key={q.id}>{i + 1}. {q.question_text} <span className="muted">({q.max_marks} marks)</span></p>
          ))}
        </div>
      )}
    </Collapsible>
  );
}

// Avg column first, then one column per test - newest first, dated by
// when that paper was uploaded.
function ScorePivot() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/teacher/scores/detailed").then((d) => setAttempts(d.attempts)).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (attempts.length === 0) return <p className="muted">No attempts recorded yet.</p>;

  const groups = {};
  for (const a of attempts) {
    const key = `${a.subject}|${a.semester}`;
    (groups[key] ||= { subject: a.subject, semester: a.semester, tests: new Map(), students: new Map() }).tests.set(
      a.mcq_set_id,
      a.opened_at
    );
    const g = groups[key];
    if (!g.students.has(a.rollno)) g.students.set(a.rollno, { name: a.name, byTest: {} });
    g.students.get(a.rollno).byTest[a.mcq_set_id] = { score: a.score, total: a.total };
  }

  return (
    <>
      {Object.values(groups).map((g, gi) => {
        const testIds = [...g.tests.entries()].sort((a, b) => new Date(b[1]) - new Date(a[1]));
        return (
          <div key={gi} style={{ marginBottom: 24 }}>
            <h3>{g.semester} {g.subject}</h3>
            <table className="scoreboard">
              <thead>
                <tr>
                  <th>Roll</th><th>Name</th><th>Avg</th>
                  {testIds.map(([id, openedAt]) => <th key={id}>{new Date(openedAt).toLocaleDateString()}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...g.students.entries()].map(([rollno, s]) => {
                  const attemptsForStudent = Object.values(s.byTest);
                  const totalScore = attemptsForStudent.reduce((sum, a) => sum + Number(a.score), 0);
                  const totalPossible = attemptsForStudent.reduce((sum, a) => sum + Number(a.total), 0);
                  const avg = totalPossible ? Math.round((100 * totalScore) / totalPossible) : 0;
                  return (
                    <tr key={rollno}>
                      <td>{rollno}</td><td>{s.name}</td><td className="avg-col">{avg}%</td>
                      {testIds.map(([id]) => (
                        <td key={id}>{s.byTest[id] ? `${s.byTest[id].score}/${s.byTest[id].total}` : "—"}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

// Every subject combined per student - one row, one avg, one paper count.
function OverallPerformance() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/teacher/scores/detailed").then((d) => setAttempts(d.attempts)).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (attempts.length === 0) return <p className="muted">No attempts recorded yet.</p>;

  const byStudent = {};
  for (const a of attempts) {
    if (!byStudent[a.rollno]) byStudent[a.rollno] = { name: a.name, score: 0, total: 0, papers: 0 };
    byStudent[a.rollno].score += Number(a.score);
    byStudent[a.rollno].total += Number(a.total);
    byStudent[a.rollno].papers += 1;
  }

  return (
    <table className="scoreboard">
      <thead>
        <tr><th>Roll</th><th>Name</th><th>Avg</th><th>Papers Appeared</th><th>Total Score</th></tr>
      </thead>
      <tbody>
        {Object.entries(byStudent).map(([rollno, s]) => (
          <tr key={rollno}>
            <td>{rollno}</td><td>{s.name}</td>
            <td className="avg-col">{s.total ? Math.round((100 * s.score) / s.total) : 0}%</td>
            <td>{s.papers}</td>
            <td>{s.score}/{s.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
