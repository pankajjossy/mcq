// Extracts plain text from an uploaded file entirely in the browser.
// This replaces the old server-side pdf-parse/mammoth extraction, which
// isn't reliably Deno-compatible and so can't run inside a Supabase Edge
// Function. Doing it client-side means the backend only ever needs to
// accept plain text - simpler and works everywhere.

import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
// Vite serves this worker file as a URL; pdf.js needs it to parse in a
// background thread instead of blocking the page.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function extractFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

async function extractFromDocx(file) {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function extractFromPlainText(file) {
  return file.text();
}

// Returns the extracted plain text, or throws a friendly error for
// unsupported file types.
export async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return extractFromPdf(file);
  }
  if (
    file.type.includes("wordprocessingml") ||
    file.type === "application/msword" ||
    name.endsWith(".docx")
  ) {
    return extractFromDocx(file);
  }
  if (file.type.startsWith("text/") || name.endsWith(".txt")) {
    return extractFromPlainText(file);
  }
  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or plain text file.");
}
