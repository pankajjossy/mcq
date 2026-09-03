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
  const [semester, setSemester] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [typeCounts, setTypeCounts] = useState({ mcq: 5, true_false: 0, fill_blank: 0, match: 0 });
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState(null);
  const [draftQuestions, setDraftQuestions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(!!editingId);

  useEffect(() => {
    if (!editingId) return;
    api(`/teacher/mcq/${editingId}`)
      .then((data) => {
        setSubject(data.set.subject);
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

  const totalMarks = (draftQuestions || []).reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  async function save() {
    if (!subject || !semester) return setError("Enter subject and semester before saving.");
    setError("");
    try {
      if (editingId) {
        await api(`/teacher/mcq/${editingId}`, { method: "PUT", body: { subject, semester, questions: draftQuestions } });
      } else {
        await api("/teacher/mcq/save", { method: "POST", body: { subject, semester, questions: draftQuestions } });
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

  const readyForContent = subject.trim() && semester.trim();

  return (
    <div className="app-shell">
      <span className="eyebrow">{editingId ? "Edit paper" : "Build a paper"}</span>
      <h1>{editingId ? "Edit" : "New MCQ-family paper"}</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="field">
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Physics" />
        </div>
        <div className="field">
          <label>Semester</label>
          <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. Sem 3" />
        </div>

        {!readyForContent ? (
          <p className="muted">Enter subject and semester to continue.</p>
        ) : !draftQuestions ? (
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

            <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Total marks: {totalMarks}</strong>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={save}>{editingId ? "Save changes" : "Done — save this paper"}</button>
                <button className="secondary" onClick={() => navigate("/teacher")}>Discard</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
