const FORBIDDEN_CODE_POINTS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B\u2060\uFFFD\uFFFE\uFFFF]/gu;
const DASH_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/gu;

export function sanitizeReportText(value, options = {}) {
  const preserveStudentText = Boolean(options.preserveStudentText);
  let text = String(value ?? "").normalize("NFC");
  text = text.replace(FORBIDDEN_CODE_POINTS, "");
  text = removeUnpairedSurrogates(text);
  if (!preserveStudentText) text = text.replace(DASH_VARIANTS, "-");
  return text;
}

export function sanitizeReportValue(value, options = {}) {
  if (Array.isArray(value)) return value.map((item) => sanitizeReportValue(item, options));
  if (!value || typeof value !== "object") return sanitizeReportText(value, options);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeReportValue(item, options)]));
}

export function escapeReportHtml(value, options = {}) {
  return sanitizeReportText(value, options)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function findForbiddenUnicode(value) {
  const text = String(value ?? "");
  const findings = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.codePointAt(index);
    const char = String.fromCodePoint(code);
    if (FORBIDDEN_CODE_POINTS.test(char) || isUnpairedSurrogateAt(text, index)) {
      findings.push({ index, codePoint: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`, context: text.slice(Math.max(0, index - 24), index + 25) });
    }
    if (code > 0xFFFF) index += 1;
    FORBIDDEN_CODE_POINTS.lastIndex = 0;
  }
  return findings;
}

function removeUnpairedSurrogates(text) {
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        output += text[index] + text[index + 1];
        index += 1;
      }
      continue;
    }
    if (code >= 0xDC00 && code <= 0xDFFF) continue;
    output += text[index];
  }
  return output;
}

function isUnpairedSurrogateAt(text, index) {
  const code = text.charCodeAt(index);
  if (code >= 0xD800 && code <= 0xDBFF) {
    const next = text.charCodeAt(index + 1);
    return !(next >= 0xDC00 && next <= 0xDFFF);
  }
  if (code >= 0xDC00 && code <= 0xDFFF) {
    const previous = text.charCodeAt(index - 1);
    return !(previous >= 0xD800 && previous <= 0xDBFF);
  }
  return false;
}
