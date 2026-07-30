import assert from "node:assert/strict";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import {
  auditParagraphMapConsistency,
  buildAuthoritativeParagraphMap
} from "../domain/paragraphEvidence.js";
import { pdfTextIntegrityIssues } from "../domain/pdfTextIntegrity.js";
import { sanitizePrintableText } from "../domain/textIntegrity.js";
import { buildQaSnapshot } from "../services/qaCanonicalExport.js";

process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const prompt = [
  "Small town center shops are running out of business because rural residents tend to go shopping in big cities store.",
  "To what extent do the disadvantages of this development outweigh the advantages?"
].join("\n");

// Exact Eva response. Body 2 and the conclusion have only single-line boundaries, which is the
// production stop-ship shape this regression protects.
const writing = [
  "In recent years, an increasing number of rural residents have bypassed their local town centers to shop at large commercial hubs in major cities. While this trend offers consumers greater product variety and competitive pricing, I firmly believe that its disadvantages, rural economic decline  and environmental degradation, far outweigh the advantages.",
  "",
  "On one hand, shopping in big cities provides diverse product choices and offers undeniable benefits for individual consumers, primarily driven by cost-efficiency and product availability. Large metropolitan retailers provide bulk discounts, competitive pricing, and frequent promotions which independent rural shops cannot offer. Furthermore, urban commercial hubs contain an unparalleled variety of goods in one place, making the shopping experience more convenient. For example, a rural resident visiting a major city retail park can find global supermarket chains and clothing departments within the same area, allowing them to complete a month of diverse shopping in a single afternoon. Therefore, this eliminates the need to visit multiple scattered shops while providing items with greater deals.",
  "However, the widespread abandonment of local shops inflicts severe and lasting damage on the economic stability of rural communities. When residents divert their choices  to metropolitan centers, small-town businesses are forced into bankruptcy. This leads to immediate local job losses and sharply reduces the local tax revenue needed to fund essential public infrastructure. Without interested consumers, vulnerable groups and bankrupted people are left isolated. Therefore, the promotion of small town center shops are vital to prevent economic decline.",
  "In conclusion, although shopping in metropolitan centers provide product variety and competitive pricing, the small independent shops are forced into an economic instability. The resulting economic decline of small center shops demonstrates that the disadvantages of this development far outweigh the advantages."
].join("\n");

const paragraphMap = buildAuthoritativeParagraphMap(writing, "Task 2");
assert.equal(paragraphMap.audit.pass, true);
assert.equal(paragraphMap.audit.rawOffsetsPreserved, true);
assert.equal(paragraphMap.paragraphs.length, 4);
assert.deepEqual(
  paragraphMap.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph.role, paragraph.sentences.length]),
  [
    ["paragraph-1", "Introduction", 2],
    ["paragraph-2", "Body Paragraph 1", 5],
    ["paragraph-3", "Body Paragraph 2", 5],
    ["paragraph-4", "Conclusion", 2]
  ]
);
assert.match(paragraphMap.paragraphs[1].sentences[0].exactText, /^On one hand/);
assert.match(paragraphMap.paragraphs[2].sentences[0].exactText, /^However/);
assert.match(paragraphMap.paragraphs[3].sentences[0].exactText, /^In conclusion/);
assert.equal(paragraphMap.paragraphs[2].sentences[3].location, "Body Paragraph 2, Sentence 4");
assert.equal(paragraphMap.paragraphs[3].sentences[0].location, "Conclusion, Sentence 1");

const corruptMap = structuredClone(paragraphMap);
corruptMap.paragraphs[2].rawStartOffset = corruptMap.paragraphs[1].rawStartOffset;
assert.equal(auditParagraphMapConsistency(corruptMap, writing, "Task 2").pass, false);

const analysis = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Advantages & Disadvantages",
  visualType: "",
  targetBand: "7.0",
  reportLanguage: "en",
  clientSubmissionId: "eva-v12-9-7-paragraph-map-stopship",
  prompt,
  writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
});

assert.equal(analysis.feedbackIntegrity.paragraphMapAudit.pass, true);
assert.equal(analysis.feedbackIntegrity.paragraphMapAudit.paragraphCount, 4);
assert.equal(analysis.routeAssessment.overallRouteStatus, "adequately_developed");
assert.equal(analysis.routeAssessment.taskAwareRouteModel.overallRouteStatus, "adequately_developed");
assert.equal(analysis.routeAssessment.taskAwareRouteModel.conflict, false);

assert.deepEqual(
  analysis.paragraphCoverage.map((paragraph) => paragraph.paragraphLabel),
  ["Introduction", "Body Paragraph 1", "Body Paragraph 2", "Conclusion"]
);
assert.match(analysis.paragraphCoverage[0].status, /Development Repair Needed/);
assert.match(analysis.paragraphCoverage[1].status, /Language Repair Needed/);
assert.match(analysis.paragraphCoverage[2].status, /Development Repair Needed/);
assert.match(analysis.paragraphCoverage[3].status, /Functionally Strong.*Language Repair Needed/);

