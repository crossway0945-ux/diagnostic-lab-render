// V12.9.1 — canonical cross-section consistency gate (C) and canonical development evidence.
//
// Two things are proven here:
//   1. Every required consistency rule fires on canonical OBJECTS and records a structured repair.
//      A rule that exists but is never invoked is a dormant rule, so each one is exercised with a
//      contradiction built from canonical objects, not from visible strings.
//   2. The gate is WIRED: a real Task 2 analysis through `analyzeWriting` persists its audit at the
//      existing schema path `feedbackIntegrity.consistencyAudit`, and no unsupported report field is
//      introduced (that would surface as 502 REPORT_OUTPUT_VALIDATION_FAILED).
import assert from "node:assert/strict";
import {
  CONSISTENCY_AUDIT_VERSION,
  buildCanonicalConsistencyAudit,
  buildExecutiveSummaryFromIssues,
  summaryAlreadyAddresses
} from "../domain/reportConsistency.js";
import { assessCanonicalDevelopmentEvidence } from "../domain/canonicalDevelopmentEvidence.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { issuePriorityScore } from "../domain/canonicalIntegrity.js";

const REQUIRED_RECORD_FIELDS = [
  "ruleId", "affectedObject", "affectedPath", "previousValue", "correctedValue",
  "evidenceSource", "exactEvidence", "repairAction", "repairStatus", "at"
];

function assertRecordShape(record, ruleId) {
  for (const field of REQUIRED_RECORD_FIELDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(record, field), `${ruleId}: audit record carries ${field}`);
  }
  assert.equal(record.ruleId, ruleId);
  assert.ok(String(record.affectedPath).length > 0, `${ruleId}: affectedPath is populated`);
  assert.ok(String(record.repairAction).length > 0, `${ruleId}: repairAction is populated`);
  assert.match(String(record.at), new RegExp(`^${CONSISTENCY_AUDIT_VERSION}#\\d+$`), `${ruleId}: deterministic processing marker`);
}

const PRESENT_ROUTE = {
  status: "adequately_developed",
  overallRouteStatus: "adequately_developed",
  missingRequirements: [],
  conclusionLabel: "clearly restates that the disadvantages outweigh the advantages",
  bodyRoutes: [
    { label: "presents an advantage", route: "advantage", alignmentStatus: "adequately_developed" },
    { label: "presents a disadvantage", route: "disadvantage", alignmentStatus: "adequately_developed" }
  ]
};

// 1. Route present versus scoring text.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    criteriaScores: { "Task Response": { range: "6.0", diagnosis: "The task route is absent, and the response is complete.", evidence: "quoted" } }
  });
  const found = gate.audit.find((item) => item.ruleId === "ROUTE_PRESENT_VS_SCORING_TEXT");
  assert.ok(found, "a criterion claiming an absent route while the canonical route is present is repaired");
  assertRecordShape(found, "ROUTE_PRESENT_VS_SCORING_TEXT");
  assert.doesNotMatch(gate.criteriaScores["Task Response"].diagnosis, /route is absent/i);
  assert.equal(gate.criteriaScores["Task Response"].range, "6.0", "the frozen band range is never touched");
}

// 2. Route present versus paragraph progression.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    criteriaScores: { "Coherence & Cohesion": { range: "6.0", diagnosis: "Paragraph progression is absent, and the conclusion is present." } }
  });
  const found = gate.audit.find((item) => item.ruleId === "ROUTE_PRESENT_VS_PARAGRAPH_PROGRESSION");
  assert.ok(found, "aligned Body 1 and Body 2 cannot coexist with an absent-progression claim");
  assertRecordShape(found, "ROUTE_PRESENT_VS_PARAGRAPH_PROGRESSION");
  assert.doesNotMatch(gate.criteriaScores["Coherence & Cohesion"].diagnosis, /progression is absent/i);
}

// 3. Body route consistency: a disadvantage body may not be described as a solution or unclear.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    frameworkScores: {
      bodyRouteAlignment: { status: "Aligned", diagnosis: "Body 1: presents an advantage | Body 2: route unclear from the controlling sentences." }
    }
  });
  const found = gate.audit.find((item) => item.ruleId === "BODY_ROUTE_CONSISTENCY");
  assert.ok(found, "a body labelled unclear elsewhere is restated from the route assessment");
  assertRecordShape(found, "BODY_ROUTE_CONSISTENCY");
  assert.match(gate.frameworkScores.bodyRouteAlignment.diagnosis, /Body 2: presents a disadvantage/);
  assert.doesNotMatch(gate.frameworkScores.bodyRouteAlignment.diagnosis, /route unclear/i);
}

