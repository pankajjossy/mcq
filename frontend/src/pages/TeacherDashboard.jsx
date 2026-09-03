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
  const [editingLabel, setEditingLabel] = useState(false);

  async function upload() {
    await api(`/teacher/mcq/${s.id}/upload`, { method: "POST" });
    onUpload();
  }
  async function closeAndShow() {
    await api(`/teacher/mcq/${s.id}/close`, { method: "POST" });
    navigate(`/teacher/live/${s.id}`);
  }
  async function reupload() {
    // Same paper, back on the landing page for another 30 minutes - for
    // students who missed it the first time. Students who already attempted
    // it still won't see it again (the server excludes existing attempts).
    await api(`/teacher/mcq/${s.id}/upload`, { method: "POST" });
    onUpload();
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
      {editingLabel ? (
        <LabelEditor
          set={s}
          table="mcq"
          onDone={() => { setEditingLabel(false); onUpload(); }}
          onCancel={() => setEditingLabel(false)}
        />
      ) : (
        <div className="actions">
          {s.status === "ready" && (
            <>
              <button onClick={upload}>Upload</button>
              <button className="secondary" onClick={view}>{paper ? "Hide" : "View"}</button>
              <button className="secondary" onClick={() => navigate(`/teacher/build/${s.id}`)}>Edit questions</button>
            </>
          )}
          {s.status === "live" && <button onClick={closeAndShow}>Show Results</button>}
          {s.status === "closed" && (
            <>
              <Link className="btn" to={`/teacher/live/${s.id}`}>View Results</Link>
              <button className="secondary" onClick={reupload}>Re-upload</button>
            </>
          )}
          {/* Correcting a typo'd subject/topic works at any status, and
              re-groups this paper's already-recorded scores under the
              corrected subject in Subject/Overall Performance. */}
          <button className="secondary" onClick={() => setEditingLabel(true)}>Edit subject/topic</button>
          <button className="danger" onClick={() => onDelete(s.id)}>Delete</button>
        </div>
      )}
      {paper && <div style={{ marginTop: 14 }}><PaperReview questions={paper.questions} /></div>}
    </Collapsible>
  );
}

// Small inline form for fixing a subject/topic/semester typo without
// touching questions - works whether the paper is ready, live, or closed.
function LabelEditor({ set: s, table, onDone, onCancel }) {
  const [subject, setSubject] = useState(s.subject);
  const [topic, setTopic] = useState(s.topic);
  const [semester, setSemester] = useState(s.semester);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api(`/teacher/${table}/${s.id}/label`, { method: "PATCH", body: { subject, topic, semester } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label>Topic</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>
      <div className="field">
        <label>Semester</label>
        <input value={semester} onChange={(e) => setSemester(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={save} disabled={busy || !subject.trim() || !topic.trim() || !semester.trim()}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ShortRow({ set: s, onUpload, onDelete, navigate }) {
  const [paper, setPaper] = useState(null);
  const [editingLabel, setEditingLabel] = useState(false);

  async function upload() {
    await api(`/teacher/short/${s.id}/upload`, { method: "POST" });
    onUpload();
  }
  async function close() {
    await api(`/teacher/short/${s.id}/close`, { method: "POST" });
    onUpload();
  }
  async function reupload() {
    await api(`/teacher/short/${s.id}/upload`, { method: "POST" });
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
      {editingLabel ? (
        <LabelEditor
          set={s}
          table="short"
          onDone={() => { setEditingLabel(false); onUpload(); }}
          onCancel={() => setEditingLabel(false)}
        />
      ) : (
        <div className="actions">
          {s.status === "ready" && (
            <>
              <button onClick={upload}>Upload</button>
              <button className="secondary" onClick={view}>{paper ? "Hide" : "View"}</button>
              <button className="secondary" onClick={() => navigate(`/teacher/build-short/${s.id}`)}>Edit questions</button>
            </>
          )}
          {s.status === "live" && <button onClick={close}>Close & grade</button>}
          {s.status === "closed" && (
            <>
              <Link className="btn" to={`/teacher/live-short/${s.id}`}>View Results</Link>
              <button className="secondary" onClick={reupload}>Re-upload</button>
            </>
          )}
          <button className="secondary" onClick={() => setEditingLabel(true)}>Edit subject/topic</button>
          <button className="danger" onClick={() => onDelete(s.id)}>Delete</button>
        </div>
      )}
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

// Shared: given the raw /teacher/scores/detailed feed, aggregate one row
// per student, optionally scoped to a single subject, with a breakdown
// column per key (topic when scoped to a subject, subject when overall).
// A student who never attempted one of the papers in scope still counts as
// zero out of that paper's full marks in their average - it's not just
// excluded from the denominator, so a student who skipped a test doesn't
// get an inflated average from the tests they did take.
function aggregate(attempts, { subjectFilter, keyField }) {
  const scoped = subjectFilter ? attempts.filter((a) => a.subject === subjectFilter) : attempts;

  // Full marks available for each breakdown column, so every student's
  // average is measured against the same total regardless of what they
  // actually attempted.
  const keyTotals = new Map();
  for (const a of scoped) {
    const bKey = a[keyField] || "—";
    const t = Number(a.total);
    if (!keyTotals.has(bKey) || t > keyTotals.get(bKey)) keyTotals.set(bKey, t);
  }

  const byStudent = new Map();
  for (const a of scoped) {
    const key = a.rollno;
    if (!byStudent.has(key)) byStudent.set(key, { rollno: a.rollno, name: a.name, breakdown: {} });
    const row = byStudent.get(key);
    const bKey = a[keyField] || "—";
    if (!row.breakdown[bKey]) row.breakdown[bKey] = { score: 0, total: 0 };
    row.breakdown[bKey].score += Number(a.score);
    row.breakdown[bKey].total += Number(a.total);
  }

  const rows = Array.from(byStudent.values()).map((r) => {
    let score = 0;
    let total = 0;
    for (const [bKey, maxTotal] of keyTotals) {
      score += r.breakdown[bKey] ? r.breakdown[bKey].score : 0;
      total += maxTotal; // counted whether this student attempted it or not
    }
    return { ...r, score, total, avg: total ? Math.round((100 * score) / total) : 0 };
  });
  // Best performer on top.
  rows.sort((x, y) => y.avg - x.avg || y.score - x.score);
  return rows;
}

// Breakdown columns (topics within a subject, or subjects overall) are
// ordered by how recently that column's paper was run - most recent first -
// not alphabetically, so a fresh test always appears leftmost.
function latestFirst(attempts, subjectFilter, keyField) {
  const latest = new Map();
  for (const a of attempts) {
    if (subjectFilter && a.subject !== subjectFilter) continue;
    const key = a[keyField] || "—";
    const when = new Date(a.opened_at || 0).getTime();
    if (!latest.has(key) || when > latest.get(key)) latest.set(key, when);
  }
  return [...latest.keys()].sort((x, y) => latest.get(y) - latest.get(x));
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

  const subjects = [...new Set(attempts.map((a) => a.subject))].sort();
  const activeSubject = subject || subjects[0];
  const rows = aggregate(attempts, { subjectFilter: activeSubject, keyField: "topic" });
  // Most recently-run topic first (e.g. if "List" was tested most recently,
  // it leads, followed by "Tuple", then "Sets") - not alphabetical.
  const topics = latestFirst(attempts, activeSubject, "topic");

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
  const subjects = latestFirst(attempts, null, "subject");

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
