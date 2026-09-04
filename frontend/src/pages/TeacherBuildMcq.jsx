import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { extractTextFromFile } from "../extractText.js";

const TYPE_LABELS = {
  mcq: "Multiple Choice",
  true_false: "True / False",
  fill_blank: "Fill in the Blank",
  match: "Match the Following",
};

function fromServerRow(q) {
  return {
    type: q.question_type,
    question: q.question_text,
    marks: q.marks,
    difficulty: q.difficulty || "medium",
    options: q.question_type === "mcq" || q.question_type === "true_false"
      ? { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }
      : undefined,
    correct: q.question_type !== "match" ? q.correct_option : undefined,
    pairs: q.question_type === "match" ? q.match_pairs : undefined,
  };
}

export default function TeacherBuildMcq() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editingId = id || null;

  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [semester, setSemester] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [typeCounts, setTypeCounts] = useState({ mcq: 5, true_false: 0, fill_blank: 0, match: 0 });
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState(null);
  const [draftQuestions, setDraftQuestions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(!!editingId);

  // Short-answer / essay: a fifth "choice" alongside the MCQ-family types
  // above, right on this same paper-building screen - not a separate
  // "New Short-Answer Paper" flow anymore. These aren't AI-generated from
  // the pasted text (they're open-ended), so a teacher just types them in
  // directly, same as the other types get reviewed before saving.
  const [includeShort, setIncludeShort] = useState(false);
  const [shortQuestions, setShortQuestions] = useState([{ text: "", maxMarks: 5 }]);
  // Who writes the short-answer questions: the teacher types them by hand,
  // or Gemini drafts them from the same pasted/uploaded source text used
  // for the MCQ-family types (still fully editable afterwards).
  const [shortSource, setShortSource] = useState("user"); // "user" | "gemini"
  const [shortCount, setShortCount] = useState(3);
  const [shortBusy, setShortBusy] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    api(`/teacher/mcq/${editingId}`)
      .then((data) => {
        setSubject(data.set.subject);
        setTopic(data.set.topic || "");
        setSemester(data.set.semester);
        setDraftQuestions(data.questions.map(fromServerRow));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingEdit(false));
  }, [editingId]);

  function toggleType(type) {
    setTypeCounts({ ...typeCounts, [type]: typeCounts[type] > 0 ? 0 : 2 });
  }

  async function generate() {
    setError("");
    const activeTypes = Object.entries(typeCounts).filter(([, n]) => n > 0);
    if (activeTypes.length === 0) return setError("Pick at least one question type.");
    setBusy(true);
    try {
      let textToSend = pastedText;
      if (file) textToSend = await extractTextFromFile(file);
      const data = await api("/teacher/mcq/generate", {
        method: "POST",
        body: { text: textToSend, difficulty, typeCounts },
      });
      setDraftQuestions(data.questions);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateQuestion(i, patch) {
    const copy = [...draftQuestions];
    copy[i] = { ...copy[i], ...patch };
    setDraftQuestions(copy);
  }

  function updateOption(i, letter, value) {
    const copy = [...draftQuestions];
    copy[i] = { ...copy[i], options: { ...copy[i].options, [letter]: value } };
    setDraftQuestions(copy);
  }

  function updatePair(i, pi, side, value) {
    const copy = [...draftQuestions];
    const pairs = [...copy[i].pairs];
    pairs[pi] = { ...pairs[pi], [side]: value };
    copy[i] = { ...copy[i], pairs };
    setDraftQuestions(copy);
  }

  function addPair(i) {
    const copy = [...draftQuestions];
    copy[i] = { ...copy[i], pairs: [...(copy[i].pairs || []), { left: "", right: "" }] };
    setDraftQuestions(copy);
  }

  function removePair(i, pi) {
    const copy = [...draftQuestions];
    copy[i] = { ...copy[i], pairs: copy[i].pairs.filter((_, idx) => idx !== pi) };
    setDraftQuestions(copy);
  }

  function removeQuestion(i) {
    setDraftQuestions(draftQuestions.filter((_, idx) => idx !== i));
  }

  function updateShortQuestion(i, key, value) {
    const copy = [...shortQuestions];
    copy[i] = { ...copy[i], [key]: value };
    setShortQuestions(copy);
  }

  function addShortQuestion() {
    setShortQuestions([...shortQuestions, { text: "", maxMarks: 5 }]);
  }

  function removeShortQuestion(i) {
    setShortQuestions(shortQuestions.filter((_, idx) => idx !== i));
  }

  async function generateShort() {
    setError("");
    setShortBusy(true);
    try {
      let textToSend = pastedText;
      if (file) textToSend = await extractTextFromFile(file);
      const data = await api("/teacher/short/generate", {
        method: "POST",
        body: { text: textToSend, count: shortCount, difficulty },
      });
      setShortQuestions(data.questions.map((q) => ({ text: q.question, maxMarks: q.maxMarks })));
    } catch (err) {
      setError(err.message);
    } finally {
      setShortBusy(false);
    }
  }

  const mcqMarks = (draftQuestions || []).reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  const shortMarks = includeShort
    ? shortQuestions.filter((q) => q.text.trim()).reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0)
    : 0;
  const totalMarks = mcqMarks + shortMarks;

  const validShort = shortQuestions.filter((q) => q.text.trim() && Number(q.maxMarks) > 0);
  const canSave = (draftQuestions && draftQuestions.length > 0) || (includeShort && validShort.length > 0);

  async function save() {
    if (!subject || !topic || !semester) return setError("Enter subject, topic and semester before saving.");
    if (!canSave) return setError("Generate MCQ-family questions and/or add at least one short-answer question.");
    setError("");
    try {
      if (editingId) {
        await api(`/teacher/mcq/${editingId}`, { method: "PUT", body: { subject, topic, semester, questions: draftQuestions } });
      } else {
        if (draftQuestions && draftQuestions.length > 0) {
          await api("/teacher/mcq/save", { method: "POST", body: { subject, topic, semester, questions: draftQuestions } });
        }
        if (includeShort && validShort.length > 0) {
          await api("/teacher/short/save", { method: "POST", body: { subject, topic, semester, questions: validShort } });
        }
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

  const readyForContent = subject.trim() && topic.trim() && semester.trim();

  return (
    <div className="app-shell">
      <span className="eyebrow">{editingId ? "Edit paper" : "Build a paper"}</span>
      <h1>{editingId ? "Edit" : "New Paper"}</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field">
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Python" />
        </div>
        <div className="field">
          <label>Topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. List, Tuple, Sets" />
        </div>
        <div className="field">
          <label>Semester</label>
          <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. Sem 3" />
        </div>

        {!readyForContent ? (
          <p className="muted">Enter subject, topic and semester to continue.</p>
        ) : (
          <>
            {!draftQuestions ? (
              <>
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

                <label>Question types (mix as many as you like)</label>
                {Object.entries(TYPE_LABELS).map(([type, label]) => (
                  <div className="type-row" key={type}>
                    <input type="checkbox" checked={typeCounts[type] > 0} onChange={() => toggleType(type)} />
                    <label>{label}</label>
                    {typeCounts[type] > 0 && (
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={typeCounts[type]}
                        onChange={(e) => setTypeCounts({ ...typeCounts, [type]: Number(e.target.value) })}
                      />
                    )}
                  </div>
                ))}

                {!editingId && (
                  <div className="type-row">
                    <input type="checkbox" checked={includeShort} onChange={() => setIncludeShort(!includeShort)} />
                    <label>Short Answer / Essay (student photographs a written answer, AI-graded)</label>
                  </div>
                )}

                <div className="field" style={{ marginTop: 14 }}>
                  <label>Paste source text</label>
                  <textarea rows="6" value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Paste a chapter, notes, or topic summary..." />
                </div>
                <div className="field">
                  <label>...or upload a document (.txt, .docx, .pdf)</label>
                  <input type="file" accept=".txt,.docx,.pdf" onChange={(e) => setFile(e.target.files[0])} />
                </div>
                <button onClick={generate} disabled={busy || (!pastedText && !file)}>
                  {busy ? "Generating..." : "Generate with Gemini"}
                </button>
                <div style={{ marginTop: 14 }}>
                  <span className="muted" style={{ marginRight: 10 }}>or</span>
                  <button className="secondary" onClick={() => setDraftQuestions([{ type: "mcq", question: "", marks: 1, difficulty: "medium", options: { A:"", B:"", C:"", D:"" }, correct: "A" }])}>
                    + Add manual question
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">Edit anything that's wrong, adjust marks per question, remove what you don't want.</p>

                {draftQuestions.map((q, i) => (
                  <div key={i} className="question-block">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <span className="eyebrow" style={{ margin: 0 }}>{TYPE_LABELS[q.type]}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <label style={{ margin: 0, fontSize: 12 }}>Marks</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          className="marks-input"
                          value={q.marks}
                          onChange={(e) => updateQuestion(i, { marks: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <input
                      className="q-text"
                      value={q.question}
                      onChange={(e) => updateQuestion(i, { question: e.target.value })}
                      style={{ marginBottom: 8, fontWeight: 600 }}
                    />

                    {q.type === "mcq" && ["A", "B", "C", "D"].map((letter) => (
                      <div className="option-row" key={letter}>
                        <input type="radio" name={`correct-${i}`} checked={q.correct === letter} onChange={() => updateQuestion(i, { correct: letter })} />
                        <input value={q.options[letter] || ""} onChange={(e) => updateOption(i, letter, e.target.value)} />
                      </div>
                    ))}

                    {q.type === "true_false" && ["A", "B"].map((letter) => (
                      <div className="option-row" key={letter}>
                        <input type="radio" name={`correct-${i}`} checked={q.correct === letter} onChange={() => updateQuestion(i, { correct: letter })} />
                        <label>{letter === "A" ? "True" : "False"}</label>
                      </div>
                    ))}

                    {q.type === "fill_blank" && (
                      <div className="field">
                        <label>Accepted answer</label>
                        <input value={q.correct || ""} onChange={(e) => updateQuestion(i, { correct: e.target.value })} />
                      </div>
                    )}

                    {q.type === "match" && (
                      <>
                        {(q.pairs || []).map((p, pi) => (
                          <div className="match-row" key={pi}>
                            <input value={p.left} onChange={(e) => updatePair(i, pi, "left", e.target.value)} placeholder="Term" />
                            <span>→</span>
                            <input value={p.right} onChange={(e) => updatePair(i, pi, "right", e.target.value)} placeholder="Match" />
                            <button className="danger" type="button" onClick={() => removePair(i, pi)}>✕</button>
                          </div>
                        ))}
                        <button className="secondary" type="button" onClick={() => addPair(i)}>+ Add pair</button>
                      </>
                    )}

                    <button className="danger" style={{ marginTop: 10 }} onClick={() => removeQuestion(i)}>Remove question</button>
                  </div>
                ))}
              </>
            )}

            {!editingId && includeShort && (
              <div style={{ marginTop: 20 }}>
                <h3>Short-answer / essay questions</h3>
                <p className="muted">Students photograph their written answer per question; Gemini reads and grades it automatically.</p>

                <label>Who writes these questions?</label>
                <div className="difficulty-row">
                  <button
                    type="button"
                    className={shortSource === "user" ? "active" : ""}
                    onClick={() => setShortSource("user")}
                  >
                    I'll write them
                  </button>
                  <button
                    type="button"
                    className={shortSource === "gemini" ? "active" : ""}
                    onClick={() => setShortSource("gemini")}
                  >
                    Generate with Gemini
                  </button>
                </div>

                {shortSource === "gemini" && (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>How many questions?</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="marks-input"
                      value={shortCount}
                      onChange={(e) => setShortCount(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      style={{ marginTop: 10 }}
                      onClick={generateShort}
                      disabled={shortBusy || (!pastedText && !file)}
                    >
                      {shortBusy ? "Generating..." : "Generate with Gemini"}
                    </button>
                    <p className="muted" style={{ marginTop: 6 }}>
                      Uses the same pasted text / uploaded document as above. Every question stays editable
                      below before you save.
                    </p>
                  </div>
                )}

                {shortQuestions.map((q, i) => (
                  <div className="short-question-block" key={i}>
                    <div className="field">
                      <label>Question {i + 1}</label>
                      <textarea rows="2" value={q.text} onChange={(e) => updateShortQuestion(i, "text", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Marks</label>
                      <input className="marks-input" type="number" min="1" value={q.maxMarks} onChange={(e) => updateShortQuestion(i, "maxMarks", Number(e.target.value))} />
                    </div>
                    {shortQuestions.length > 1 && <button className="danger" onClick={() => removeShortQuestion(i)}>Remove question</button>}
                  </div>
                ))}
                <button className="secondary" onClick={addShortQuestion}>+ Add short-answer question</button>
              </div>
            )}

            <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
              <strong>Total marks: {totalMarks}</strong>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={save} disabled={!canSave}>{editingId ? "Save changes" : "Done — save this paper"}</button>
                <button className="secondary" onClick={() => navigate("/teacher")}>Discard</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