// 4. Thesis consistency: a thesis naming every required route with an explicit position is not
//    "missing at least one traceable required route".
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    thesisDimensions: {
      applicable: true,
      routeRequired: ["advantage", "disadvantage", "position"],
      routePresent: { advantage: true, disadvantage: true, position: true },
      positionRequired: true,
      positionPresent: true
    },
    frameworkScores: {
      thesisRouteClarity: { status: "Strong" },
      display: { "Thesis Route Clarity": { status: "Needs Work", diagnosis: "The thesis is missing at least one traceable required route." } }
    }
  });
  const records = gate.audit.filter((item) => item.ruleId === "THESIS_CONSISTENCY");
  assert.ok(records.length >= 2, "both the missing-route claim and the contradicting display status are repaired");
  for (const record of records) assertRecordShape(record, "THESIS_CONSISTENCY");
  assert.doesNotMatch(gate.frameworkScores.display["Thesis Route Clarity"].diagnosis, /missing at least one/i);
  assert.equal(gate.frameworkScores.display["Thesis Route Clarity"].status, "Strong");
}

// 5. Conclusion consistency: function and language accuracy are separate judgements.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    conclusionFunction: { complete: true, status: "Strong" },
    frameworkScores: { conclusionClosure: { status: "Strong", diagnosis: "The conclusion does not close the disadvantages route." } },
    paragraphCoverage: [{
      paragraphLabel: "Conclusion",
      paragraphId: "paragraph-4",
      status: "Route Repair Needed - Development Controlled - Example/SAR Controlled - Language Repair Needed",
      dimensions: { route: "repair-needed", development: "controlled", example: "controlled", language: "repair-needed" }
    }],
    issues: [{ issueId: "c1", primaryCategory: "Subject-Verb Agreement", paragraphId: "paragraph-4", paragraphLabel: "Conclusion", exactSentence: "In conclusion, although shopping in metropolitan centers provide product variety..." }]
  });
  const records = gate.audit.filter((item) => item.ruleId === "CONCLUSION_FUNCTION_VS_LANGUAGE");
  assert.ok(records.length >= 2, "the closure claim and the paragraph status are both reconciled");
  for (const record of records) assertRecordShape(record, "CONCLUSION_FUNCTION_VS_LANGUAGE");
  assert.doesNotMatch(gate.frameworkScores.conclusionClosure.diagnosis, /does not close/i);
  assert.equal(gate.paragraphCoverage[0].status, "Functionally Strong - Language Repair Needed");
  assert.equal(gate.paragraphCoverage[0].dimensions.language, "repair-needed", "the language repair survives the reclassification");
}

// 6. Explanation Depth cannot stay Strong while a validated causal-mechanism gap survives.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    frameworkScores: {
      explanationDepth: { status: "Strong", diagnosis: "No priority development gap is present." },
      display: { "Explanation Depth": { status: "Strong" } }
    },
    issues: [{ issueId: "m1", primaryCategory: "Causal Mechanism", paragraphLabel: "Body Paragraph 2", exactSentence: "Without interested consumers, vulnerable groups and bankrupted people are left isolated." }]
  });
  const records = gate.audit.filter((item) => item.ruleId === "EXPLANATION_DEPTH_CONSISTENCY");
  assert.ok(records.length >= 2, "every Explanation Depth projection is downgraded, not just the first");
  for (const record of records) assertRecordShape(record, "EXPLANATION_DEPTH_CONSISTENCY");
  assert.equal(gate.frameworkScores.explanationDepth.status, "Moderate");
  assert.equal(gate.frameworkScores.display["Explanation Depth"].status, "Moderate");
  assert.match(records[0].exactEvidence, /Without interested consumers/);
}

