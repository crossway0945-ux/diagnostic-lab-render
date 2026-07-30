import assert from "node:assert/strict";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import {
  assertFrameworkEvidenceContract,
  buildFrameworkEvidenceContract,
  isPositiveFrameworkRating
} from "../domain/frameworkEvidence.js";
import {
  buildIssueReferenceParityAudit,
  finaliseCanonicalIssueGraph
} from "../domain/canonicalIssueGraph.js";
import {
  correctLexicalTargetSpan,
  dedupeCanonicalIssues
} from "../domain/canonicalIntegrity.js";
import {
  deduplicateLanguagePatternSummary,
  planReportDensity
} from "../domain/reportDensity.js";
import {
  assertPrintableTextIntegrity,
  normalizeVisibleText,
  printableTextViolations,
  sanitizePrintableText,
  unicodeIntegrityIssues
} from "../domain/textIntegrity.js";
import { pdfTextIntegrityIssues } from "../domain/pdfTextIntegrity.js";
import { buildEvidenceAssertion, minimalTextDiff } from "../domain/evidenceAssertions.js";
import {
  assertStudentReportViewModel,
  buildStudentReportViewModel
} from "../domain/reportViewModels.js";

process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

assert.deepEqual(
  minimalTextDiff("These privileges remain.", "These personal advantages remain."),
  {
    changed: true,
    originalStart: 6,
    originalEnd: 16,
    revisedStart: 6,
    revisedEnd: 25,
    originalSpan: "privileges",
    revisedSpan: "personal advantages"
  },
  "minimal corrections expose complete source and replacement words rather than internal character fragments"
);
const comparisonSentence = "Large stores offer commodities at significantly lower prices than small vendors.";
const comparisonAssertion = buildEvidenceAssertion({
  card: {
    issueType: "Lexical Precision",
    exactProblemSpan: "lower prices than small vendors",
    targetedRevision: "Large stores offer commodities at significantly lower prices than those charged by small vendors.",
    evidenceAssertionType: "lexical_meaning"
  },
  issueCategory: "Lexical Precision",
  evidence: comparisonSentence,
  writing: comparisonSentence,
  sentenceRole: "explanation",
  taskType: "Task 2"
});
assert.equal(comparisonAssertion.targetSpan, "lower prices than small vendors");
assert.equal(comparisonAssertion.correctedSpan, "lower prices than those charged by small vendors");

const completeRequirements = [
  { id: "advantages", status: "adequately developed", evidence: "Body 1 explains the main advantage." },
  { id: "disadvantages", status: "adequately developed", evidence: "Body 2 explains the main disadvantage." },
  { id: "judgement", status: "controlled", evidence: "I believe the disadvantages outweigh the advantages." },
  { id: "conclusion", status: "complete", evidence: "In conclusion, the disadvantages outweigh the advantages." }
];

const body = (index, overrides = {}) => ({
  index,
  alignmentStatus: "controlled",
  controllingSentence: index === 1
    ? "The main advantage is greater consumer choice."
    : "The main disadvantage is the decline of rural businesses.",
  explanationMechanism: index === 1
    ? "Greater competition lowers prices, so households can buy more with the same income."
    : "Lost customers reduce revenue, so local firms close and local jobs disappear.",
  exampleSupport: index === 1
    ? "For example, one retail park lets a rural shopper compare several stores in one visit."
    : "For example, a family shop may close after its regular customers move their spending online.",
  linkBack: index === 1
    ? "This makes shopping more convenient for rural consumers."
    : "This weakens the economic stability of the rural community.",
  ...overrides
});

const route = (bodyRoutes = [body(1), body(2)]) => ({
  confidence: "high",
  missingRequirements: [],
  thesisRouteStatus: "controlled",
  overallRouteStatus: "controlled",
  semanticPosition: {
    positionClarity: "clear",
    positionConsistency: "consistent",
    positionConfidence: "high",
    exactPositionEvidence: "I believe the disadvantages outweigh the advantages."
  },
  requirements: completeRequirements,
  bodyRoutes
});

