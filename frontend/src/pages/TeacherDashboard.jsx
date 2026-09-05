import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, getSession, clearSession } from "../api.js";
import Collapsible from "../components/Collapsible.jsx";
import PaperReview from "../components/PaperReview.jsx";
import { toTitleCase, formatShort, paperLabel } from "../format.js";
import CompactAttendance from "../components/CompactAttendance.jsx";

export default function TeacherDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [mcqSets, setMcqSets] = useState([]);
  const [shortSets, setShortSets] = useState([]);
  const [error, setError] = useState("");
  // Three top-level buttons; the screen area below swaps between them.
  const [mainTab, setMainTab] = useState("mcq");
  const [attendanceSem, setAttendanceSem] = useState("1");
  const [showAttendance, setShowAttendance] = useState(false);

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

  async function deleteGroup(groupId) {
    if (!window.confirm("Delete this paper? This can't be undone.")) return;
    await api(`/teacher/group/${groupId}`, { method: "DELETE" });
    load();
  }

  // A paper built with BOTH MCQ-family and short-answer questions together
  // shares a group_id across its mcq_sets row and short_sets row - group
  // those into ONE combo entry here so the teacher sees and manages one
  // paper, not two. Anything without a group_id (solo MCQ-only or
  // short-only papers) stays as before.
  const groups = new Map();
  const soloPapers = [];
  for (const s of mcqSets) {
    if (s.group_id) {
      if (!groups.has(s.group_id)) groups.set(s.group_id, {});
      groups.get(s.group_id).mcq = s;
    } else {
      soloPapers.push({ ...s, kind: "mcq" });
    }
  }
  for (const s of shortSets) {
    if (s.group_id) {
      if (!groups.has(s.group_id)) groups.set(s.group_id, {});
      groups.get(s.group_id).short = s;
    } else {
      soloPapers.push({ ...s, kind: "short" });
    }
  }
  const comboPapers = Array.from(groups.entries()).map(([groupId, { mcq, short }]) => {
    const base = mcq || short;
    return {
      kind: "combo",
      groupId,
      mcq,
      short,
      subject: base.subject,
      topic: base.topic,
      semester: base.semester,
      status: base.status,
      opened_at: base.opened_at,
      created_at: base.created_at,
    };
  });

  // Merged, newest first, regardless of MCQ-family vs short-answer vs combo.
  const allPapers = [...soloPapers, ...comboPapers].sort(
    (a, b) => new Date(b.opened_at || b.created_at) - new Date(a.opened_at || a.created_at)
  );

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
        <button className={mainTab === "attendance" ? "active" : ""} onClick={() => setMainTab("attendance")}>Attendance</button>
      </div>

      {mainTab === "mcq" && (
        <>
          {allPapers.length === 0 && <p className="muted">Nothing saved yet.</p>}
          {allPapers.map((s) =>
            s.kind === "combo" ? (
              <ComboRow key={`combo-${s.groupId}`} paper={s} onUpload={load} onDelete={deleteGroup} navigate={navigate} />
            ) : s.kind === "mcq" ? (
              <McqRow key={`mcq-${s.id}`} set={s} onUpload={load} onDelete={deleteMcq} navigate={navigate} />
            ) : (
              <ShortRow key={`short-${s.id}`} set={s} onUpload={load} onDelete={deleteShort} navigate={navigate} />
            )
          )}
        </>
      )}

      {mainTab === "subject" && <SubjectPerformance />}
      {mainTab === "overall" && <OverallPerformance />}
      {mainTab === "attendance" && (
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ margin: 0 }}>Semester</label>
            <select value={attendanceSem} onChange={(e) => setAttendanceSem(e.target.value)}>
              {["1","2","3","4","5","6","7","8"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <CompactAttendance role="teacher" sem={attendanceSem} />
        </div>
      )}
    </div>
  );
}

