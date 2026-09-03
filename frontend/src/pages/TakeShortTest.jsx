import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { photoToBase64 } from "../photo.js";

export default function TakeShortTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [photos, setPhotos] = useState({}); // questionId -> { file, previewUrl }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    api(`/student/short/${id}`)
      .then((data) => {
        setSet(data.set);
        setQuestions(data.questions);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function pickPhoto(qId, file) {
    if (!file) return;
    setPhotos({ ...photos, [qId]: { file, previewUrl: URL.createObjectURL(file) } });
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const answers = await Promise.all(
        questions.map(async (q) => {
          const entry = photos[q.id];
          const { base64, mimeType } = await photoToBase64(entry.file);
          return { questionId: q.id, photoBase64: base64, mimeType };
        })
      );
      const data = await api(`/student/short/${id}/submit`, { method: "POST", body: { answers } });
      setResult(data);
      setTimeout(() => navigate("/student"), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <p className="muted">Loading your paper...</p>
      </div>
    );
  }

  if (error && !questions.length) {
    return (
      <div className="app-shell">
        <div className="error-banner">{error}</div>
        <button onClick={() => navigate("/student")}>Back to dashboard</button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="app-shell">
        <h1>Submitted</h1>
        <div className="card">
          <div className="avg-badge">{result.score}/{result.total}</div>
          <p className="muted">Graded automatically. Taking you back to the dashboard...</p>
          {result.breakdown?.map((b, i) => (
            <p key={i} className="muted">Q{i + 1}: {b.marks}/{b.maxMarks} — {b.feedback}</p>
          ))}
        </div>
        <button className="secondary" onClick={() => navigate("/student")}>Back to dashboard now</button>
      </div>
    );
  }

  const allPhotographed = questions.length > 0 && questions.every((q) => photos[q.id]);

  return (
    <div className="app-shell">
      <span className="eyebrow">{set?.subject}</span>
      <h1>Write your answers on paper, then photograph each one</h1>
      {error && <div className="error-banner">{error}</div>}

      {questions.map((q, i) => (
        <div className="question-block photo-answer" key={q.id}>
          <div className="q-text">{i + 1}. {q.question_text} <span className="muted">({q.max_marks} marks)</span></div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => pickPhoto(q.id, e.target.files[0])}
          />
          {photos[q.id] && <img className="photo-preview" src={photos[q.id].previewUrl} alt={`Answer to question ${i + 1}`} />}
        </div>
      ))}

      <button onClick={submit} disabled={!allPhotographed || busy}>
        {busy ? "Grading..." : "Done — submit photos"}
      </button>
    </div>
  );
}
