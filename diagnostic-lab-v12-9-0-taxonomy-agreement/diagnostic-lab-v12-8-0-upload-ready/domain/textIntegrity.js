const FORBIDDEN_CODE_POINT_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B\u2060\uFFFD-\uFFFF\uE000-\uF8FF]/u;

export const STUDENT_FORBIDDEN_PATTERNS = Object.freeze([
  /submissionGroupId/i,
  /reportVersionId/i,
  /parentReportId/i,
  /submissionId/i,
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
  /\b(?:source|target|evidence)\s+offsets?\b/i,
  /\bexact source span\b/i,
  /\bvalidated (?:span|occurrence|issue)\b/i,
  /\b(?:body_topic_sentence|thesis_route|cause_route|solution_route|view_route|paragraph_closing_sentence)\b/i,
  /\b(?:issue|development)-[a-z0-9][a-z0-9-]*\b/i,
  /\b(?:internalRouteKey|rawScoringKey|scoringSnapshot|canonicalRank|sourceIssueIds)\b/i,
  /Progress policy:/i,
  /legacy-[a-f0-9]/i,
  /Ctrl\s*\+\s*M/i
]);

export function normalizeVisibleText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n");
}

// ---------------------------------------------------------------------------
// PDF text-layer integrity (V12.9.4).
//
// The canonical report data is clean \u2014 the production QA export contains a normal "cost-efficiency"
// and zero noncharacters. The corruption seen as `cost\ufffeefficiency` is introduced BELOW the canonical
// layer, in the printable projection, where a soft hyphen or zero-width break inserted for line
// breaking survives into the PDF text layer and extracts as U+FFFE.
//
// So the repair belongs here: strip anything that cannot legitimately appear in extracted text,
// while preserving every character a reader expects. A real hyphen, en dash, em dash and
// non-breaking hyphen all survive; only the invisible break characters and noncharacters are removed.
// ---------------------------------------------------------------------------

// Unicode noncharacters are checked by code point below so every plane is covered correctly.
// Invisible characters a layout engine may inject for hyphenation or line breaking. They are the
// actual source of the corruption, and none of them carries meaning in extracted text.
const INVISIBLE_BREAK_PATTERN = /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/gu;
const REPLACEMENT_CHARACTER_PATTERN = /\ufffd/gu;
// Observed legacy extraction corruption. This exact two-letter sequence appears only where a
// destroyed separator sat between ASCII word parts (for example short-term). It is repaired only in
// that deterministic context and rejected everywhere else.
const CORRUPTED_SEPARATOR_PATTERN = /\u041b\u0438[_-]?/gu;

/**
 * Makes a string safe for the PDF text layer without changing what the reader sees.
 * Hyphens and dashes are preserved: only invisible breaks and noncharacters are removed.
 */
export function sanitizePrintableText(value) {
  const restored = String(value ?? "")
    .normalize("NFC")
    .replace(/(?<=[A-Za-z])\u041b\u0438[_-]?(?=[A-Za-z])/gu, "-")
    // A noncharacter or replacement character sitting BETWEEN two letters means a real character was
    // destroyed, and in this report the only character that appears there is a hyphen
    // ("cost-efficiency" → "cost￾efficiency"). Restoring the hyphen recovers the source word;
    // deleting it would silently produce "costefficiency".
    .replace(/(?<=[A-Za-z])(?:[﷐-﷯￾￿�])(?=[A-Za-z])/gu, "-");
  return stripUnicodeNoncharacters(restored)
    // Discretionary and zero-width breaks carry no meaning of their own, so they are simply removed.
    .replace(INVISIBLE_BREAK_PATTERN, "")
    .replace(REPLACEMENT_CHARACTER_PATTERN, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/gu, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu, "");
}

export function sanitizePrintableTree(value) {
  if (typeof value === "string") return sanitizePrintableText(value);
  if (Array.isArray(value)) return value.map(sanitizePrintableTree);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizePrintableTree(child)]));
}

/** Returns the forbidden code points still present, so an export can fail closed with a reason. */
export function printableTextViolations(value) {
  const text = String(value ?? "");
  const violations = [];
  if (hasUnicodeNoncharacter(text)) violations.push("UNICODE_NONCHARACTER");
  if (REPLACEMENT_CHARACTER_PATTERN.test(text)) violations.push("REPLACEMENT_CHARACTER");
  REPLACEMENT_CHARACTER_PATTERN.lastIndex = 0;
  if (INVISIBLE_BREAK_PATTERN.test(text)) violations.push("INVISIBLE_BREAK_CHARACTER");
  INVISIBLE_BREAK_PATTERN.lastIndex = 0;
  if (CORRUPTED_SEPARATOR_PATTERN.test(text)) violations.push("CORRUPTED_SEPARATOR_SEQUENCE");
  CORRUPTED_SEPARATOR_PATTERN.lastIndex = 0;
  if (hasUnpairedSurrogate(text)) violations.push("UNPAIRED_SURROGATE");
  return violations;
}

/** PDF export must refuse rather than ship a corrupted text layer. */
export function assertPrintableTextIntegrity(value) {
  const violations = printableTextViolations(value);
  if (!violations.length) return true;
  const error = new Error(`The PDF text layer contains characters that would corrupt copied text: ${violations.join(", ")}.`);
  error.errorCode = "PDF_TEXT_INTEGRITY_FAILED";
  error.validationDetails = violations;
  throw error;
}

export function unicodeIntegrityIssues(value, options = {}) {
  const text = String(value ?? "");
  const issues = [];
  if (text !== text.normalize("NFC")) issues.push("TEXT_NOT_NFC_NORMALIZED");
  if (FORBIDDEN_CODE_POINT_PATTERN.test(text)) issues.push("FORBIDDEN_UNICODE_CODE_POINT");
  if (hasUnicodeNoncharacter(text)) issues.push("UNICODE_NONCHARACTER");
  if (CORRUPTED_SEPARATOR_PATTERN.test(text)) issues.push("CORRUPTED_SEPARATOR_SEQUENCE");
  CORRUPTED_SEPARATOR_PATTERN.lastIndex = 0;
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

function hasUnicodeNoncharacter(text) {
  for (const character of String(text || "")) {
    const point = character.codePointAt(0);
    if ((point >= 0xFDD0 && point <= 0xFDEF) || (point & 0xFFFE) === 0xFFFE) return true;
  }
  return false;
}

function stripUnicodeNoncharacters(value) {
  return [...String(value ?? "")]
    .filter((character) => {
      const point = character.codePointAt(0);
      return !((point >= 0xFDD0 && point <= 0xFDEF) || (point & 0xFFFE) === 0xFFFE);
    })
    .join("");
}