const frameworkScores = {
  "Essay Type Recognition": { status: "Strong", diagnosis: "The response uses the required route." },
  "Prompt Coverage": { status: "Strong", diagnosis: "Both sides and the judgement are addressed." },
  "Thesis Route Clarity": { status: "Strong", diagnosis: "The thesis is clear." },
  "Body Paragraph Route Alignment": { status: "Aligned", diagnosis: "The body routes align." },
  "Explanation Depth": { status: "Strong", diagnosis: "The explanations are controlled." },
  "SAR Example Quality": { status: "Strong", diagnosis: "The support is controlled." },
  "Link Back Control": { status: "Strong", diagnosis: "The ideas remain controlled." },
  "Conclusion Closure": { status: "Strong", diagnosis: "The conclusion closes the route." },
  "LFC CPC Control": { status: "Strong", diagnosis: "The language is controlled." }
};

const conclusionFunction = { complete: true };

function contractFor(bodyRoutes, issues = [], scores = frameworkScores) {
  return buildFrameworkEvidenceContract({
    taskType: "Task 2",
    frameworkScores: scores,
    routeAssessment: route(bodyRoutes),
    thesisDimensions: { structurallyClear: true },
    canonicalIssues: issues,
    conclusionFunction,
    languageProfile: {},
    criteriaScores: {
      "Task Response": { range: "6.5" },
      "Coherence & Cohesion": { range: "6.5" },
      "Lexical Resource": { range: "6.0-6.5" },
      "Grammatical Range & Accuracy": { range: "6.0-6.5" }
    }
  });
}

// 1. The production Eva shape: Body 1 has strong support; Body 2 has no example and a surviving
// mechanism gap. The aggregate must be Mixed and the paragraph evidence must explain why.
const mechanismIssue = {
  issueId: "mechanism-body-2",
  issueCategory: "Causal Mechanism",
  paragraphLocation: "Body Paragraph 2",
  exactSentence: "Without interested consumers, vulnerable groups and bankrupted people are left isolated."
};
const evaShape = contractFor([
  body(1),
  body(2, {
    exampleSupport: "",
    explanationMechanism: "Without interested consumers, vulnerable groups and bankrupted people are left isolated."
  })
], [mechanismIssue]);
const evaSar = evaShape.dimensions["SAR Example Quality"];
assert.equal(evaSar.rating, "Mixed");
assert.deepEqual(evaSar.paragraphCoverage.map((item) => item.status), ["Strong Support", "Development Repair Needed"]);
assert.equal(evaSar.positiveEvidence.length, 1);
assert.equal(evaSar.limitingEvidence.length, 1);
assert.doesNotMatch(evaSar.rationale, /no priority example|therefore strong/i);

// 2. Absence is not praise. No example, no complete explanation and no positive record cannot
// become Strong merely because no issue was promoted.
const absentEvidence = contractFor([
  body(1, { exampleSupport: "", explanationMechanism: "" }),
  body(2, { exampleSupport: "", explanationMechanism: "" })
], []);
assert.equal(absentEvidence.dimensions["SAR Example Quality"].rating, "Not Demonstrated");
assert.equal(absentEvidence.dimensions["SAR Example Quality"].positiveEvidence.length, 0);
assert.equal(absentEvidence.dimensions["LFC CPC Control"].rating, "Not Assessed");

// 3. Two positively demonstrated examples may aggregate to Strong.
const strongEvidence = contractFor([body(1), body(2)]);
assert.equal(strongEvidence.dimensions["SAR Example Quality"].rating, "Strong");
assert.equal(strongEvidence.dimensions["SAR Example Quality"].positiveEvidence.length, 2);

