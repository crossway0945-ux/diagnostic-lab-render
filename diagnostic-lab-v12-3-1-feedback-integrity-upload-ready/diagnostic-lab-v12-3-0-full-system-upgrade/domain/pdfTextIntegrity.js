import { unicodeIntegrityIssues } from "./textIntegrity.js";

const MALFORMED_DECIMAL_BAND = /\bBand\s+[0-9]\.\s+[05]\b/i;
const MISSING_SPACE_AFTER_TERMINAL = /[\p{Ll}\p{N}][.!?][\p{Lu}]/u;

export function pdfTextIntegrityIssues({ extractedText = "", savedReportText = "", minimumParity = 0.96 } = {}) {
  const extracted = String(extractedText || "");
  const expected = String(savedReportText || "");
  const issues = [...unicodeIntegrityIssues(extracted, { studentFacing: true })];
  if (MALFORMED_DECIMAL_BAND.test(extracted)) issues.push("MALFORMED_DECIMAL_BAND");
  if (MISSING_SPACE_AFTER_TERMINAL.test(extracted)) issues.push("MISSING_SPACE_AFTER_TERMINAL_PUNCTUATION");
  if (containsCorruptedHyphenation(extracted)) issues.push("CORRUPTED_HYPHENATION");
  const parity = textParity(expected, extracted);
  if (expected.trim() && parity.ratio < minimumParity) issues.push("PDF_SAVED_REPORT_TEXT_PARITY_FAILED");
  return { issues: [...new Set(issues)], parity };
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

function tokenCounts(tokens) {
  const output = new Map();
  for (const token of tokens) output.set(token, (output.get(token) || 0) + 1);
  return output;
}

function containsCorruptedHyphenation(value) {
  return /(?:\u00ad|\uFFFD|\uFFFE|\uFFFF|ï¿¾|ï¿½|â€‘|â€“|â€”)/u.test(String(value || ""));
}
