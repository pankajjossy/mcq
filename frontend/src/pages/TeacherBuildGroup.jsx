import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import PaperReview from "../components/PaperReview.jsx";

export default function TeacherBuildGroup() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mcq, setMcq] = useState(null);
  const [short, setShort] = useState(null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [semester, setSemester] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/teacher/group/${groupId}`).then(d => {
      setMcq(d.mcq?.set || null);
      setShort(d.short?.set || null);
      setSubject((d.mcq?.set || d.short?.set || {}).subject || "");
      setTopic((d.mcq?.set || d.short?.set || {}).topic || "");
      setSemester((d.mcq?.set || d.short?.set || {}).semester || "");
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [groupId]);

  async function saveAll() {
    setError("");
    try {
      if (mcq) {
        await api(`/teacher/mcq/${mcq.id}`, { method: "PUT", body: { subject, topic, semester, questions: mcq.questions || [] } });
      }
      if (short) {
        await api(`/teacher/short/${short.id}`, { method: "PUT", body: { subject, topic, semester, questions: short.questions || [] } });
      }
      // Also update group label
      await api(`/teacher/group/${groupId}/label`, { method: "PATCH", body: { subject, topic } });
      navigate("/teacher");
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="app-shell"><p className="muted">Loading paper…</p></div>;

  return (
    <div className="app-shell">
      <span className="eyebrow">Edit Combined Paper</span>
      <h1>Edit Paper — MCQ + Short Answer</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field"><label>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} /></div>
        <div className="field"><label>Topic</label><input value={topic} onChange={e => setTopic(e.target.value)} /></div>
        <div className="field"><label>Semester</label><input value={semester} onChange={e => setSemester(e.target.value)} /></div>

        {mcq && (
          <div style={{ marginTop: 12 }}>
            <h3>MCQ questions</h3>
            <PaperReview questions={mcq.questions || []} editable onChange={(qs) => setMcq({ ...mcq, questions: qs })} />
            <div style={{ marginTop: 8 }}>
              <button className="secondary" onClick={() => navigate(`/teacher/build/${mcq.id}`)}>Open full MCQ editor</button>
            </div>
          </div>
        )}

        {short && (
          <div style={{ marginTop: 12 }}>
            <h3>Short-answer questions</h3>
            {short.questions?.map((q, i) => (
              <div key={q.id} style={{ marginBottom: 8 }}>
                <textarea value={q.question_text} onChange={e => {
                  const copy = [...(short.questions || [])]; copy[i] = { ...copy[i], question_text: e.target.value }; setShort({ ...short, questions: copy });
                }} rows={2} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ margin: 0 }}>Marks</label>
                  <input type="number" value={q.max_marks} onChange={e => { const copy = [...(short.questions || [])]; copy[i] = { ...copy[i], max_marks: Number(e.target.value) }; setShort({ ...short, questions: copy }); }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <button className="secondary" onClick={() => navigate(`/teacher/build-short/${short.id}`)}>Open full Short-editor</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={saveAll}>Save All</button>
          <button className="secondary" onClick={() => navigate('/teacher')}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