// 4. An explicit example is not a quota. A complete causal explanation in both paragraphs is
// Controlled, while one strong paragraph plus one unproven paragraph is Mixed.
const completeWithoutExample = contractFor([
  body(1, { exampleSupport: "" }),
  body(2, { exampleSupport: "" })
]);
assert.equal(completeWithoutExample.dimensions["SAR Example Quality"].rating, "Controlled");
assert.deepEqual(
  completeWithoutExample.dimensions["SAR Example Quality"].paragraphCoverage.map((item) => item.status),
  ["Explanation Sufficient Without Example", "Explanation Sufficient Without Example"]
);
const oneStrongOneWeak = contractFor([
  body(1),
  body(2, { exampleSupport: "", explanationMechanism: "" })
]);
assert.equal(oneStrongOneWeak.dimensions["SAR Example Quality"].rating, "Mixed");

// 5. Every positive framework rating requires real evidence, and Task 1 never inherits Task 2 SAR.
for (const testContract of [evaShape, absentEvidence, strongEvidence, completeWithoutExample, oneStrongOneWeak]) {
  assert.doesNotThrow(() => assertFrameworkEvidenceContract(testContract));
  for (const dimension of Object.values(testContract.dimensions)) {
    if (!isPositiveFrameworkRating(dimension.rating)) continue;
    assert.ok(dimension.positiveEvidence.length > 0, `${dimension.frameworkDimension} needs positive evidence`);
    assert.ok(dimension.positiveEvidence.every((item) => item.evidenceId && item.paragraphLabel && item.exactEvidence));
  }
}
const task1Contract = buildFrameworkEvidenceContract({
  taskType: "Task 1",
  frameworkScores: { "Task Achievement": { status: "Strong", diagnosis: "The overview is accurate." } }
});
assert.equal(task1Contract.taskType, "Task 1");
assert.equal(Object.hasOwn(task1Contract.dimensions, "SAR Example Quality"), false);
assert.match(task1Contract.note, /does not inherit Task 2 SAR/i);

// 6. One canonical issue id must keep one action everywhere. Paragraph Coverage and Repair Plan
// fail closed if an action is swapped between Comparative Judgement, Thesis Promise and Mechanism.
const issueGraph = finaliseCanonicalIssueGraph([
  {
    issueId: "comparison",
    issueCategory: "Comparative Judgement",
    severity: "Major",
    studentAction: "Compare the two effects directly and explain why one matters more."
  },
  {
    issueId: "promise",
    issueCategory: "Thesis-to-Body Promise",
    severity: "Major",
    studentAction: "Develop environmental degradation or remove it from the thesis."
  },
  {
    issueId: "mechanism",
    issueCategory: "Causal Mechanism",
    severity: "Major",
    studentAction: "Explain how lost customers create the stated consequence."
  }
]);
const parityPass = buildIssueReferenceParityAudit(issueGraph, {
  paragraphCoverage: [{
    paragraphLabel: "Body Paragraph 2",
    priorityIssueId: "mechanism",
    priorityRepair: "Explain how lost customers create the stated consequence."
  }],
  repairPlan: [{
    day: 1,
    issueId: "comparison",
    title: "Comparative Judgement",
    task: "Compare the two effects directly and explain why one matters more."
  }]
});
assert.ok(parityPass.every((item) => item.pass));
const parityFail = buildIssueReferenceParityAudit(issueGraph, {
  paragraphCoverage: [{
    paragraphLabel: "Body Paragraph 2",
    priorityIssueId: "mechanism",
    priorityRepair: "Develop environmental degradation or remove it from the thesis."
  }],
  repairPlan: [{
    day: 1,
    issueId: "comparison",
    title: "Comparative Judgement",
    task: "Explain how lost customers create the stated consequence."
  }]
});
assert.equal(parityFail.length, 2);
assert.ok(parityFail.every((item) => !item.pass));

