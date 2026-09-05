// Gemini model used for all requests.
const MODEL = "gemini-3.1-flash-lite";

function isQuotaExhausted(status: number, errText: string): boolean {
  if (status === 429) return true;
  const lower = errText.toLowerCase();
  return lower.includes("resource_exhausted") || lower.includes("quota");
}

function getRemainingQuota(resp: Response): string | null {
  const remaining = resp.headers.get("x-ratelimit-remaining");
  const limit = resp.headers.get("x-ratelimit-limit");
  const reset = resp.headers.get("x-ratelimit-reset");
  if (remaining !== null || limit !== null || reset !== null) {
    const parts = [
      remaining ? `remaining=${remaining}` : null,
      limit ? `limit=${limit}` : null,
      reset ? `reset=${reset}` : null,
    ].filter(Boolean);
    return parts.join(", ");
  }
  return null;
}

// Calls the Gemini generateContent endpoint with the given request body.
async function callGemini(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  if (resp.ok) {
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini model ${MODEL} returned no content.`);
    return text;
  }

  const errText = await resp.text();
  const quota = getRemainingQuota(resp);
  throw new Error(
    `Gemini API error on model ${MODEL}: ${resp.status} ${errText}${quota ? ` [quota: ${quota}]` : ""}`
  );
}

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

  const text = await callGemini(apiKey, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

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
  question: string;
  maxMarks: number;
}

// Generates short-answer / essay question TEXT ONLY (no marking key - these
// are open-ended and graded per-photo later by gradeShortAnswerPhoto). The
// teacher picks how many to generate and can edit every word afterwards,
// same review step as the MCQ-family types get.
export async function generateShortAnswerQuestions(
  sourceText: string,
  count: number,
  difficulty: "easy" | "medium" | "hard" = "medium"
): Promise<DraftShortQuestion[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const n = Math.max(1, Math.min(20, Math.round(count) || 1));

  const prompt = `You are creating a ${difficulty}-difficulty short-answer / essay test for students,
based ONLY on the material below. Create exactly ${n} short-answer question(s) - open-ended
questions a student would write a few sentences to a paragraph to answer by hand on paper
(not multiple choice, not true/false, not fill-in-the-blank).

Return ONLY valid JSON (no markdown fences, no commentary): an array of exactly ${n} objects,
each shaped like:
  { "question": "string", "maxMarks": <integer 1-10, higher for questions needing a fuller answer> }

Source material:
"""
${sourceText}
"""`;

  const text = await callGemini(apiKey, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

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
    return { question, maxMarks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : 5 };
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

  const text = await callGemini(apiKey, {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  });

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
