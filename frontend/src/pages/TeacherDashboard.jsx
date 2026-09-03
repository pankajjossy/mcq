import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, getSession, clearSession } from "../api.js";
import Collapsible from "../components/Collapsible.jsx";
import PaperReview from "../components/PaperReview.jsx";
import { toTitleCase, formatShort, paperLabel } from "../format.js";

export default function TeacherDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [mcqSets, setMcqSets] = useState([]);
  const [shortSets, setShortSets] = useState([]);
  const [error, setError] = useState("");
  // Three top-level buttons; the screen area below swaps between them.
  const [mainTab, setMainTab] = useState("mcq");

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

  // Merged, newest first, regardless of MCQ-family vs short-answer - "MCQ"
  // here means "your papers" in the everyday sense the teacher uses it.
  const allPapers = [
    ...mcqSets.map((s) => ({ ...s, kind: "mcq" })),
    ...shortSets.map((s) => ({ ...s, kind: "short" })),
  ].sort((a, b) => new Date(b.opened_at || b.created_at) - new Date(a.opened_at || a.created_at));

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">Teacher Dashboard</span>
          <h1>{toTitleCase(session?.user?.name)}</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn secondary" to={`/wall/${session?.user?.id}`}>My Wall</Link>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <Link className="btn" to="/teacher/build">+ New Paper</Link>
      </div>

      <div className="main-nav">
        <button className={mainTab === "mcq" ? "active" : ""} onClick={() => setMainTab("mcq")}>MCQ</button>
        <button className={mainTab === "subject" ? "active" : ""} onClick={() => setMainTab("subject")}>Subject Performance</button>
        <button className={mainTab === "overall" ? "active" : ""} onClick={() => setMainTab("overall")}>Overall Performance</button>
      </div>

      {mainTab === "mcq" && (
        <>
          {allPapers.length === 0 && <p className="muted">Nothing saved yet.</p>}
          {allPapers.map((s) =>
            s.kind === "mcq" ? (
              <McqRow key={`mcq-${s.id}`} set={s} onUpload={load} onDelete={deleteMcq} navigate={navigate} />
            ) : (
              <ShortRow key={`short-${s.id}`} set={s} onUpload={load} onDelete={deleteShort} navigate={navigate} />
            )
          )}
        </>
      )}

      {mainTab === "subject" && <SubjectPerformance />}
      {mainTab === "overall" && <OverallPerformance />}
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
      head={paperLabel(s.subject, s.topic)}
      meta={`Sem ${s.semester} · ${formatShort(s.opened_at || s.created_at)} · status: ${s.status} · ${s.total_marks} marks`}
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
        {s.status === "closed" && (
          <>
            <Link className="btn" to={`/teacher/live/${s.id}`}>View Results</Link>
            <button className="secondary" onClick={upload}>Re-upload to landing page</button>
          </>
        )}
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
      head={`${paperLabel(s.subject, s.topic)} (short answer)`}
      meta={`Sem ${s.semester} · ${formatShort(s.opened_at || s.created_at)} · status: ${s.status}`}
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
        {s.status === "closed" && (
          <>
            <Link className="btn" to={`/teacher/live-short/${s.id}`}>View Results</Link>
            <button className="secondary" onClick={upload}>Re-upload to landing page</button>
          </>
        )}
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

// Order a set of keys (topics or subjects) by when each one first appeared
// (earliest opened_at), not alphabetically - e.g. for Python: List, then
// Tuple, then Sets, in the order the teacher actually ran those papers.
function orderByFirstAppearance(attempts, keyField, keys) {
  const firstSeen = new Map();
  for (const a of attempts) {
    const k = a[keyField] || "—";
    if (!keys.includes(k)) continue;
    const t = new Date(a.opened_at).getTime();
    if (!firstSeen.has(k) || t < firstSeen.get(k)) firstSeen.set(k, t);
  }
  return [...keys].sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0));
}