// 7. A provider issue that mixes lexical meaning, agreement and comparative development is
// normalised to lexical meaning only. The real agreement and comparison remain separate issues.
const mixedProviderIssue = {
  issueId: "provider-mixed",
  issueCategory: "Lexical Precision",
  primaryCategory: "Lexical Precision",
  targetSpan: "are",
  exactSentence: "Therefore, the promotion of small town center shops are vital to prevent economic decline.",
  exactEvidence: "Therefore, the promotion of small town center shops are vital to prevent economic decline.",
  diagnosis: "The singular subject needs agreement, and this wording does not provide comparative weighing.",
  targetedRevision: "Therefore, the promotion of small town center shops is vital to prevent economic decline.",
  revisionType: "Minimal Correction"
};
const correctedLexical = correctLexicalTargetSpan(mixedProviderIssue);
assert.equal(correctedLexical.changed, true);
assert.equal(correctedLexical.issue.issueCategory, "Lexical Precision");
assert.equal(correctedLexical.issue.targetSpan, "promotion of small town center shops");
assert.deepEqual(correctedLexical.issue.criteria, ["Lexical Resource"]);
assert.deepEqual(correctedLexical.issue.secondaryCategories, []);
assert.match(correctedLexical.issue.kruPomDiagnosis, /advertising.*supporting or preserving/i);
assert.doesNotMatch(correctedLexical.issue.kruPomDiagnosis, /singular subject|comparative weighing/i);
const independent = dedupeCanonicalIssues([
  correctedLexical.issue,
  {
    issueId: "agreement",
    issueCategory: "Subject-Verb Agreement",
    targetSpan: "are",
    exactSentence: mixedProviderIssue.exactSentence,
    studentAction: "Change are to is."
  },
  {
    issueId: "comparison",
    issueCategory: "Comparative Judgement",
    targetSpan: "far outweigh",
    exactSentence: "The disadvantages far outweigh the advantages.",
    studentAction: "Demonstrate the comparison in a body paragraph."
  }
]);
assert.equal(independent.length, 3);

// 8. The late summary threshold cannot be bypassed; duplicates are removed after the final merge,
// while two independent targets in one sentence remain separate.
const lowValue = {
  category: "vague noun choice",
  exactSentence: "Several products are available within the same area.",
  exactProblemSpan: "same area",
  paragraphLocation: "Body Paragraph 1",
  explanation: "Understandable but slightly imprecise optional polish.",
  affectsMeaning: false
};
assert.equal(planReportDensity({ issues: [], refinements: [lowValue] }).summaryRows.length, 0);
const rowA = {
  issueId: "",
  category: "Article Control",
  paragraphLocation: "Introduction",
  targetSpan: "policy",
  diagnosis: "A singular countable noun needs an article.",
  action: "Add an article.",
  recurrence: ""
};
assert.equal(deduplicateLanguagePatternSummary([rowA, { ...rowA }]).length, 1);
assert.equal(deduplicateLanguagePatternSummary([
  rowA,
  { ...rowA, category: "Word Form", targetSpan: "economy", diagnosis: "Use the adjective economic.", action: "Change the word form." }
]).length, 2);

// 9. Unicode/PDF text-layer gates reject every noncharacter plane, lone surrogates and the known
// corrupted separator, repair only the deterministic word-boundary case, and preserve real dashes.
const noncharacters = [
  "\uFDD0",
  "\uFFFE",
  String.fromCodePoint(0x1FFFE),
  String.fromCodePoint(0x10FFFF)
];
for (const character of noncharacters) {
  assert.ok(unicodeIntegrityIssues(`bad${character}text`).includes("UNICODE_NONCHARACTER"));
  assert.ok(printableTextViolations(`bad${character}text`).includes("UNICODE_NONCHARACTER"));
}
assert.ok(unicodeIntegrityIssues(`bad\uD800text`).includes("UNPAIRED_SURROGATE"));
assert.ok(unicodeIntegrityIssues("short\u041b\u0438term").includes("CORRUPTED_SEPARATOR_SEQUENCE"));
assert.equal(sanitizePrintableText("short\u041b\u0438term"), "short-term");
assert.deepEqual(printableTextViolations(sanitizePrintableText("short\u041b\u0438term")), []);
const legitimateDashes = "hyphen-minus - | non-breaking ‑ | en dash – | em dash —";
assert.equal(normalizeVisibleText(legitimateDashes), legitimateDashes);
assert.equal(sanitizePrintableText(legitimateDashes), legitimateDashes);
assert.doesNotThrow(() => assertPrintableTextIntegrity(legitimateDashes));