// ─── MCQ paper row ────────────────────────────────────────────────────────────
function McqRow({ set: s, onUpload, onDelete, navigate }) {
  const [paper, setPaper] = useState(null);
  const [mode, setMode] = useState("view"); // "view" | "label" | "edit"

  async function upload() { await api(`/teacher/mcq/${s.id}/upload`, { method: "POST" }); onUpload(); }
  async function closeAndShow() { await api(`/teacher/mcq/${s.id}/close`, { method: "POST" }); navigate(`/teacher/live/${s.id}`); }
  async function reupload() { await api(`/teacher/mcq/${s.id}/upload`, { method: "POST" }); onUpload(); }
  async function togglePaper() { if (paper) return setPaper(null); const d = await api(`/teacher/mcq/${s.id}`); setPaper(d); }

  return (
    <Collapsible
      head={paperLabel(s.subject, s.topic)}
      meta={`Sem ${s.semester} · ${formatShort(s.opened_at || s.created_at)} · status: ${s.status} · ${s.total_marks} marks`}
      done={s.status === "closed"}
      forceOpen={mode !== "view"}
    >
      {mode === "label" && <LabelEditor set={s} table="mcq" onDone={() => { setMode("view"); onUpload(); }} onCancel={() => setMode("view")} />}
      {mode === "edit" && <InlineMcqEditor setId={s.id} semester={s.semester} onDone={() => { setMode("view"); onUpload(); }} onCancel={() => setMode("view")} />}
      {mode === "view" && (
        <>
          <div className="actions">
            {s.status === "ready" && !s.group_id && (
              <>
                <button className="action-btn" onClick={upload}>Upload</button>
                <button className="action-btn secondary" onClick={togglePaper}>{paper ? "Hide MCQ" : "View MCQ"}</button>
              </>
            )}
            {s.status === "live" && (
              <>
                <button className="action-btn" onClick={closeAndShow}>Show Results</button>
                <button className="action-btn secondary" onClick={togglePaper}>{paper ? "Hide MCQ" : "View MCQ"}</button>
              </>
            )}
            {s.status === "closed" && (
              <>
                <button className="action-btn" onClick={reupload}>Re-upload</button>
                <Link className="action-btn btn secondary" to={`/teacher/live/${s.id}`}>View Results</Link>
                <button className="action-btn secondary" onClick={togglePaper}>{paper ? "Hide MCQ" : "View MCQ"}</button>
              </>
            )}
            {/* Edit MCQ always visible regardless of status; if part of a group, point teacher to the single group editor */}
            {!s.group_id ? (
              <button className="action-btn secondary" onClick={() => setMode("edit")}>Edit MCQ</button>
            ) : (
              <button className="action-btn secondary" onClick={() => navigate(`/teacher/build-group/${s.group_id}`)}>Edit Paper</button>
            )}
            <button className="action-btn danger" onClick={() => onDelete(s.id)}>Delete</button>
          </div>
          {paper && (
            <div className="paper-review-area">
              <PaperReview questions={paper.questions} />
            </div>
          )}
        </>
      )}
    </Collapsible>
  );
}