// Shared: given the raw /teacher/scores/detailed feed, aggregate one row
// per student, optionally scoped to a single subject, with a breakdown
// column per key (topic when scoped to a subject, subject when overall).
function aggregate(attempts, { subjectFilter, keyField }) {
  const byStudent = new Map();
  for (const a of attempts) {
    if (subjectFilter && a.subject !== subjectFilter) continue;
    const key = a.rollno;
    if (!byStudent.has(key)) {
      byStudent.set(key, { rollno: a.rollno, name: a.name, score: 0, total: 0, breakdown: {} });
    }
    const row = byStudent.get(key);
    row.score += Number(a.score);
    row.total += Number(a.total);
    const bKey = a[keyField] || "—";
    if (!row.breakdown[bKey]) row.breakdown[bKey] = { score: 0, total: 0 };
    row.breakdown[bKey].score += Number(a.score);
    row.breakdown[bKey].total += Number(a.total);
  }
  const rows = Array.from(byStudent.values()).map((r) => ({
    ...r,
    avg: r.total ? Math.round((100 * r.score) / r.total) : 0,
  }));
  // Best performer on top.
  rows.sort((x, y) => y.avg - x.avg || y.score - x.score);
  return rows;
}

// Button per subject the teacher has ever run a paper for -> pick one ->
// avg (first) then a column per topic within that subject, best on top.
function SubjectPerformance() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(null);

  useEffect(() => {
    api("/teacher/scores/detailed").then((d) => setAttempts(d.attempts)).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (attempts.length === 0) return <p className="muted">No attempts recorded yet.</p>;

  const subjects = orderByFirstAppearance(attempts, "subject", [...new Set(attempts.map((a) => a.subject))]);
  const activeSubject = subject || subjects[0];
  const rows = aggregate(attempts, { subjectFilter: activeSubject, keyField: "topic" });
  const topics = orderByFirstAppearance(
    attempts.filter((a) => a.subject === activeSubject),
    "topic",
    [...new Set(rows.flatMap((r) => Object.keys(r.breakdown)))]
  );

  return (
    <>
      <div className="subject-picker">
        {subjects.map((subj) => (
          <button key={subj} className={activeSubject === subj ? "active" : ""} onClick={() => setSubject(subj)}>
            {subj}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted">No attempts recorded yet for {activeSubject}.</p>
      ) : (
        <table className="scoreboard">
          <thead>
            <tr>
              <th>Roll</th><th>Name</th><th>Avg</th>
              {topics.map((t) => <th key={t}>{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.rollno} className={i === 0 ? "winner-row" : ""}>
                <td>{r.rollno}</td>
                <td>{toTitleCase(r.name)}</td>
                <td className="avg-col">{r.avg}%</td>
                {topics.map((t) => (
                  <td key={t}>{r.breakdown[t] ? `${r.breakdown[t].score}/${r.breakdown[t].total}` : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// Every subject combined per student - avg first, then a column per
// subject, best performer on top.
function OverallPerformance() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/teacher/scores/detailed").then((d) => setAttempts(d.attempts)).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (attempts.length === 0) return <p className="muted">No attempts recorded yet.</p>;

  const rows = aggregate(attempts, { subjectFilter: null, keyField: "subject" });
  const subjects = orderByFirstAppearance(attempts, "subject", [...new Set(rows.flatMap((r) => Object.keys(r.breakdown)))]);

  return (
    <table className="scoreboard">
      <thead>
        <tr>
          <th>Roll</th><th>Name</th><th>Avg</th>
          {subjects.map((subj) => <th key={subj}>{subj}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.rollno} className={i === 0 ? "winner-row" : ""}>
            <td>{r.rollno}</td>
            <td>{toTitleCase(r.name)}</td>
            <td className="avg-col">{r.avg}%</td>
            {subjects.map((subj) => (
              <td key={subj}>{r.breakdown[subj] ? `${r.breakdown[subj].score}/${r.breakdown[subj].total}` : "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