// 10. Exact Eva production input: correct route and score remain frozen, SAR becomes Mixed, the
// Paragraph Coverage action is human-readable, and Student View contains no internal ids.
const evaPayload = {
  taskType: "Task 2",
  essayType: "Advantages & Disadvantages",
  visualType: "",
  targetBand: "7.0",
  clientSubmissionId: "eva-v12-9-7-permanent-regression",
  prompt: "Small town center shops are running out of business because rural residents tend to go shopping in big cities store.\n\nTo what extent do the disadvantages of this development outweigh the advantages?",
  writing: [
    "In recent years, an increasing number of rural residents have bypassed their local town centers to shop at large commercial hubs in major cities. While this trend offers consumers greater product variety and competitive pricing, I firmly believe that its disadvantages, rural economic decline and environmental degradation, far outweigh the advantages.",
    "On one hand, shopping in big cities provides diverse product choices and offers undeniable benefits for individual consumers, primarily driven by cost-efficiency and product availability. Large metropolitan retailers provide bulk discounts, competitive pricing, and frequent promotions which independent rural shops cannot offer. Furthermore, urban commercial hubs contain an unparalleled variety of goods in one place, making the shopping experience more convenient. For example, a rural resident visiting a major city retail park can find global supermarket chains and clothing departments within the same area, allowing them to complete a month of diverse shopping in a single afternoon. Therefore, this eliminates the need to visit multiple scattered shops while providing items with greater deals.",
    "However, the widespread abandonment of local shops inflicts severe and lasting damage on the economic stability of rural communities. When residents divert their choices to metropolitan centers, small-town businesses are forced into bankruptcy. This leads to immediate local job losses and sharply reduces the local tax revenue needed to fund essential public infrastructure. Without interested consumers, vulnerable groups and bankrupted people are left isolated. Therefore, the promotion of small town center shops are vital to prevent economic decline.",
    "In conclusion, although shopping in metropolitan centers provide product variety and competitive pricing, the small independent shops are forced into an economic instability. The resulting economic decline of small center shops demonstrates that the disadvantages of this development far outweigh the advantages."
  ].join("\n\n"),
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};
const evaAnalysis = await analyzeWriting(evaPayload);
assert.ok(["6.0", "6.0-6.5", "6.5"].includes(evaAnalysis.estimatedBandRange));
assert.equal(evaAnalysis.detectedPosition, "disadvantages outweigh the advantages");
assert.match(evaAnalysis.bodyRouteSummary, /Body 1 route: presents (?:the main |an )advantage/i);
assert.match(evaAnalysis.bodyRouteSummary, /Body 2 route: presents (?:the main |a )disadvantage/i);
assert.match(evaAnalysis.bodyRouteSummary, /Conclusion route: clearly restates that the disadvantages outweigh the advantages/i);
assert.equal(evaAnalysis.kruPomScores["SAR Example Quality"].status, "Mixed");
assert.ok(evaAnalysis.feedbackIntegrity.frameworkEvidence.audit.every((item) => item.pass));
assert.ok(evaAnalysis.feedbackIntegrity.projectionConsistencyAudit.every((item) => item.pass));
for (const paragraph of evaAnalysis.paragraphCoverage) {
  if (!paragraph.priorityIssueId) continue;
  const canonical = evaAnalysis.feedbackCards.find((item) => item.issueId === paragraph.priorityIssueId);
  assert.ok(canonical);
  assert.equal(
    paragraph.priorityRepair.replace(/[–—]/g, "-"),
    canonical.studentAction.replace(/[–—]/g, "-")
  );
  assert.doesNotMatch(paragraph.priorityRepair, /\b(?:issue|development)-[a-z0-9-]+\b/i);
}
const evaStudentView = buildStudentReportViewModel(evaAnalysis);
assert.doesNotThrow(() => assertStudentReportViewModel(evaStudentView));
const evaStudentJson = JSON.stringify(evaStudentView);
assert.doesNotMatch(evaStudentJson, /\b(?:issue|development)-[a-z0-9-]+\b/i);
assert.doesNotMatch(evaStudentJson, /submissionId|canonicalRank|sourceIssueIds/i);
assert.doesNotMatch(JSON.stringify(evaStudentView.languagePatternSummary), /\bsame area\b/i);