assert.match(analysis.kruPomScores["SAR Example Quality"].status, /Mixed|Moderate/i);
assert.doesNotMatch(analysis.kruPomScores["SAR Example Quality"].status, /^Strong$/i);
assert.equal(analysis.kruPomScores["Conclusion Closure"].status, "Functionally Strong - Language Repair Needed");
assert.doesNotMatch(analysis.kruPomScores["Link Back Control"].status, /^Strong$/i);
assert.deepEqual(
  analysis.top3Issues.slice(0, 3).map((issue) => issue.issueType),
  ["Comparative Judgement", "Thesis-to-Body Promise", "Causal Mechanism"]
);

const affectedGroup = analysis.feedbackCards.find((issue) => /bankrupted people/.test(issue.exactSentence || ""));
const body2Agreement = analysis.feedbackCards.find((issue) => /promotion of small town center shops are vital/.test(issue.exactSentence || ""));
const conclusionAgreement = analysis.feedbackCards.find((issue) => /shopping in metropolitan centers provide/.test(issue.exactSentence || ""));
assert.equal(affectedGroup.paragraphLocation, "Body Paragraph 2, Sentence 4");
assert.equal(body2Agreement.paragraphLocation, "Body Paragraph 2, Sentence 5");
assert.equal(conclusionAgreement.paragraphLocation, "Conclusion, Sentence 1");
assert.equal(analysis.feedbackCards.some((issue) =>
  /Without interested consumers|promotion of small town center shops are vital|In conclusion/.test(issue.exactSentence || "") &&
  /^Body Paragraph 1/.test(issue.paragraphLocation || "")
), false);

assert.deepEqual(
  Object.fromEntries(Object.entries(analysis.criteriaScores).map(([name, score]) => [name, score.range])),
  {
    "Task Response": "6.0",
    "Coherence & Cohesion": "6.0",
    "Lexical Resource": "6.0",
    "Grammatical Range & Accuracy": "6.0"
  }
);
assert.equal(analysis.estimatedBandRange, "6.0");
assert.equal(analysis.canonicalAnalysis.overallScore.label, "6.0");
assert.equal(analysis.canonicalAnalysis.scoringSnapshot.version, "final-validated-score-freeze-v12.9.8");
assert.equal(analysis.canonicalAnalysis.consistency.scoringFrozenBeforeIssueGeneration, false);

assert.deepEqual(
  analysis.practicePlan.slice(0, 5).map((item) => item.title.split(":").at(-1).trim()),
  ["Comparative Judgement", "Thesis-to-Body Promise", "Causal Mechanism", "Word Form", "Subject-Verb Agreement"]
);
assert.equal(analysis.practicePlan.some((item) => /Body Paragraph 1/.test(item.task) && /bankrupted people|promotion of small town center shops|Conclusion/.test(item.task)), false);

const finalState = analysis.feedbackIntegrity.finalValidatedState;
assert.equal(finalState.terminal, true);
assert.equal(finalState.paragraphMap.audit.pass, true);
assert.equal(finalState.conclusionFunction.present, true);
assert.equal(finalState.conclusionFunction.complete, true);
assert.equal(finalState.frameworkScores["SAR Example Quality"].status, "Mixed");
assert.equal(finalState.frameworkScores["Conclusion Closure"].status, "Functionally Strong - Language Repair Needed");
assert.equal(finalState.estimatedBandRange, "6.0");
assert.ok(analysis.feedbackIntegrity.scoreCalculationTrace.finalValidatedState.finalIssueIds.length >= 5);

const qa = buildQaSnapshot({
  analysis,
  savedRecord: {
    appVersion: "12.9.8",
    engineVersion: "ielts-diagnostic-engine-v12.9.8",
    promptVersion: "test",
    rubricVersion: "kru-pom-ielts-writing-v12.3.0",
    reportSchemaVersion: "ielts-diagnostic-report-v12.9.8",
    submissionId: "eva-stopship",
    studentProfileId: "eva",
    studentDisplayNameSnapshot: "Eva",
    taskType: "Task 2",
    essayType: "Advantages & Disadvantages",
    wordCount: 284,
    sourceInput: { prompt, writing }
  },
  payload: { taskType: "Task 2", prompt, writing }
});
assert.equal(qa.paragraphMapAudit.pass, true);
assert.ok(Array.isArray(qa.frameworkEvidenceAudit));
assert.equal(qa.finalValidatedState.terminal, true);
assert.equal(qa.scoreCalculationTrace.finalValidatedState.overallBandRange.label, "6.0");

const punctuationProbe = "full-response small-town cost-efficiency short-term";
assert.equal(sanitizePrintableText(punctuationProbe), punctuationProbe);
assert.deepEqual(pdfTextIntegrityIssues({ extractedText: punctuationProbe }).issues, []);

console.log("V12.9.8 Eva stop-ship regression: authoritative four-paragraph map, raw offsets, task issues, SAR, conclusion, link-back, final scoring, coverage, repair plan, QA terminal state and PDF hyphen parity passed.");