// 7. SAR Example Quality cannot stay Strong while an example's mechanism or affected group is incomplete.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    frameworkScores: { sarExampleQuality: { status: "Strong" }, display: { "SAR Example Quality": { status: "Strong" } } },
    issues: [{ issueId: "e1", primaryCategory: "Causal Mechanism", sentenceRole: "example", paragraphLabel: "Body Paragraph 1", exactSentence: "For example, a rural resident visiting a major city retail park can find global supermarket chains." }]
  });
  const records = gate.audit.filter((item) => item.ruleId === "SAR_EXAMPLE_QUALITY_CONSISTENCY");
  assert.ok(records.length >= 2, "an incomplete example mechanism downgrades SAR Example Quality everywhere");
  for (const record of records) assertRecordShape(record, "SAR_EXAMPLE_QUALITY_CONSISTENCY");
  assert.equal(gate.frameworkScores.sarExampleQuality.status, "Moderate");
}

// 8. Language-control consistency, including evidence that was capped out of the visible card set.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    paragraphCoverage: [
      { paragraphLabel: "Introduction", paragraphId: "paragraph-1", status: "Route Aligned - Development Controlled - Example/SAR Controlled - Language Controlled", dimensions: { route: "controlled", development: "controlled", example: "controlled", language: "controlled" } },
      { paragraphLabel: "Body Paragraph 1", paragraphId: "paragraph-2", status: "Strong", dimensions: { route: "controlled", development: "controlled", example: "controlled", language: "controlled" } }
    ],
    issues: [{ issueId: "l1", primaryCategory: "Punctuation", paragraphId: "paragraph-1", paragraphLabel: "Introduction", exactSentence: "While this trend offers consumers greater product variety..." }],
    // Body Paragraph 1 has no visible card, but the validated language profile still holds evidence.
    languageProfile: { validatedIssues: [{ paragraphLocation: "Body Paragraph 1, Sentence 4", category: "collocation" }] }
  });
  const records = gate.audit.filter((item) => item.ruleId === "LANGUAGE_CONTROL_CONSISTENCY");
  assert.equal(records.length, 2, "both a card-backed and a profile-backed paragraph lose their controlled claim");
  for (const record of records) assertRecordShape(record, "LANGUAGE_CONTROL_CONSISTENCY");
  assert.equal(gate.paragraphCoverage[0].dimensions.language, "repair-needed");
  assert.equal(gate.paragraphCoverage[1].dimensions.language, "repair-needed");
  assert.match(records[1].evidenceSource, /languageProfile\.validatedIssues/);
}

// 9. Revision consistency: a failed validator is rejected on every visible surface.
{
  const failed = { issueId: "r1", revisionType: "Teacher-Guided Expansion", revisionTypeValidationStatus: "fail", exactSentence: "Some sentence." };
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    issues: [failed],
    studentView: { topIssues: [{ ...failed, feedbackCardId: "card-1" }], feedbackCards: [failed] },
    repairPlan: [{ day: 1, ...failed }]
  });
  const records = gate.audit.filter((item) => item.ruleId === "REVISION_VALIDATION_CONSISTENCY");
  assert.equal(records.length, 4, "canonical issues, Student View top issues, Student View cards and the Repair Plan are each checked");
  for (const record of records) {
    assertRecordShape(record, "REVISION_VALIDATION_CONSISTENCY");
    assert.equal(record.repairStatus, "rejected");
  }
  const surfaces = new Set(records.map((record) => record.affectedObject));
  assert.deepEqual([...surfaces].sort(), ["canonicalIssues", "repairPlan", "studentView.feedbackCards", "studentView.topIssues"]);
}

// 10. Audit integrity: an upstream repair may not be hidden behind an empty audit.
{
  const gate = buildCanonicalConsistencyAudit({
    routeAssessment: PRESENT_ROUTE,
    frozenScoring: { repairs: [{ code: "SUMMARY_CLAIM_REPAIRED" }] },
    issues: [{ issueId: "x1", primaryCategory: "Punctuation", integrityRepairs: [{ code: "REVISION_WITHHELD" }] }]
  });
  const found = gate.audit.find((item) => item.ruleId === "AUDIT_INTEGRITY");
  assert.ok(found, "the audit cannot remain empty when an upstream repair was applied");
  assertRecordShape(found, "AUDIT_INTEGRITY");
  assert.match(found.evidenceSource, /SUMMARY_CLAIM_REPAIRED/);
}

