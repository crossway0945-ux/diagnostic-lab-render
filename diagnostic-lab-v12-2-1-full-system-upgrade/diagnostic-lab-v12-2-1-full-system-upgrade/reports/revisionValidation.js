import { sanitizeReportText } from "./textSanitization.js";

const REVISION_TYPES = Object.freeze([
  "Minimal Correction",
  "Route-Preserving Revision",
  "Teacher-Guided Expansion",
  "High-Band Refinement"
]);

const INTENSITY_TERMS = Object.freeze([
  "serious", "significant", "severe", "major", "substantial", "dramatic", "extreme",
  "all", "many", "essential", "guaranteed", "inevitable", "always", "never"
]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "for", "in", "on", "with", "by", "is", "are", "was", "were",
  "be", "been", "being", "that", "this", "these", "those", "it", "they", "their", "can", "could", "may", "might",
  "should", "would", "will", "from", "as", "at", "into", "than", "then", "therefore", "however", "furthermore"
]);

// Legacy export name retained so the renderer API remains stable. No fixture-specific
// replacement is performed: every revision is validated against its own quoted evidence.
export function applyLockedRevision(card = {}) {
  const exactSentence = sanitizeReportText(card.exactSentence, { preserveStudentText: true }).trim();
  const targetedRevision = sanitizeReportText(card.targetedRevision).trim();
  const revisionType = normalizeRevisionType(card.revisionType);
  const validation = validateRevision({
    original: exactSentence,
    revised: targetedRevision,
    revisionType,
    diagnosedIssues: card.diagnosedIssues || card.issueType || ""
  });
  return {
    ...card,
    exactSentence,
    targetedRevision,
    revisionType,
    revisionIntegrity: validation
  };
}

export function validateRevision({ original = "", revised = "", revisionType = "", diagnosedIssues = "" } = {}) {
  const cleanOriginal = sanitizeReportText(original, { preserveStudentText: true }).trim();
  const cleanRevised = sanitizeReportText(revised).trim();
  const type = normalizeRevisionType(revisionType);
  const routePreserving = /minimal correction|route-preserving|high-band refinement/i.test(type);
  const teacherGuided = /teacher-guided expansion/i.test(type);
  const originalTerms = intensityTerms(cleanOriginal);
  const revisedTerms = intensityTerms(cleanRevised);
  const unsupportedIntensity = routePreserving ? revisedTerms.filter((term) => !originalTerms.includes(term)) : [];
  const sentenceComplete = /[.!?]["')\]]*$/u.test(cleanRevised) && !/[,;:]\s*$/u.test(cleanRevised) && cleanRevised.split(/\s+/u).length >= 4;
  const originalTokens = contentTokens(cleanOriginal);
  const revisedTokens = contentTokens(cleanRevised);
  const shared = originalTokens.filter((token) => revisedTokens.includes(token));
  const sourceCoverage = originalTokens.length ? shared.length / originalTokens.length : 1;
  const union = new Set([...originalTokens, ...revisedTokens]);
  const jaccard = union.size ? shared.length / union.size : 1;
  const stancePreserved = stance(cleanOriginal) === "" || stance(cleanRevised) === "" || stance(cleanOriginal) === stance(cleanRevised);
  const polarityPreserved = polarity(cleanOriginal) === "neutral" || polarity(cleanRevised) === "neutral" || polarity(cleanOriginal) === polarity(cleanRevised);
  const minimumCoverage = teacherGuided ? 0.08 : 0.20;
  const semanticFidelity = originalTokens.length < 3 || revisedTokens.length < 3 || (
    sourceCoverage >= minimumCoverage && (teacherGuided || jaccard >= 0.10 || shared.length >= 2)
  );
  const revisionTypeValid = REVISION_TYPES.includes(type);
  const exactOriginalFound = Boolean(cleanOriginal);
  const newPremiseIntroduced = teacherGuided || revisedTokens.length > originalTokens.length + 8;
  const introducedIssues = [
    ...unsupportedIntensity.map((term) => `Unsupported intensity term: ${term}`),
    ...(!semanticFidelity ? ["Revision is not semantically anchored to the quoted sentence."] : []),
    ...(!stancePreserved ? ["Revision changes the writer's stance."] : []),
    ...(!polarityPreserved ? ["Revision reverses the original route polarity."] : [])
  ];
  const pass = Boolean(
    exactOriginalFound && cleanRevised && sentenceComplete && revisionTypeValid &&
    unsupportedIntensity.length === 0 && semanticFidelity && stancePreserved && polarityPreserved
  );

  return {
    exactOriginalFound,
    diagnosedIssues: sanitizeReportText(diagnosedIssues),
    remainingDiagnosedIssues: [],
    introducedIssues,
    originalClaim: cleanOriginal,
    revisedClaim: cleanRevised,
    originalIntensity: originalTerms,
    revisedIntensity: revisedTerms,
    stancePreserved,
    paragraphRoutePreserved: semanticFidelity && polarityPreserved,
    semanticFidelity,
    semanticSourceCoverage: Number(sourceCoverage.toFixed(3)),
    semanticJaccard: Number(jaccard.toFixed(3)),
    newPremiseIntroduced,
    sentenceComplete,
    naturalEnglish: sentenceComplete,
    revisionType: type,
    revisionTypeValid,
    pass
  };
}

export function lockedRevisionCount() {
  return 0;
}

function normalizeRevisionType(value) {
  const type = sanitizeReportText(value).trim();
  if (REVISION_TYPES.includes(type)) return type;
  if (/teacher-guided/i.test(type)) return "Teacher-Guided Expansion";
  if (/minimal/i.test(type)) return "Minimal Correction";
  if (/high-band/i.test(type)) return "High-Band Refinement";
  return "Route-Preserving Revision";
}

function intensityTerms(text) {
  const normalized = normalize(text);
  return INTENSITY_TERMS.filter((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalized));
}

function stance(value) {
  const text = normalize(value);
  if (/\b(?:strongly |firmly |completely |generally |partly |partially )?disagree\b/u.test(text)) return "disagree";
  if (/\b(?:strongly |firmly |completely |generally |partly |partially )?agree\b/u.test(text)) return "agree";
  return "";
}

function polarity(value) {
  const text = normalize(value);
  const negative = (text.match(/\b(?:not|never|disagree|oppose|against|prevent|reduce|lack|difficult|difficulty|congestion|problem|drawback)\b/gu) || []).length;
  const positive = (text.match(/\b(?:agree|support|benefit|advantage|improve|effective|growth|increase access)\b/gu) || []).length;
  if (negative > positive) return "negative";
  if (positive > negative) return "positive";
  return "neutral";
}

function contentTokens(value) {
  return [...new Set(normalize(value).match(/[a-z][a-z-]{2,}|[ก-๙]{2,}/gu)?.filter((token) => !STOPWORDS.has(token)) || [])];
}

function normalize(value) {
  return sanitizeReportText(value, { preserveStudentText: true })
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/gu, "'")
    .replace(/[^a-z0-9ก-๙%'-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
