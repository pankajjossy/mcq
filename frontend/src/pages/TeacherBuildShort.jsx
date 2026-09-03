import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function TeacherBuildShort() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editingId = id || null;

  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [topicOptions, setTopicOptions] = useState([]);
  const [semester, setSemester] = useState("");
  const [questions, setQuestions] = useState([{ text: "", maxMarks: 5 }]);
  const [error, setError] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(!!editingId);

  useEffect(() => {
    api("/teacher/subjects")
      .then((data) => { setSubjectOptions(data.subjects || []); setTopicOptions(data.topics || []); })
      .catch(() => {});
  }, []);

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
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. History" list="subject-options" />
          <datalist id="subject-options">{subjectOptions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="field">
          <label>Topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. World War 2" list="topic-options" />
          <datalist id="topic-options">{topicOptions.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div className="field">
          <label>Semester</label>
          <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. Sem 3" />
        </div>

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
      </div>
    </div>
  );
}