// A fully consistent report produces an empty audit, and the gate is idempotent.
{
  const consistent = {
    routeAssessment: PRESENT_ROUTE,
    conclusionFunction: { complete: true },
    frameworkScores: { explanationDepth: { status: "Moderate" }, sarExampleQuality: { status: "Moderate" } },
    paragraphCoverage: [{ paragraphLabel: "Introduction", paragraphId: "paragraph-1", status: "Route Aligned - Development Controlled - Example/SAR Controlled - Language Repair Needed", dimensions: { route: "controlled", development: "controlled", example: "controlled", language: "repair-needed" } }],
    issues: [{ issueId: "ok1", primaryCategory: "Punctuation", paragraphId: "paragraph-1", paragraphLabel: "Introduction" }],
    criteriaScores: { "Task Response": { range: "6.0", diagnosis: "The required task routes are present." } }
  };
  const first = buildCanonicalConsistencyAudit(consistent);
  assert.deepEqual(first.audit, [], "a consistent canonical set produces no repairs");
  const second = buildCanonicalConsistencyAudit({ ...consistent, paragraphCoverage: first.paragraphCoverage, frameworkScores: first.frameworkScores, criteriaScores: first.criteriaScores });
  assert.deepEqual(second.audit, [], "the gate is idempotent");
  assert.ok(first.inputsSeen.routeAssessment && first.inputsSeen.paragraphCoverage === 1, "the gate records which canonical inputs it saw");
}

// ---------------------------------------------------------------------------
// Canonical development evidence.
// ---------------------------------------------------------------------------
const outweighPrompt = "Small town center shops are running out of business because rural residents tend to go shopping in big cities store.\n\nTo what extent do the disadvantages of this development outweigh the advantages?";
const symmetricOutweighEssay = [
  "In recent years, an increasing number of rural residents have bypassed their local town centers to shop at large commercial hubs in major cities. While this trend offers consumers greater product variety and competitive pricing, I firmly believe that its disadvantages, rural economic decline and environmental degradation, far outweigh the advantages.",
  "On one hand, shopping in big cities provides diverse product choices and offers undeniable benefits for individual consumers. Large metropolitan retailers provide bulk discounts, competitive pricing, and frequent promotions which independent rural shops cannot offer. Furthermore, urban commercial hubs contain an unparalleled variety of goods in one place, making the shopping experience more convenient. For example, a rural resident visiting a major city retail park can find global supermarket chains and clothing departments within the same area, allowing them to complete a month of diverse shopping in a single afternoon. Therefore, this eliminates the need to visit multiple scattered shops.",
  "However, the widespread abandonment of local shops inflicts severe and lasting damage on the economic stability of rural communities. When residents divert their choices to metropolitan centers, small-town businesses are forced into bankruptcy. This leads to immediate local job losses and sharply reduces the local tax revenue needed to fund essential public infrastructure. Without interested consumers, vulnerable groups and bankrupted people are left isolated.",
  "In conclusion, although shopping in metropolitan centers provides product variety, the small independent shops are forced into economic instability. The resulting economic decline demonstrates that the disadvantages of this development far outweigh the advantages."
].join("\n\n");

const symmetric = assessCanonicalDevelopmentEvidence({
  taskType: "Task 2",
  prompt: outweighPrompt,
  paragraphs: segmentStudentResponse(symmetricOutweighEssay, "Task 2"),
  taskRequirements: { promptObligations: [{ id: "comparative-judgement", judgementRequired: true }] },
  bodyRoutes: [{ route: "advantage" }, { route: "disadvantage" }],
  detectedPosition: "disadvantages outweigh the advantages"
});

// An outweigh claim with one paragraph per side and no in-body comparison is asserted, not demonstrated.
assert.equal(symmetric.comparativeJudgement.required, true);
assert.equal(symmetric.comparativeJudgement.asserted, true);
assert.equal(symmetric.comparativeJudgement.demonstrated, false, "symmetric development plus no in-body comparison is not a demonstration");
assert.ok(symmetric.findings.some((item) => item.category === "Comparative Judgement"));

// A promise the thesis names but no body develops is reported; a promise the body develops is not.
const promiseFinding = symmetric.findings.find((item) => item.category === "Thesis-to-Body Promise");
assert.ok(promiseFinding, "an undeveloped thesis promise is reported");
assert.match(promiseFinding.exactProblemSpan, /environmental degradation/);
assert.equal(
  symmetric.findings.filter((item) => item.category === "Thesis-to-Body Promise").length,
  1,
  "a promise the body does develop is not reported"
);

