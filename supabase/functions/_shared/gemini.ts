const MODEL = "gemini-3.6-flash";

export interface TypeCounts {
  mcq?: number;
  true_false?: number;
  fill_blank?: number;
  match?: number;
}

export interface DraftQuestion {
  type: "mcq" | "true_false" | "fill_blank" | "match";
  question: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  options?: { A: string; B: string; C?: string; D?: string };
  correct?: string;
  pairs?: { left: string; right: string }[];
}

export async function generateQuestionsFromText(
  sourceText: string,
  typeCounts: TypeCounts,
  difficulty: "easy" | "medium" | "hard" = "medium"
): Promise<DraftQuestion[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const wanted = [
    typeCounts.mcq ? `${typeCounts.mcq} multiple-choice question(s) (type "mcq", exactly 4 options, one correct)` : null,
    typeCounts.true_false ? `${typeCounts.true_false} true/false question(s) (type "true_false")` : null,
    typeCounts.fill_blank ? `${typeCounts.fill_blank} fill-in-the-blank question(s) (type "fill_blank", the blank shown as ____ in the question text)` : null,
    typeCounts.match ? `${typeCounts.match} match-the-following question(s) (type "match", 3-6 pairs)` : null,
  ].filter(Boolean);

  if (wanted.length === 0) throw new Error("Pick at least one question type.");

  const prompt = `You are creating a ${difficulty}-difficulty test for students, based ONLY on the material below.
Create exactly: ${wanted.join("; ")}.

Return ONLY valid JSON (no markdown fences, no commentary): a single array mixing all requested
question types, each object matching ONE of these shapes depending on its "type":

  { "type": "mcq", "question": "string", "options": { "A": "string", "B": "string", "C": "string", "D": "string" }, "correct": "A" }
  { "type": "true_false", "question": "string", "correct": "True" }   // correct is "True" or "False"
  { "type": "fill_blank", "question": "string with ____ for the blank", "correct": "expected answer" }
  { "type": "match", "question": "short instruction like 'Match the term to its definition'", "pairs": [ { "left": "string", "right": "string" } ] }

Source material:
"""
${sourceText}
"""`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON. Try again or shorten the source text.");
  }

  if (!Array.isArray(parsed)) throw new Error("Unexpected Gemini response shape.");
  for (const q of parsed as Record<string, unknown>[]) {
    if (!q.type || !q.question) throw new Error("Gemini produced a malformed question; please regenerate.");
    if (q.type === "mcq") {
      const opts = q.options as Record<string, string> | undefined;
      if (!opts || !["A", "B", "C", "D"].every((k) => typeof opts[k] === "string") || !["A", "B", "C", "D"].includes(q.correct as string)) {
        throw new Error("Gemini produced a malformed multiple-choice question; please regenerate.");
      }
    } else if (q.type === "true_false") {
      if (!["True", "False"].includes(q.correct as string)) {
        throw new Error("Gemini produced a malformed true/false question; please regenerate.");
      }
    } else if (q.type === "fill_blank") {
      if (typeof q.correct !== "string" || !q.correct) {
        throw new Error("Gemini produced a malformed fill-in-the-blank question; please regenerate.");
      }
    } else if (q.type === "match") {
      const pairs = q.pairs as { left: string; right: string }[] | undefined;
      if (!Array.isArray(pairs) || pairs.length < 2 || !pairs.every((p) => p.left && p.right)) {
        throw new Error("Gemini produced a malformed match-the-following question; please regenerate.");
      }
    } else {
      throw new Error("Gemini produced an unknown question type; please regenerate.");
    }
  }

  // Every question starts at 1 mark, tagged with the requested difficulty -
  // the teacher adjusts marks per question in the review step; the paper's
  // total is only finalized when they press Done.
  return (parsed as Record<string, unknown>[]).map((q) => ({
    type: q.type,
    question: q.question,
    options: q.type === "mcq" ? q.options : q.type === "true_false" ? { A: "True", B: "False" } : undefined,
    correct: q.type === "true_false" ? (q.correct === "True" ? "A" : "B") : q.correct,
    pairs: q.type === "match" ? q.pairs : undefined,
    marks: 1,
    difficulty,
  })) as DraftQuestion[];
}

export interface DraftShortQuestion {
  text: string;
  maxMarks: number;
}

// Generates open-ended short-answer/essay question TEXT ONLY (no answer key -
// these are graded later against a photographed handwritten answer). This is
// the "Generate with Gemini" choice on the paper builder; the alternative is
// the teacher just typing the questions in themselves.
export async function generateShortAnswerQuestions(
  sourceText: string,
  count: number,
  difficulty: "easy" | "medium" | "hard" = "medium"
): Promise<DraftShortQuestion[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  if (!count || count < 1) throw new Error("Ask for at least one short-answer question.");

  const prompt = `You are creating a ${difficulty}-difficulty test for students, based ONLY on the material below.
Write exactly ${count} open-ended short-answer/essay question(s) that require a written explanation
(not a single word or a multiple-choice pick). Suggest a fair mark value for each (a whole number,
typically 2-10 depending on how much the question asks for).

Return ONLY valid JSON (no markdown fences, no commentary): an array of objects shaped exactly like:
{ "question": "string", "maxMarks": <number> }

Source material:
"""
${sourceText}
"""`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON. Try again or shorten the source text.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Unexpected Gemini response shape.");

  return (parsed as Record<string, unknown>[]).map((q) => {
    const question = (q.question || "").toString();
    const maxMarks = Number(q.maxMarks);
    if (!question) throw new Error("Gemini produced a malformed short-answer question; please regenerate.");
    return { text: question, maxMarks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : 5 };
  });
}

interface GradeResult {
  marks: number;
  feedback: string;
}

// Grades a photo of a handwritten answer sheet against one question.
// imageBase64 is the raw base64 payload (no "data:image/..." prefix).
// The image itself is never stored - it's forwarded to Gemini and discarded.
export async function gradeShortAnswerPhoto(
  questionText: string,
  maxMarks: number,
  imageBase64: string,
  mimeType: string
): Promise<GradeResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const prompt = `You are grading a student's handwritten answer, photographed on paper.
Question (worth ${maxMarks} marks): "${questionText}"

Read the handwriting in the photo as best you can. Judge the answer on correctness and
completeness relative to the question, not handwriting neatness or spelling. If the photo
is blank, illegible, or clearly not an answer to this question, award 0 and say so.

Return ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:
{ "marks": <number from 0 to ${maxMarks}, may be a decimal>, "feedback": "<one short sentence>" }`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  let parsed: { marks?: number; feedback?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON while grading.");
  }

  const marks = Number(parsed.marks);
  if (!Number.isFinite(marks)) throw new Error("Gemini returned a non-numeric mark.");

  return {
    marks: Math.max(0, Math.min(maxMarks, marks)),
    feedback: (parsed.feedback || "").toString().slice(0, 500),
  };
}