// 11. A provider response cannot bypass deterministic evidence reconciliation. Even if the provider
// returns the old false-positive Strong SAR card, the final analysis is recalculated to Mixed.
const providerReplay = structuredClone(evaAnalysis);
providerReplay.kruPomScores["SAR Example Quality"] = {
  status: "Strong",
  diagnosis: "No priority example or SAR gap was promoted."
};
if (providerReplay.feedbackIntegrity?.frameworkEvidence) {
  providerReplay.feedbackIntegrity.frameworkEvidence.dimensions["SAR Example Quality"].rating = "Strong";
  providerReplay.feedbackIntegrity.frameworkEvidence.dimensions["SAR Example Quality"].positiveEvidence = [];
}
process.env.OPENAI_API_KEY = "deterministic-regression-key";
process.env.OPENAI_MODEL = "deterministic-regression-model";
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ output_text: JSON.stringify(providerReplay) })
});
try {
  const replayed = await analyzeWriting({ ...evaPayload, clientSubmissionId: "eva-provider-bypass-regression" });
  assert.equal(replayed.kruPomScores["SAR Example Quality"].status, "Mixed");
  assert.equal(replayed.feedbackIntegrity.frameworkEvidence.dimensions["SAR Example Quality"].rating, "Mixed");
  assert.doesNotMatch(replayed.kruPomScores["SAR Example Quality"].diagnosis, /no priority example/i);
} finally {
  globalThis.fetch = previousFetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
}

// 12. The extracted-text validator passes clean student text and fails the known corruption,
// internal ids and missing semantic anchors.
const cleanPdfText = [
  "Estimated Band Range 6.0-6.5",
  "Executive Summary",
  "IELTS Criteria Breakdown",
  "Task Response",
  "Detailed Feedback",
  "Repair Plan",
  "cost-efficiency and small-town shops — evidence preserved"
].join("\n");
const cleanPdfAudit = pdfTextIntegrityIssues({
  extractedText: cleanPdfText,
  savedReportText: cleanPdfText,
  minimumParity: 1,
  semanticAnchors: ["Estimated Band Range", "Detailed Feedback", "Repair Plan"]
});
assert.deepEqual(cleanPdfAudit.issues, []);
const corruptPdfAudit = pdfTextIntegrityIssues({
  extractedText: "Estimated Band Range\nDetailed Feedback\ncost\u041b\u0438efficiency\nissue-deadbeef",
  savedReportText: cleanPdfText,
  minimumParity: 0.5,
  semanticAnchors: ["Repair Plan"]
});
assert.ok(corruptPdfAudit.issues.includes("CORRUPTED_HYPHENATION"));
assert.ok(corruptPdfAudit.issues.includes("PDF_INTERNAL_REPORT_LANGUAGE"));
assert.ok(corruptPdfAudit.issues.includes("PDF_WEB_SEMANTIC_PARITY_FAILED"));

console.log(
  "V12.9.8 framework-evidence contract: Eva Strong/weak paragraph aggregation, absence-is-not-Strong, " +
  "complete-explanation-without-example, positive-evidence audit, Task 1 SAR isolation, issue/action parity, " +
  "mixed taxonomy separation, final summary threshold/dedupe, all-plane Unicode integrity, exact Eva route/score, " +
  "student-boundary ids, provider-bypass reconciliation and extracted-PDF text validation passed."
);