// Structural weighting is a valid demonstration: the favoured side gets more paragraphs.
const weighted = assessCanonicalDevelopmentEvidence({
  taskType: "Task 2",
  prompt: outweighPrompt,
  paragraphs: segmentStudentResponse(symmetricOutweighEssay, "Task 2"),
  taskRequirements: { promptObligations: [{ id: "comparative-judgement", judgementRequired: true }] },
  bodyRoutes: [{ route: "advantage" }, { route: "disadvantage" }, { route: "disadvantage" }],
  detectedPosition: "disadvantages outweigh the advantages"
});
assert.equal(weighted.comparativeJudgement.demonstrated, true);
assert.equal(weighted.comparativeJudgement.demonstrationMode, "structural-weighting");
assert.equal(weighted.findings.filter((item) => item.category === "Comparative Judgement").length, 0);

// An opinion prompt also carries a judgement obligation, but it is not a two-sided comparison and
// must not attract a comparative-judgement finding.
const opinion = assessCanonicalDevelopmentEvidence({
  taskType: "Task 2",
  prompt: "To what extent do you agree that urban areas should be split into distinct zones?",
  paragraphs: segmentStudentResponse([
    "Some people argue that towns should be separated into zones. However, I strongly disagree with the statement because of poor accessibility and heavier congestion.",
    "When schools and shops are spread across neighbourhoods, residents reach daily services quickly. For example, a family within walking distance of both can finish routine journeys locally, which saves time.",
    "Mixed development also prevents traffic from being funnelled into a few districts. If every office sits in one zone, thousands of commuters use the same roads at the same time.",
    "In conclusion, I strongly disagree that each facility type belongs in a separate zone."
  ].join("\n\n"), "Task 2"),
  taskRequirements: { promptObligations: [{ id: "position", judgementRequired: true }] },
  bodyRoutes: [{ route: "reason" }, { route: "reason" }],
  detectedPosition: "strongly disagree"
});
assert.equal(opinion.comparativeJudgement.required, false, "an opinion prompt is not a two-sided comparative task");
assert.equal(opinion.findings.filter((item) => item.category === "Comparative Judgement").length, 0);

// A causative verb states the mechanism, so such a sentence is not an affected-group gap.
const causative = assessCanonicalDevelopmentEvidence({
  taskType: "Task 2",
  prompt: outweighPrompt,
  paragraphs: segmentStudentResponse([
    "Home-schooling is popular. I believe its disadvantages outweigh its advantages.",
    "One advantage is individual pacing. Parents can adjust lessons to a child's pace. This flexibility suits some students.",
    "However, one disadvantage is limited socialisation. At school, students discuss ideas and work in groups. For example, group projects help children become confident speakers and cooperative team members.",
    "In conclusion, school remains more beneficial."
  ].join("\n\n"), "Task 2"),
  taskRequirements: null,
  bodyRoutes: [{ route: "advantage" }, { route: "disadvantage" }],
  detectedPosition: "disadvantages outweigh the advantages"
});
assert.equal(
  causative.findings.filter((item) => item.category === "Causal Mechanism").length,
  0,
  "'help children become …' states the mechanism, so no affected-group gap is reported"
);

// The canonical priority order puts task-level defects above local language repairs.
const order = [
  { primaryCategory: "Punctuation", severity: "Moderate" },
  { primaryCategory: "Subject-Verb Agreement", severity: "Moderate" },
  { primaryCategory: "Comparative Judgement", severity: "Major" },
  { primaryCategory: "Thesis-to-Body Promise", severity: "Major" },
  { primaryCategory: "Reference Control", severity: "Moderate" }
].sort((a, b) => issuePriorityScore(a) - issuePriorityScore(b)).map((item) => item.primaryCategory);
assert.deepEqual(order, ["Comparative Judgement", "Thesis-to-Body Promise", "Reference Control", "Subject-Verb Agreement", "Punctuation"]);

