import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { extractTextFromFile } from "../extractText.js";

export default function TeacherBuildShort() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editingId = id || null;

  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [semester, setSemester] = useState("");
  const [questions, setQuestions] = useState([{ text: "", maxMarks: 5 }]);
  const [error, setError] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(!!editingId);

  // Who writes the questions: the teacher types them directly, or Gemini
  // drafts them from pasted/uploaded source text - either way, every
  // question is fully editable below before saving.
  const [source, setSource] = useState("user"); // "user" | "gemini"
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState(3);
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    api(`/teacher/short/${editingId}`)
      .then((data) => {
        setSubject(data.set.subject);
        setTopic(data.set.topic || "");
        setSemester(data.set.semester);
        setQuestions(data.questions.map((q) => ({ text: q.question_text, maxMarks: q.max_marks })));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingEdit(false));
  }, [editingId]);

  function updateQuestion(i, key, value) {
    const copy = [...questions];
    copy[i][key] = value;
    setQuestions(copy);
  }

  function addQuestion() {
    setQuestions([...questions, { text: "", maxMarks: 5 }]);
  }

  function removeQuestion(i) {
    setQuestions(questions.filter((_, idx) => idx !== i));
  }

  async function generate() {
    setError("");
    setBusy(true);
    try {
      let textToSend = pastedText;
      if (file) textToSend = await extractTextFromFile(file);
      const data = await api("/teacher/short/generate", {
        method: "POST",
        body: { text: textToSend, count, difficulty },
      });
      setQuestions(data.questions.map((q) => ({ text: q.question, maxMarks: q.maxMarks })));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0);

  async function save() {
    if (!subject || !topic || !semester) return setError("Enter subject, topic and semester before saving.");
    if (questions.some((q) => !q.text.trim())) return setError("Every question needs text.");
    setError("");
    try {
      if (editingId) {
        await api(`/teacher/short/${editingId}`, { method: "PUT", body: { subject, topic, semester, questions } });
      } else {
        await api("/teacher/short/save", { method: "POST", body: { subject, topic, semester, questions } });
      }
      navigate("/teacher");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loadingEdit) {
    return (
      <div className="app-shell">
        <p className="muted">Loading paper...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <span className="eyebrow">{editingId ? "Edit paper" : "Build a paper"}</span>
      <h1>{editingId ? "Edit short-answer paper" : "New short-answer paper"}</h1>
      <p className="muted">Students write these on paper, photograph them, and Gemini grades them automatically.</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field">
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. History" />
        </div>
        <div className="field">
          <label>Topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. World War II" />
        </div>
        <div className="field">
          <label>Semester</label>
          <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. Sem 3" />
        </div>

        {!editingId && (
          <>
            <label>Who writes these questions?</label>
            <div className="difficulty-row">
              <button type="button" className={source === "user" ? "active" : ""} onClick={() => setSource("user")}>
                I'll write them
              </button>
              <button type="button" className={source === "gemini" ? "active" : ""} onClick={() => setSource("gemini")}>
                Generate with Gemini
              </button>
            </div>

            {source === "gemini" && (
              <div className="field" style={{ marginTop: 10 }}>
                <label>Difficulty</label>
                <div className="difficulty-row">
                  {["easy", "medium", "hard"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={difficulty === d ? "active" : ""}
                      onClick={() => setDifficulty(d)}
                    >
                      {d[0].toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
                <label>How many questions?</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="marks-input"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Paste source text</label>
                  <textarea rows="6" value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Paste a chapter, notes, or topic summary..." />
                </div>
                <div className="field">
                  <label>...or upload a document (.txt, .docx, .pdf)</label>
                  <input type="file" accept=".txt,.docx,.pdf" onChange={(e) => setFile(e.target.files[0])} />
                </div>
                <button type="button" onClick={generate} disabled={busy || (!pastedText && !file)}>
                  {busy ? "Generating..." : "Generate with Gemini"}
                </button>
                {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
                <p className="muted" style={{ marginTop: 6 }}>
                  Every question stays fully editable below before you save.
                </p>
              </div>
            )}
          </>
        )}

        {questions.map((q, i) => (
          <div className="short-question-block" key={i}>
            <div className="field">
              <label>Question {i + 1}</label>
              <textarea rows="2" value={q.text} onChange={(e) => updateQuestion(i, "text", e.target.value)} />
            </div>
            <div className="field">
              <label>Marks</label>
              <input className="marks-input" type="number" min="1" value={q.maxMarks} onChange={(e) => updateQuestion(i, "maxMarks", Number(e.target.value))} />
            </div>
            {questions.length > 1 && <button className="danger" onClick={() => removeQuestion(i)}>Remove question</button>}
          </div>
        ))}

        <div style={{ marginBottom: 14 }}>
          <button className="secondary" onClick={addQuestion}>+ Add question</button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Total marks: {totalMarks}</strong>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={save}>{editingId ? "Save changes" : "Done — save this paper"}</button>
            <button className="secondary" onClick={() => navigate("/teacher")}>Discard</button>
          </div>
        </div>
        {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    </div>
  );
}