// ─── Inline full MCQ editor (no page navigation) ──────────────────────────────
function InlineMcqEditor({ setId, semester, onDone, onCancel }) {
  const [subj, setSubj] = useState(""); const [top, setTop] = useState(""); const [sem, setSem] = useState(semester || "");
  const [qs, setQs] = useState(null); const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/teacher/mcq/${setId}`).then(d => {
      setSubj(d.set.subject); setTop(d.set.topic || ""); setSem(d.set.semester || semester || "");
      setQs(d.questions.map(q => ({
        type: q.question_type, question: q.question_text, marks: q.marks, difficulty: q.difficulty || "medium",
        options: ["mcq","true_false"].includes(q.question_type)
          ? { A: q.option_a||"", B: q.option_b||"", C: q.option_c||"", D: q.option_d||"" } : undefined,
        correct: q.question_type !== "match" ? (q.correct_option || "") : undefined,
        pairs: q.question_type === "match"
          ? (typeof q.match_pairs === "string" ? JSON.parse(q.match_pairs||"[]") : (q.match_pairs||[])) : undefined,
      }))); setLoading(false);
    }).catch(e => { setErr(e.message); setLoading(false); });
  }, [setId]);
  const upd = (i, p) => { const c = [...qs]; c[i] = { ...c[i], ...p }; setQs(c); };
  const updOpt = (i, l, v) => { const c = [...qs]; c[i] = { ...c[i], options: { ...c[i].options, [l]: v } }; setQs(c); };
  const rmQ = (i) => setQs(qs.filter((_, x) => x !== i));
  const addQ = () => setQs([...qs, { type: "mcq", question: "", marks: 1, difficulty: "medium", options: { A:"", B:"", C:"", D:"" }, correct: "A" }]);
  async function save() {
    if (!subj.trim() || !top.trim()) return setErr("Subject and topic required.");
    if (!qs || !qs.length) return setErr("At least one question required.");
    setErr(""); setBusy(true);
    try {
      await api(`/teacher/mcq/${setId}`, { method: "PUT", body: {
        subject: subj.trim().replace(/\b\w/g, c => c.toUpperCase()),
        topic: top.trim().replace(/\b\w/g, c => c.toUpperCase()),
        semester: sem, questions: qs,
      }});
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  if (loading) return <p className="muted" style={{ padding: "12px 0" }}>Loading questions…</p>;
  const iStyle = { background: "#fff8ee", color: "var(--paper-ink)", border: "1px solid rgba(43,36,26,0.3)", borderRadius: "var(--radius)", padding: "6px 8px", fontFamily: "var(--sans)", fontSize: 15, width: "100%" };
  return (
    <div className="inline-editor-area">
      <div className="label-editor-title">✏️ Edit Paper — Questions, Options & Answers</div>
      <div style={{ fontSize: "0.78em", opacity: 0.55, marginBottom: 10 }}>Edit questions/options. Radio button = correct answer. Add or remove questions below.</div>
      {err && <div className="error-banner">{err}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="field" style={{ flex: "1 1 140px" }}><label>Subject</label><input value={subj} onChange={e => setSubj(e.target.value)} /></div>
        <div className="field" style={{ flex: "1 1 140px" }}><label>Topic</label><input value={top} onChange={e => setTop(e.target.value)} /></div>
      </div>
      <div className="questions-scroll">
        {(qs || []).map((q, i) => (
          <div key={i} className="question-block">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 11, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.1em" }}>Q{i + 1} · {q.type.replace(/_/g, " ")}</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ margin: 0, fontSize: 12, color: "var(--paper-ink)" }}>Marks</label>
                <input type="number" min="0.5" step="0.5" className="marks-input" value={q.marks} onChange={e => upd(i, { marks: Number(e.target.value) })} style={{ background: "#fff8ee", color: "var(--paper-ink)" }} />
                <button style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: "3px", padding: "4px 10px", cursor: "pointer" }} onClick={() => rmQ(i)}>✕</button>
              </div>
            </div>
            <textarea rows="2" value={q.question} onChange={e => upd(i, { question: e.target.value })} style={{ ...iStyle, marginBottom: 8, fontWeight: 600 }} />
            {q.type === "mcq" && ["A","B","C","D"].map(l => (
              <div className="option-row" key={l}>
                <input type="radio" name={`corr-${setId}-${i}`} checked={q.correct === l} onChange={() => upd(i, { correct: l })} />
                <input value={q.options?.[l] || ""} onChange={e => updOpt(i, l, e.target.value)} placeholder={`Option ${l}`} style={iStyle} />
              </div>
            ))}
            {q.type === "true_false" && ["A","B"].map(l => (
              <div className="option-row" key={l}>
                <input type="radio" name={`corr-${setId}-${i}`} checked={q.correct === l} onChange={() => upd(i, { correct: l })} />
                <label style={{ color: "var(--paper-ink)", margin: 0 }}>{l === "A" ? "True" : "False"}</label>
              </div>
            ))}
            {q.type === "fill_blank" && <div className="field"><label>Correct answer</label><input value={q.correct || ""} onChange={e => upd(i, { correct: e.target.value })} style={iStyle} /></div>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" className="action-btn secondary" onClick={() => addQ()}>+ Add Question</button>
        <button type="button" className="action-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</button>
        <button type="button" className="action-btn secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Short-answer paper row ───────────────────────────────────────────────────
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
      forceOpen={editingLabel}
    >
      {editingLabel ? (
        <LabelEditor
          set={s}
          table="short"
          onDone={() => { setEditingLabel(false); onUpload(); }}
          onCancel={() => setEditingLabel(false)}
        />
      ) : (
        <>
          <div className="actions">
            {s.status === "ready" && !s.group_id && (
              <>
                <button onClick={upload}>Upload</button>
                <button className="secondary" onClick={view}>{paper ? "Hide" : "View Questions"}</button>
                <button className="secondary" onClick={() => navigate(`/teacher/build-short/${s.id}`)}>Edit Questions</button>
              </>
            )}
            {s.status === "live" && (
              <>
                <button onClick={close}>Close &amp; grade</button>
                <button className="secondary" onClick={view}>{paper ? "Hide" : "View Questions"}</button>
              </>
            )}
            {s.status === "closed" && (
              <>
                <button onClick={reupload}>Re-upload</button>
                <Link className="btn secondary" to={`/teacher/live-short/${s.id}`}>View Results</Link>
                <button className="secondary" onClick={view}>{paper ? "Hide" : "View Questions"}</button>
                <button className="secondary" onClick={() => navigate(`/teacher/build-short/${s.id}`)}>Edit Questions</button>
              </>
            )}
            {/* If short set is part of a group, direct to single editor */}
            {!s.group_id ? (
              <button className="secondary" onClick={() => setEditingLabel(true)}>Edit Subject/Topic</button>
            ) : (
              <button className="secondary" onClick={() => navigate(`/teacher/build-group/${s.group_id}`)}>Edit Paper</button>
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
        </>
      )}
    </Collapsible>
  );
}

// ─── Combined paper row (MCQ-family + short-answer, saved as one paper) ──────
// Mirrors McqRow/ShortRow's actions but drives both halves at once via the
// /teacher/group/:groupId/* endpoints, so Upload, Close, Delete and the
// subject/topic fix each happen exactly once for the whole paper.
function ComboRow({ paper: p, onUpload, onDelete, navigate }) {
  const [detail, setDetail] = useState(null);
  const [results, setResults] = useState(null);
  const [editingLabel, setEditingLabel] = useState(false);

  async function upload() {
    await api(`/teacher/group/${p.groupId}/upload`, { method: "POST" });
    onUpload();
  }
  async function close() {
    await api(`/teacher/group/${p.groupId}/close`, { method: "POST" });
    onUpload();
  }
  async function reupload() {
    await api(`/teacher/group/${p.groupId}/upload`, { method: "POST" });
    onUpload();
  }
  async function viewPaper() {
    if (detail) return setDetail(null);
    const data = await api(`/teacher/group/${p.groupId}`);
    setDetail(data);
  }
  async function viewResults() {
    if (results) return setResults(null);
    const data = await api(`/teacher/group/${p.groupId}/results`);
    setResults(data.results);
  }

  const marksLabel = [
    p.mcq ? `${p.mcq.total_marks} MCQ marks` : null,
    p.short ? "short-answer" : null,
  ].filter(Boolean).join(" + ");

  return (
    <Collapsible
      head={`${paperLabel(p.subject, p.topic)} (MCQ + short answer)`}
      meta={`Sem ${p.semester} · ${formatShort(p.opened_at || p.created_at)} · status: ${p.status} · ${marksLabel}`}
      done={p.status === "closed"}
      forceOpen={editingLabel}
    >
      {editingLabel ? (
        <LabelEditor
          set={p}
          table="group"
          id={p.groupId}
          onDone={() => { setEditingLabel(false); onUpload(); }}
          onCancel={() => setEditingLabel(false)}
        />
      ) : (
        <>
          <div className="actions">
            {p.status === "ready" && (
              <>
                <button onClick={upload}>Upload</button>
                <button className="secondary" onClick={viewPaper}>{detail ? "Hide" : "View Paper"}</button>
                {p.mcq && <button className="secondary" onClick={() => navigate(`/teacher/build/${p.mcq.id}`)}>Edit MCQ</button>}
                {p.short && <button className="secondary" onClick={() => navigate(`/teacher/build-short/${p.short.id}`)}>Edit Short-Answer</button>}
              </>
            )}
            {p.status === "live" && (
              <>
                <button onClick={close}>Close &amp; grade</button>
                <button className="secondary" onClick={viewPaper}>{detail ? "Hide" : "View Paper"}</button>
              </>
            )}
            {p.status === "closed" && (
              <>
                <button onClick={reupload}>Re-upload</button>
                <button className="secondary" onClick={viewResults}>{results ? "Hide Results" : "View Results"}</button>
                <button className="secondary" onClick={viewPaper}>{detail ? "Hide" : "View Paper"}</button>
              </>
            )}
            <button className="secondary" onClick={() => setEditingLabel(true)}>Edit Subject/Topic</button>
            <button className="danger" onClick={() => onDelete(p.groupId)}>Delete</button>
          </div>

          {detail && (
            <div style={{ marginTop: 14 }}>
              {detail.mcq && (
                <>
                  <h3 style={{ marginTop: 0 }}>MCQ-family questions</h3>
                  <PaperReview questions={detail.mcq.questions} />
                </>
              )}
              {detail.short && (
                <>
                  <h3>Short-answer questions</h3>
                  {detail.short.questions.map((q, i) => (
                    <p key={q.id}>{i + 1}. {q.question_text} <span className="muted">({q.max_marks} marks)</span></p>
                  ))}
                </>
              )}
            </div>
          )}

          {results && (
            <div style={{ marginTop: 14 }}>
              {results.length === 0 ? (
                <p className="muted">No attempts yet.</p>
              ) : (
                <table className="scoreboard">
                  <thead>
                    <tr>
                      <th>Roll</th><th>Name</th>
                      {p.mcq && <th>MCQ</th>}
                      {p.short && <th>Short</th>}
                      <th>Combined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={r.rollno} className={i === 0 ? "winner-row" : ""}>
                        <td>{r.rollno}</td>
                        <td>{toTitleCase(r.name)}</td>
                        {p.mcq && <td>{r.mcqScore}/{r.mcqTotal}</td>}
                        {p.short && <td>{r.shortScore}/{r.shortTotal}</td>}
                        <td className="avg-col">{r.score}/{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </Collapsible>
  );
}

// ─── Inline label editor (subject/topic text only) ──────────────────────────
// Semester, date and marks are intentionally NOT editable here — teachers
// can only correct text typos. System auto-applies Title Case on save.
// `id` overrides `set.id` as the path segment - used for combo papers,
// where the editable id is a group_id rather than a single set's numeric id.
function LabelEditor({ set: s, table, id, onDone, onCancel }) {
  const targetId = id ?? s.id;
  const [subject, setSubject] = useState(s.subject);
  const [topic, setTopic] = useState(s.topic);
  // System-enforced title case: "python program" → "Python Program"
  function toTCase(str) { return str.replace(/\b\w/g, (c) => c.toUpperCase()); }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api(`/teacher/${table}/${targetId}/label`, { method: "PATCH", body: { subject: toTCase(subject.trim()), topic: toTCase(topic.trim()) } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card label-editor" style={{ marginTop: 10 }}>
      <div className="label-editor-title">✏️ Fix Subject / Topic</div>
      <div style={{ fontSize: "0.78em", opacity: 0.6, marginBottom: 8 }}>Only subject &amp; topic text can be corrected. Title Case is applied automatically by the system.</div>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label>Topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
      </div>
      <div className="label-editor-hint">
        e.g. "Pyhton" → "Python Program" · Title Case applied automatically · Scores re-group instantly.
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={save} disabled={busy || !subject.trim() || !topic.trim()}>
          {busy ? "Saving…" : "Save Correction"}
        </button>
        <button className="action-btn secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Performance helpers ──────────────────────────────────────────────────────
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

// Subject tab: per-student score%, attendance%, topic breakdown.
function subjectRows(attempts, subjectFilter) {
  const sc = attempts.filter(a => a.subject === subjectFilter);
  const totalTests = new Set(sc.map(a => a.mcq_set_id)).size;
  const topicMax = new Map();
  for (const a of sc) { const t = Number(a.total); if (!topicMax.has(a.topic) || t > topicMax.get(a.topic)) topicMax.set(a.topic, t); }
  const byS = new Map();
  for (const a of sc) {
    if (!byS.has(a.rollno)) byS.set(a.rollno, { rollno: a.rollno, name: a.name, breakdown: {}, seen: new Set() });
    const r = byS.get(a.rollno); r.seen.add(a.mcq_set_id);
    if (!r.breakdown[a.topic]) r.breakdown[a.topic] = { score: 0, total: 0 };
    r.breakdown[a.topic].score += Number(a.score); r.breakdown[a.topic].total += Number(a.total);
  }
  return Array.from(byS.values()).map(r => {
    let score = 0, total = 0;
    for (const [k, m] of topicMax) { score += r.breakdown[k] ? r.breakdown[k].score : 0; total += m; }
    return { ...r, avg: total ? Math.round(100 * score / total) : 0, att: totalTests ? Math.round(100 * r.seen.size / totalTests) : 0 };
  }).sort((a, b) => b.avg - a.avg || b.att - a.att);
}

// Overall tab: avg of per-subject-percentages (Python 60% + SE 70% = 65%) + avg attendance.
function overallRows(attempts) {
  const subjects = [...new Set(attempts.map(a => a.subject))];
  const sData = {};
  for (const subj of subjects) {
    const sc = attempts.filter(a => a.subject === subj);
    const totalTests = new Set(sc.map(a => a.mcq_set_id)).size;
    const topicMax = new Map();
    for (const a of sc) { const t = Number(a.total); if (!topicMax.has(a.topic) || t > topicMax.get(a.topic)) topicMax.set(a.topic, t); }
    const totalMarks = [...topicMax.values()].reduce((s, v) => s + v, 0);
    const sts = new Map();
    for (const a of sc) {
      if (!sts.has(a.rollno)) sts.set(a.rollno, { rollno: a.rollno, name: a.name, score: 0, seen: new Set() });
      const r = sts.get(a.rollno); r.score += Number(a.score); r.seen.add(a.mcq_set_id);
    }
    sData[subj] = { totalTests, totalMarks, students: sts };
  }
  const allSt = new Map();
  for (const subj of subjects) {
    for (const [rn, sd] of sData[subj].students) {
      if (!allSt.has(rn)) allSt.set(rn, { rollno: sd.rollno, name: sd.name, breakdown: {} });
      const { totalTests, totalMarks } = sData[subj];
      allSt.get(rn).breakdown[subj] = {
        pct: totalMarks ? Math.round(100 * sd.score / totalMarks) : 0,
        att: totalTests ? Math.round(100 * sd.seen.size / totalTests) : 0,
      };
    }
  }
  return Array.from(allSt.values()).map(r => {
    const pcts = subjects.map(s => r.breakdown[s] ? r.breakdown[s].pct : 0);
    const atts = subjects.map(s => r.breakdown[s] ? r.breakdown[s].att : 0);
    return { ...r, avgPct: Math.round(pcts.reduce((a, b) => a + b, 0) / subjects.length), avgAtt: Math.round(atts.reduce((a, b) => a + b, 0) / subjects.length) };
  }).sort((a, b) => b.avgPct - a.avgPct);
}

function attCls(p) { return p >= 75 ? "att-good" : p >= 50 ? "att-warn" : "att-low"; }

// ─── Subject Performance tab ──────────────────────────────────────────────────
function SubjectPerformance() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(null);
  const [renamingSubject, setRenamingSubject] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState("");

  function load() { api("/teacher/scores/detailed").then(d => setAttempts(d.attempts)).catch(e => setError(e.message)); }
  useEffect(() => { load(); }, []);

  async function saveRename() {
    if (!renameVal.trim()) { setRenamingSubject(null); return; }
    const newName = renameVal.trim().replace(/\b\w/g, c => c.toUpperCase());
    setRenameBusy(true); setRenameError("");
    try {
      await api("/teacher/rename-subject", { method: "PATCH", body: { oldSubject: renamingSubject, newSubject: newName } });
      setSubject(newName); setRenamingSubject(null); load();
    } catch (e) { setRenameError(e.message); } finally { setRenameBusy(false); }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!attempts.length) return <p className="muted">No attempts recorded yet.</p>;

  const norm = attempts.map(a => ({ ...a, subject: a.subject.replace(/\b\w/g, c => c.toUpperCase()) }));
  const subjects = [...new Set(norm.map(a => a.subject))].sort();
  const activeSubject = subject || subjects[0];
  const rows = subjectRows(norm, activeSubject);
  const topics = latestFirst(norm, activeSubject, "topic");

  return (
    <>
      <div className="subject-picker">
        {subjects.map(subj => (
          <span key={subj} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <button className={activeSubject === subj ? "active" : ""} onClick={() => setSubject(subj)}>{subj}</button>
            <button className="icon-edit-btn" title={`Rename "${subj}"`} onClick={e => { e.stopPropagation(); setRenamingSubject(subj); setRenameVal(subj); setRenameError(""); }}>✏️</button>
          </span>
        ))}
      </div>
      {renamingSubject && (
        <div className="card" style={{ marginTop: 10, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: "0.9em" }}>✏️ Rename: <em>{renamingSubject}</em></div>
          {renameError && <div className="error-banner">{renameError}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus style={{ flex: "1 1 160px" }} onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenamingSubject(null); }} />
            <button onClick={saveRename} disabled={renameBusy || !renameVal.trim()}>{renameBusy ? "Saving…" : "Save"}</button>
            <button className="secondary" onClick={() => setRenamingSubject(null)}>Cancel</button>
          </div>
        </div>
      )}
      {!rows.length ? <p className="muted">No attempts for {activeSubject} yet.</p> : (
        <table className="scoreboard">
          <thead><tr>
            <th>Roll</th><th>Name</th><th title="Attendance %">Att%</th><th>Avg%</th>
            {topics.map(t => <th key={t}>{t}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.rollno} className={i === 0 ? "winner-row" : ""}>
                <td>{r.rollno}</td><td>{toTitleCase(r.name)}</td>
                <td className={`att-col ${attCls(r.att)}`}>{r.att}%</td>
                <td className="avg-col">{r.avg}%</td>
                {topics.map(t => <td key={t}>{r.breakdown[t] ? `${r.breakdown[t].score}/${r.breakdown[t].total}` : <span className="absent-dash" title="Absent">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ─── Overall Performance tab ──────────────────────────────────────────────────
// Avg = mean of per-subject percentages (Python 60% + SE 70% = 65%).
// Att% = mean of per-subject attendance percentages.
function OverallPerformance() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { api("/teacher/scores/detailed").then(d => setAttempts(d.attempts)).catch(e => setError(e.message)); }, []);
  if (error) return <div className="error-banner">{error}</div>;
  if (!attempts.length) return <p className="muted">No attempts recorded yet.</p>;
  const norm = attempts.map(a => ({ ...a, subject: a.subject.replace(/\b\w/g, c => c.toUpperCase()) }));
  const subjects = [...new Set(norm.map(a => a.subject))].sort();
  const rows = overallRows(norm);
  return (
    <table className="scoreboard">
      <thead><tr>
        <th>Roll</th><th>Name</th><th title="Avg attendance across subjects">Att%</th><th title="Avg % across subjects">Avg%</th>
        {subjects.map(s => <th key={s}>{s}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.rollno} className={i === 0 ? "winner-row" : ""}>
            <td>{r.rollno}</td><td>{toTitleCase(r.name)}</td>
            <td className={`att-col ${attCls(r.avgAtt)}`}>{r.avgAtt}%</td>
            <td className="avg-col">{r.avgPct}%</td>
            {subjects.map(s => (
              <td key={s}>{r.breakdown[s]
                ? <span className={r.breakdown[s].pct >= 50 ? "att-good" : "att-low"}>{r.breakdown[s].pct}%</span>
                : <span className="absent-dash">—</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

