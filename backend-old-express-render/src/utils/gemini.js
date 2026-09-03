// Calls Google's Gemini API to turn source text into MCQ questions.
// Uses plain fetch (no SDK) so there's one less dependency to manage.

const MODEL = "gemini-2.0-flash"; // fast + free-tier friendly; change if you prefer another model

export async function generateMcqFromText(sourceText, count = 5) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server.");

  const prompt = `You are creating a multiple choice test for students, based ONLY on the material below.
Create exactly ${count} questions. Each question must have exactly 4 options and exactly one correct option.
Return ONLY valid JSON (no markdown fences, no commentary), matching this shape exactly:

[
  {
    "question": "string",
    "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
    "correct": "A"
  }
]

Source material:
"""
${sourceText}
"""`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON. Try again or shorten the source text.");
  }

  // Basic shape validation so bad output fails loudly instead of corrupting the DB.
  if (!Array.isArray(parsed)) throw new Error("Unexpected Gemini response shape.");
  for (const q of parsed) {
    if (
      !q.question ||
      !q.options ||
      !["A", "B", "C", "D"].every((k) => typeof q.options[k] === "string") ||
      !["A", "B", "C", "D"].includes(q.correct)
    ) {
      throw new Error("Gemini produced a malformed question; please regenerate.");
    }
  }

  return parsed;
}
