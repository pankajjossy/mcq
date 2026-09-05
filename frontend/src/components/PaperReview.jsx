const LETTERS = ["A", "B", "C", "D"];

// `questions` items can optionally carry this student's own answer
// (selected_option / match_answer / is_correct) for personal review mode;
// without those fields it just renders the plain answer key.
export default function PaperReview({ questions }) {
  return (
    <>
      {questions.map((q, i) => (
        <div className="question-block" key={q.id}>
          <div className="q-text">
            {i + 1}. {q.question_text}
            {q.marks != null && <span style={{ opacity: 0.6 }}> ({q.marks} marks)</span>}
            {q.is_correct != null && <span> — {q.is_correct ? "✓ correct" : "✗ incorrect"}</span>}
          </div>

          {(q.question_type === "mcq" || q.question_type === "true_false") && (
            <>
              {(q.question_type === "true_false" ? ["A", "B"] : LETTERS).map((letter) => {
                const text = q[`option_${letter.toLowerCase()}`];
                if (!text) return null;
                const isCorrect = q.correct_option === letter;
                const isPicked = q.selected_option === letter;
                return (
                  <div className="option-row" key={letter}>
                    <input type="radio" checked={isPicked} readOnly />
                    <label style={{ fontWeight: isCorrect ? 700 : 400, color: isCorrect ? "var(--good)" : undefined }}>
                      {text}{isCorrect ? " (correct)" : ""}{isPicked && !isCorrect ? " (your answer)" : ""}
                    </label>
                  </div>
                );
              })}
            </>
          )}

          {q.question_type === "fill_blank" && (
            <p>
              Correct answer: <strong>{q.correct_option}</strong>
              {q.selected_option != null && <> — your answer: <em>{q.selected_option || "(blank)"}</em></>}
            </p>
          )}

          {q.question_type === "match" && (
            <ul>
              {(q.match_pairs || []).map((p, pi) => (
                <li key={pi}>{p.left} → {p.right}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}
