export const CANONICAL_ISSUE_REQUIRED_FIELDS = Object.freeze([
  "issueId",
  "taskType",
  "sourceParagraphId",
  "sourceSentenceId",
  "paragraphLabel",
  "paragraphLocation",
  "sentenceRole",
  "secondarySentenceRoles",
  "exactEvidence",
  "normalizedEvidence",
  "evidenceStartOffset",
  "evidenceEndOffset",
  "targetSpan",
  "targetStartOffset",
  "targetEndOffset",
  "evidenceAssertionType",
  "detectedDefect",
  "expectedCorrection",
  "evidenceValidationStatus",
  "issueCategory",
  "secondaryIssueCategories",
  "criteriaAffected",
  "frameworkComponents",
  "repairTargets",
  "targetedRevision",
  "revisionType",
  "revisionAlignmentStatus",
  "revisionWithheld",
  "studentAction"
]);

export const CANONICAL_EVIDENCE_VALIDATION_STATUSES = Object.freeze([
  "validated",
  "rejected"
]);

export const CANONICAL_REVISION_ALIGNMENT_STATUSES = Object.freeze([
  "aligned",
  "partial-repair",
  "revision-type-mismatch",
  "withheld"
]);

export function validateCanonicalIssueShape(issue = {}) {
  const missing = CANONICAL_ISSUE_REQUIRED_FIELDS.filter((field) => !(field in issue));
  const problems = missing.map((field) => `Missing canonical issue field: ${field}`);
  if (!CANONICAL_EVIDENCE_VALIDATION_STATUSES.includes(String(issue.evidenceValidationStatus || ""))) {
    problems.push(`Invalid evidenceValidationStatus: ${issue.evidenceValidationStatus || "(empty)"}`);
  }
  if (!CANONICAL_REVISION_ALIGNMENT_STATUSES.includes(String(issue.revisionAlignmentStatus || ""))) {
    problems.push(`Invalid revisionAlignmentStatus: ${issue.revisionAlignmentStatus || "(empty)"}`);
  }
  return problems;
}