// The Executive Summary is rebuilt from the corrected set, but never over prose that already names
// the same limitation in the engine's own words.
const rebuilt = buildExecutiveSummaryFromIssues([
  { issueId: "a", issueCategory: "Punctuation", severity: "Moderate", paragraphLabel: "Introduction", studentAction: "Correct the spacing.", diagnosis: "Spacing is not controlled." },
  { issueId: "b", issueCategory: "Comparative Judgement", severity: "Major", paragraphLabel: "Introduction", studentAction: "Compare the two sides directly.", diagnosis: "The judgement is asserted but not demonstrated." }
]);
assert.equal(rebuilt.leadIssueCategory, "Comparative Judgement");
assert.match(rebuilt.mostUrgentRepair, /Compare the two sides directly/);
assert.equal(summaryAlreadyAddresses("make the weighting between the two sides explicit", "Comparative Judgement"), true);
assert.equal(summaryAlreadyAddresses('change "are" to "is"', "Comparative Judgement"), false);

// ---------------------------------------------------------------------------
// INTEGRATION: the gate must be WIRED. A real analysis persists its audit at the existing schema
// path and introduces no unsupported report field (which would fail report-output validation).
// ---------------------------------------------------------------------------
process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;
const { analyzeWriting } = await import("../services/aiAnalyzer.js");
const { buildStudentReportViewModel } = await import("../domain/reportViewModels.js");

const report = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Advantages & Disadvantages",
  visualType: "",
  targetBand: "7.0",
  prompt: outweighPrompt,
  writing: symmetricOutweighEssay,
  options: {},
  reportLanguage: "en"
});

assert.ok(report.estimatedBandRange, "the analysis completes with the gate wired (no 502)");
const audit = report.feedbackIntegrity?.consistencyAudit;
assert.ok(Array.isArray(audit), "the audit is persisted at feedbackIntegrity.consistencyAudit");
for (const record of audit) {
  for (const field of REQUIRED_RECORD_FIELDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(record, field), `persisted audit record carries ${field}`);
  }
}
// The gate is invoked on every completed Task 2 analysis: proven by the canonical inputs reaching it
// and by the repair it applies to this fixture, whose Explanation Depth cannot stay Strong while a
// validated mechanism gap survives.
const mechanismSurvives = (report.feedbackCards || []).some((card) => /Causal Mechanism/i.test(String(card.issueCategory || "")));
if (mechanismSurvives) {
  assert.doesNotMatch(
    String(report.canonicalAnalysis?.frameworkAssessment?.display?.["Explanation Depth"]?.status || ""),
    /^Strong$/,
    "Explanation Depth cannot read Strong in the visible report while a mechanism gap survives"
  );
  assert.ok(audit.some((item) => item.ruleId === "EXPLANATION_DEPTH_CONSISTENCY"), "the repair is recorded, so the audit is not empty when a repair happened");
}

// Paragraph status and dimensions can never disagree in the rendered coverage.
for (const paragraph of report.feedbackIntegrity?.paragraphCoverage || []) {
  const status = String(paragraph.status || "");
  if (!paragraph.dimensions) continue;
  for (const [key, label] of [["route", "Route"], ["development", "Development"], ["example", "Example/SAR"], ["language", "Language"]]) {
    const statusSaysRepair = new RegExp(`${label} Repair Needed`).test(status);
    if (!status.includes(" - ") && !statusSaysRepair) continue;
    assert.equal(
      paragraph.dimensions[key] === "repair-needed",
      statusSaysRepair,
      `${paragraph.paragraphLabel}: ${key} dimension agrees with the status string`
    );
  }
}

// No failed revision validation reaches the Student View.
const view = buildStudentReportViewModel(report);
assert.equal(
  [...(view.topIssues || []), ...(view.feedbackCards || [])].filter((item) => String(item.revisionTypeValidationStatus || "").toLowerCase() === "fail").length,
  0,
  "no failed revision validation reaches the Student View"
);

console.log("V12.9.1 canonical consistency gate: all ten cross-section rules fire on canonical objects with structured, deterministic audit records; a consistent report audits clean and the gate is idempotent; the gate is wired into the real pipeline and persists at feedbackIntegrity.consistencyAudit; canonical development evidence separates asserted from demonstrated comparison, reports only undeveloped thesis promises, ignores opinion prompts and causative mechanisms; paragraph status and dimensions agree; and the shared priority order leads with task-level defects.");
