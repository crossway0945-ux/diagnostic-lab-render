import { unicodeIntegrityIssues } from "./textIntegrity.js";

const MALFORMED_DECIMAL_BAND = /\bBand\s+[0-9]\.\s+[05]\b/i;
const MISSING_SPACE_AFTER_TERMINAL = /[\p{Ll}\p{N}][.!?][\p{Lu}]/u;
const EXTRACTED_TEXT_FORBIDDEN_CODE_POINT = /[\u00AD\u2011\uFFFD-\uFFFF\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;
const MALFORMED_TASK_TYPE = /\btask[\s_-]*[\u00AD\u2011\uFFFD-\uFFFF\uE000-\uF8FF]+[\s_-]*type\b|\btask\s*type\s*[\uFFFD-\uFFFF]/iu;
const BROKEN_NUMERIC_SPACING = /\b(?:Band|score|range)\s+[0-9]\s*[.,]\s+[0-9]\b/i;
const INTERNAL_REPORT_LANGUAGE = /\b(?:source|target|evidence)\s+offsets?\b|\bexact source span\b|\bvalidated (?:span|occurrence|issue)\b|\b(?:body_topic_sentence|thesis_route|cause_route|solution_route|view_route|paragraph_closing_sentence)\b/i;
const SEMANTIC_HEADINGS = Object.freeze([
  "Estimated Band Range",
  "Executive Summary",
  "IELTS Criteria Breakdown",
  "Detailed Feedback",
  "Repair Plan"
]);

export function pdfTextIntegrityIssues({ extractedText = "", savedReportText = "", minimumParity = 0.96, semanticAnchors = [] } = {}) {
  const extracted = String(extractedText || "");
  const expected = String(savedReportText || "");
  const issues = [...unicodeIntegrityIssues(extracted, { studentFacing: true })];
  if (MALFORMED_DECIMAL_BAND.test(extracted)) issues.push("MALFORMED_DECIMAL_BAND");
  if (BROKEN_NUMERIC_SPACING.test(extracted)) issues.push("BROKEN_NUMERIC_SPACING");
  if (MISSING_SPACE_AFTER_TERMINAL.test(extracted)) issues.push("MISSING_SPACE_AFTER_TERMINAL_PUNCTUATION");
  if (EXTRACTED_TEXT_FORBIDDEN_CODE_POINT.test(extracted)) issues.push("PDF_FORBIDDEN_EXTRACTED_CODE_POINT");
  if (MALFORMED_TASK_TYPE.test(extracted)) issues.push("MALFORMED_TASK_TYPE_TEXT");
  if (containsCorruptedHyphenation(extracted)) issues.push("CORRUPTED_HYPHENATION");
  if (INTERNAL_REPORT_LANGUAGE.test(extracted)) issues.push("PDF_INTERNAL_REPORT_LANGUAGE");
  const parity = textParity(expected, extracted);
  if (expected.trim() && parity.ratio < minimumParity) issues.push("PDF_SAVED_REPORT_TEXT_PARITY_FAILED");
  const semanticParity = semanticReportParity(expected, extracted, semanticAnchors);
  if (!semanticParity.pass) issues.push("PDF_WEB_SEMANTIC_PARITY_FAILED");
  return { issues: [...new Set(issues)], parity, semanticParity };
}

export function semanticReportParity(expected = "", actual = "", semanticAnchors = []) {
  const source = String(expected || "");
  const rendered = String(actual || "");
  const explicit = Array.isArray(semanticAnchors) ? semanticAnchors.map(String).filter(Boolean) : [];
  const anchors = [...new Set([
    ...explicit,
    ...SEMANTIC_HEADINGS.filter((heading) => source.toLowerCase().includes(heading.toLowerCase())),
    ...(source.match(/\b(?:Task Response|Task Achievement|Coherence & Cohesion|Lexical Resource|Grammatical Range & Accuracy)\b/gi) || [])
  ])];
  const missing = anchors.filter((anchor) => !normalizeComparable(rendered).includes(normalizeComparable(anchor)));
  return { pass: missing.length === 0, checked: anchors.length, missing };
}

export function assertPdfTextIntegrity(input = {}) {
  const result = pdfTextIntegrityIssues(input);
  if (!result.issues.length) return result;
  const error = new Error(`PDF text integrity check failed: ${result.issues.join(", ")}`);
  error.errorCode = "PDF_TEXT_INTEGRITY_FAILED";
  error.validationDetails = result;
  throw error;
}

export function textParity(expected = "", actual = "") {
  const expectedTokens = comparableTokens(expected);
  const actualTokens = comparableTokens(actual);
  if (!expectedTokens.length) return { ratio: 1, matched: 0, expected: 0, missingTokens: [] };
  const counts = tokenCounts(actualTokens);
  let matched = 0;
  const missingTokens = [];
  for (const token of expectedTokens) {
    const remaining = counts.get(token) || 0;
    if (remaining > 0) {
      counts.set(token, remaining - 1);
      matched += 1;
    } else if (missingTokens.length < 50) {
      missingTokens.push(token);
    }
  }
  return {
    ratio: matched / expectedTokens.length,
    matched,
    expected: expectedTokens.length,
    missingTokens
  };
}

function comparableTokens(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/gu, "-")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+(?:[.'-][\p{L}\p{N}]+)*/gu) || [];
}

function normalizeComparable(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenCounts(tokens) {
  const output = new Map();
  for (const token of tokens) output.set(token, (output.get(token) || 0) + 1);
  return output;
}

function containsCorruptedHyphenation(value) {
  return /(?:\u00ad|\uFFFD|\uFFFE|\uFFFF|ï¿¾|ï¿½|â€‘|â€“|â€”)/u.test(String(value || ""));
}
