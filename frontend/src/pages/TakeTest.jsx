import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";

const LETTERS = ["A", "B", "C", "D"];

export default function TakeTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // questionId -> letter | text | { left: right, ... }
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [wallText, setWallText] = useState("");
  const [wallPosted, setWallPosted] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`/student/mcq/${id}`)
      .then((data) => {
        setSet(data.set);
        setQuestions(data.questions);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function choose(qId, letter) {
    setAnswers({ ...answers, [qId]: letter });
  }
  function typeAnswer(qId, text) {
    setAnswers({ ...answers, [qId]: text });
  }
  function matchPick(qId, left, right) {
    setAnswers({ ...answers, [qId]: { ...(answers[qId] || {}), [left]: right } });
  }

  function isAnswered(q) {
    const a = answers[q.id];
    if (q.question_type === "match") {
      return a && (q.match_left || []).every((l) => a[l]);
    }
    return a !== undefined && a !== "";
  }

  async function submit() {
    setError("");
    const payload = questions.map((q) => {
      if (q.question_type === "match") {
        const a = answers[q.id] || {};
        return { questionId: q.id, matchAnswer: Object.entries(a).map(([left, right]) => ({ left, right })) };
      }
      return { questionId: q.id, selected: answers[q.id] };
    });
    try {
      const data = await api(`/student/mcq/${id}/submit`, { method: "POST", body: { answers: payload } });
      setResult(data);
      setWallText(`Just took the ${set?.subject} test - scored ${data.score}/${data.total}!`);
      setTimeout(() => navigate("/student"), 4000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function postToWall() {
    if (!wallText.trim() || !set?.teacher_id) return;
    try {
      await api(`/wall/${set.teacher_id}/posts`, { method: "POST", body: { body: wallText, mcqSetId: Number(id) } });
      setWallPosted(true);
    } catch (err) {
      setError(err.message);
    }
  }

  // Nothing renders until we actually know whether there's a paper to show -
  // this is what stops the answer sheet (and its submit button) from
  // flashing on screen for a moment before the questions arrive.
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
          <p className="muted">Your score has been recorded. Taking you back to the dashboard...</p>
        </div>
        {!wallPosted ? (
          <div className="card">
            <h2>Tell your class</h2>
            <div className="field">
              <textarea rows="3" value={wallText} onChange={(e) => setWallText(e.target.value)} />
            </div>
            <button onClick={postToWall}>Post to class wall</button>
          </div>
        ) : (
          <p className="muted">Posted to the class wall.</p>
        )}
        <button className="secondary" onClick={() => navigate("/student")}>Back to dashboard now</button>
      </div>
    );
  }

  const allAnswered = questions.length > 0 && questions.every(isAnswered);

  return (
    <div className="app-shell">
      <span className="eyebrow">{set?.subject}</span>
      <h1>Answer sheet</h1>
      {error && <div className="error-banner">{error}</div>}

      {questions.map((q, i) => (
        <div className="question-block" key={q.id}>
          <div className="q-text">{i + 1}. {q.question_text}</div>

          {(q.question_type === "mcq" || q.question_type === "true_false") &&
            LETTERS.filter((letter) => q[`option_${letter.toLowerCase()}`]).map((letter) => (
              <div className="option-row" key={letter}>
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={answers[q.id] === letter}
                  onChange={() => choose(q.id, letter)}
                />
                <label>{q[`option_${letter.toLowerCase()}`]}</label>
              </div>
            ))}

          {q.question_type === "fill_blank" && (
            <input
              value={answers[q.id] || ""}
              onChange={(e) => typeAnswer(q.id, e.target.value)}
              placeholder="Your answer"
            />
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

      <button onClick={submit} disabled={!allAnswered}>
        Done — submit answers
      </button>
    </div>
  );
}
