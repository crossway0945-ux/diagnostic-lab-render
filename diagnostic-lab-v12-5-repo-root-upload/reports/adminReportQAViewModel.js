export function buildAdminReportQAViewModel(record = {}, records = [], pdfQA = {}) {
  const groupId = String(record.submissionGroupId || "").trim();
  const sameGroup = records.filter((item) => String(item.submissionGroupId || "").trim() === groupId);
  const excludedLegacyGroups = [...new Set(records
    .map((item) => String(item.submissionGroupId || "").trim())
    .filter((id) => id && id !== groupId))];
  return Object.freeze({
    schema: "AdminReportQAViewModel.v12",
    latestSubmissionGroupId: groupId,
    validVersionIds: sameGroup.map((item) => item.submissionId || "").filter(Boolean),
    excludedLegacyGroups,
    representativeReportVersion: sameGroup.at(-1)?.submissionId || record.submissionId || "",
    distinctStudentSubmissionCount: new Set(records.map((item) => item.submissionGroupId || item.studentWorkFingerprint || item.submissionId)).size,
    previousRangeSource: records.filter((item) => item.submissionGroupId !== groupId).at(-1)?.submissionId || "",
    latestRangeSource: record.submissionId || "",
    repeatedIssueSourceSubmissionGroups: [],
    duplicateCreditResult: record.creditConsumed === false ? "no-additional-credit" : "not-recorded",
    pdfQA
  });
}
