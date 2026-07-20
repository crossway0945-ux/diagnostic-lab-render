const FORBIDDEN_CODE_POINT_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B\u2060\uFFFD-\uFFFF\uE000-\uF8FF]/u;

export const STUDENT_FORBIDDEN_PATTERNS = Object.freeze([
  /submissionGroupId/i,
  /reportVersionId/i,
  /parentReportId/i,
  /studentWorkFingerprint/i,
  /normalizedResponseFingerprint/i,
  /inputFingerprint/i,
  /engineVersion/i,
  /rubricVersion/i,
  /promptVersion/i,
  /reportSchemaVersion/i,
  /raw provider response/i,
  /validation trace/i,
  /migration evidence/i,
  /internal scoring proof/i,
  /Progress policy:/i,
  /legacy-[a-f0-9]/i,
  /Ctrl\s*\+\s*M/i
]);

export function normalizeVisibleText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/gu, "-")
    .replace(/\r\n?/gu, "\n");
}

export function unicodeIntegrityIssues(value, options = {}) {
  const text = String(value ?? "");
  const issues = [];
  if (text !== text.normalize("NFC")) issues.push("TEXT_NOT_NFC_NORMALIZED");
  if (FORBIDDEN_CODE_POINT_PATTERN.test(text)) issues.push("FORBIDDEN_UNICODE_CODE_POINT");
  if (hasUnpairedSurrogate(text)) issues.push("UNPAIRED_SURROGATE");
  if (options.studentFacing) {
    const forbidden = STUDENT_FORBIDDEN_PATTERNS.find((pattern) => pattern.test(text));
    if (forbidden) issues.push("INTERNAL_DATA_LEAKAGE");
  }
  return [...new Set(issues)];
}

export function assertUnicodeIntegrity(value, options = {}) {
  const issues = unicodeIntegrityIssues(value, options);
  if (!issues.length) return true;
  const error = new Error(`Text integrity check failed: ${issues.join(", ")}`);
  error.errorCode = "TEXT_INTEGRITY_FAILED";
  error.validationDetails = issues;
  throw error;
}

export function normalizeVisibleTree(value) {
  if (typeof value === "string") return normalizeVisibleText(value);
  if (Array.isArray(value)) return value.map(normalizeVisibleTree);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeVisibleTree(child)]));
}

function hasUnpairedSurrogate(text) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true;
    }
  }
  return false;
}
