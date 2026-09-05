import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { photoToBase64 } from "../photo.js";

export default function TakeGroupTest() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mcqSet, setMcqSet] = useState(null);
  const [shortSet, setShortSet] = useState(null);
  const [mcqQuestions, setMcqQuestions] = useState([]);
  const [shortQuestions, setShortQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [photos, setPhotos] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    api(`/student/group/${groupId}`)
      .then((data) => {
        setMcqSet(data.mcq?.set || null);
        setMcqQuestions(data.mcq?.questions || []);
        setShortSet(data.short?.set || null);
        setShortQuestions(data.short?.questions || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [groupId]);

  function choose(qId, letter) {
    setAnswers({ ...answers, [qId]: letter });
  }
  function typeAnswer(qId, text) {
    setAnswers({ ...answers, [qId]: text });
  }
  function matchPick(qId, left, right) {
    setAnswers({ ...answers, [qId]: { ...(answers[qId] || {}), [left]: right } });
  }

  function pickPhoto(qId, file) {
    if (!file) return;
    setPhotos({ ...photos, [qId]: { file, previewUrl: URL.createObjectURL(file) } });
  }

  function isAnswered(q) {
    const a = answers[q.id];
    if (q.question_type === "match") {
      return a && (q.match_left || []).every((l) => a[l]);
    }
    return a !== undefined && a !== "";
  }

  const allMcqAnswered = mcqQuestions.length === 0 || mcqQuestions.every(isAnswered);
  const allShortPhotographed = shortQuestions.length === 0 || shortQuestions.every((q) => photos[q.id]);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const mcqPayload = mcqQuestions.map((q) => {
        if (q.question_type === "match") {
          const a = answers[q.id] || {};
          return { questionId: q.id, matchAnswer: Object.entries(a).map(([left, right]) => ({ left, right })) };
        }
        return { questionId: q.id, selected: answers[q.id] };
      });

      const shortPayload = await Promise.all(
        shortQuestions.map(async (q) => {
          const entry = photos[q.id];
          const { base64, mimeType } = await photoToBase64(entry.file);
          return { questionId: q.id, photoBase64: base64, mimeType };
        })
      );

      const data = await api(`/student/group/${groupId}/submit`, { method: "POST", body: { mcqAnswers: mcqPayload, shortAnswers: shortPayload } });
      setResult(data);
      setTimeout(() => navigate("/student"), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="app-shell"><p className="muted">Loading paper...</p></div>
  );
  if (error && !mcqQuestions.length && !shortQuestions.length) return (
    <div className="app-shell"><div className="error-banner">{error}</div><button onClick={() => navigate("/student")}>Back</button></div>
  );

  if (result) {
    return (
      <div className="app-shell">
        <h1>Submitted</h1>
        <div className="card">
          <div className="avg-badge">{(result.mcq?.score || 0) + (result.short?.score || 0)}/{(result.mcq?.total || 0) + (result.short?.total || 0)}</div>
          <p className="muted">Your combined paper has been recorded. Returning to dashboard…</p>
        </div>
        <button className="secondary" onClick={() => navigate("/student")}>Back to dashboard now</button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <span className="eyebrow" style={{ margin: 0 }}>{mcqSet?.subject || shortSet?.subject}</span>
      </div>
      <h1 style={{ marginTop: 0 }}>Answer sheet</h1>
      {error && <div className="error-banner">{error}</div>}

      {mcqQuestions.map((q, i) => (
        <div className="question-block" key={q.id}>
          <div className="q-text">{i + 1}. {q.question_text}</div>

          {(q.question_type === "mcq" || q.question_type === "true_false") &&
            ["A","B","C","D"].filter((letter) => q[`option_${letter.toLowerCase()}`]).map((letter) => (
              <div className="option-row" key={letter}>
                <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === letter} onChange={() => choose(q.id, letter)} />
                <label>{q[`option_${letter.toLowerCase()}`]}</label>
              </div>
            ))}

          {q.question_type === "fill_blank" && (
            <input value={answers[q.id] || ""} onChange={(e) => typeAnswer(q.id, e.target.value)} placeholder="Your answer" />
          )}

          {q.question_type === "match" && (q.match_left || []).map((left, li) => (
            <div className="match-row" key={li}>
              <label style={{ flex: "none", width: 160 }}>{left}</label>
              <select value={(answers[q.id] || {})[left] || ""} onChange={(e) => matchPick(q.id, left, e.target.value)}>
                <option value="">Choose...</option>
                {(q.match_right || []).map((right, ri) => (
                  <option key={ri} value={right}>{right}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ))}

      {shortQuestions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Short-answer / essay questions</h3>
          <p className="muted">Photograph your written answers for each question below.</p>
          {shortQuestions.map((q, i) => (
            <div className="question-block photo-answer" key={q.id}>
              <div className="q-text">{i + 1}. {q.question_text} <span className="muted">({q.max_marks} marks)</span></div>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => pickPhoto(q.id, e.target.files[0])} />
              {photos[q.id] && <img className="photo-preview" src={photos[q.id].previewUrl} alt={`Answer to question ${i + 1}`} />}
            </div>
          ))}
        </div>
      )}

      <button onClick={submit} disabled={!allMcqAnswered || !allShortPhotographed || busy}>{busy ? "Submitting..." : "Done — submit answers"}</button>
    </div>
  );
}
