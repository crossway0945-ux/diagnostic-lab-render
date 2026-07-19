import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  analyzeTask2Safety,
  buildTask2LanguageProfile,
  deriveDeterministicTask2CriterionRanges,
  reconcileTask2CanonicalAnalysis,
  validateTask2LanguageAudit
} from "../domain/task2Safety.js";
import { validateCanonicalAnalysis } from "../domain/canonicalAnalysis.js";
import { buildServerProgressSummary } from "../services/apiRouter.js";
import { buildPrintReportMetadata } from "../reports/reportGenerator.js";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { countWords } from "../wordCount.js";

const zoningPrompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const zoningWriting = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const cleanBand7Writing = [
  "Some people support separating urban facilities into specialised districts because this arrangement can simplify planning. I strongly disagree, however, because mixed neighbourhoods usually provide fairer access to essential services and reduce unnecessary travel.",
  "When schools, shops and workplaces are distributed across several neighbourhoods, residents can reach daily services without crossing an entire city. For example, a family whose school and supermarket are both within walking distance can complete routine journeys locally, which saves time and reduces pressure on public transport. Local access is particularly valuable for older residents, parents with young children and workers with limited transport options because essential journeys remain practical even when buses are delayed or household circumstances change. This pattern benefits a broad range of residents rather than one exceptional household, so it directly supports the accessibility reason in the thesis.",
  "Mixed development can also prevent traffic from being funnelled towards a small number of districts. If every shopping centre and office is placed in a single zone, thousands of commuters may use the same roads at similar times; by contrast, distributing destinations creates several travel routes and spreads demand throughout the day. Consequently, the road network is used more evenly, and severe congestion is less likely to form around one concentrated destination.",
  "In conclusion, I strongly disagree that cities should place each type of facility in a separate zone. Although specialised districts may appear administratively convenient, mixed neighbourhoods offer residents more equal access to services and distribute traffic across a wider network, which makes urban life more efficient and resilient."
].join("\n\n");

const borderlineWriting = cleanBand7Writing
  .replace("essential services", "some places")
  .replace("Local access is particularly valuable", "Every family is living near local services, and this access is particularly valuable")
  .replace("administratively convenient", "supported by a research")
  .replace("used more evenly", "used  more evenly")
  ;

const safety = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: zoningPrompt, writing: zoningWriting });
const canonical = reconcileTask2CanonicalAnalysis({ taskType: "Task 2", essayType: "Opinion Essay", prompt: zoningPrompt, writing: zoningWriting }, {}, safety);
const scores = deriveDeterministicTask2CriterionRanges(safety);

assert.equal(countWords(zoningWriting), 254, "verified urban-zoning word count");
assert.equal(safety.taskClassification.publicEssayType, "Opinion Essay");
assert.equal(safety.detectedPosition, "strongly disagree");
assert.match(safety.routeAssessment.thesisRouteStatus, /adequately_developed|fully_extended/);
assert.ok(safety.routeAssessment.bodyRoutes.every((item) => item.alignmentStatus === "adequately_developed"));
assert.ok(safety.routeAssessment.bodyRoutes.every((item) => item.developmentStatus === "partially_developed"));
assert.equal(safety.developmentRisk.body2Development, "Moderate / Partially Developed");
assert.equal(safety.concessionStatus, "No concession");
assert.match(safety.routeAssessment.conclusionLabel, /disagree/i);
assert.equal(safety.canonicalAnalysis.frameworkAssessment.explanationDepth.status, "Moderate");
assert.equal(safety.canonicalAnalysis.frameworkAssessment.sarExampleQuality.status, "Moderate");
assert.equal(safety.canonicalAnalysis.frameworkAssessment.linkBackControl.status, "Moderate");

assert.equal(scores["Task Response"], "6.5");
assert.equal(scores["Coherence & Cohesion"], "6.0-6.5");
assert.equal(scores["Lexical Resource"], "6.0");
assert.equal(scores["Grammatical Range & Accuracy"], "6.0");
assert.equal(canonical.overallScore.label, "6.0-6.5");
assert.equal(canonical.criterionAssessment.lexicalResource.range, "6.0");
assert.equal(canonical.criterionAssessment.grammaticalRangeAccuracy.range, "6.0");
assert.match(canonical.criterionAssessment.lexicalResource.diagnosis, /vague nouns|collocations/i);
assert.match(canonical.criterionAssessment.grammaticalRangeAccuracy.diagnosis, /sentence construction|reference|punctuation/i);
assert.deepEqual(validateCanonicalAnalysis(canonical), []);

const localReport = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt: zoningPrompt,
  writing: zoningWriting,
  targetBand: "7.0",
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
});
assert.equal(localReport.estimatedBandRange, "6.0");
assert.ok(!localReport.top3Issues.some((item) => item.issueType === "Thesis Route Problem"), "local fallback must not contradict the accepted due-to thesis route");
assert.ok(!localReport.top3Issues.some((item) => item.issueType === "Evidence-Based Route Check"), "generic route filler must yield to stronger full-response evidence");
assert.ok(localReport.feedbackCards.some((item) => /Sentence Control/i.test(item.issueType)), "local fallback must include sentence-control evidence in detailed feedback");

const summaryText = `${canonical.executiveSummary.mainScoreLimitingFactor} ${canonical.executiveSummary.mostUrgentRepair}`;
assert.match(canonical.executiveSummary.mainScoreLimitingFactor, /examples|causal mechanisms/i);
assert.match(canonical.executiveSummary.mainScoreLimitingFactor, /Recurring collocation|language profile/i);
assert.match(canonical.executiveSummary.mostUrgentRepair, /Keep the current thesis and two-body route/i);
assert.doesNotMatch(summaryText, /company-level|comparative judgement|concession|establish a position/i);

const profile = safety.languageProfile;
assert.equal(profile.overallLexicalControl, "band6");
assert.equal(profile.overallGrammarControl, "band6");
assert.equal(profile.secureBand7Profile, false);
assert.ok(profile.affectedParagraphCount > 1);
assert.ok(profile.validatedIssues.some((item) => /clusterization/i.test(item.exactProblemSpan) && item.category === "word form"));
assert.ok(profile.validatedIssues.some((item) => /a large traffic congestion/i.test(item.exactProblemSpan) && item.category === "countability"));
assert.ok(profile.validatedIssues.some((item) => item.category === "punctuation closure" && /traveling,$/i.test(item.exactSentence)));
assert.ok(profile.validatedIssues.some((item) => /congestion of traffic/i.test(item.exactProblemSpan) && item.category === "collocation"));

const validAudit = validateTask2LanguageAudit(zoningWriting, [{
  exactSentence: safety.languageProfile.validatedIssues.find((item) => /clusterization/i.test(item.exactSentence)).exactSentence,
  exactProblemSpan: "clusterization",
  criterion: "Lexical Resource",
  category: "word form",
  classification: "clear-error",
  severity: "moderate",
  explanation: "The derivational noun is not natural in this context.",
  affectsMeaning: false,
  recurringPatternKey: "derivational-word-form"
}]);
assert.equal(validAudit.length, 1);
assert.equal(validateTask2LanguageAudit(zoningWriting, [{ ...validAudit[0], exactSentence: "This sentence was invented." }]).length, 0);

const cleanSafety = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: zoningPrompt, writing: cleanBand7Writing });
const cleanCanonical = reconcileTask2CanonicalAnalysis({ taskType: "Task 2", essayType: "Opinion Essay", prompt: zoningPrompt, writing: cleanBand7Writing }, {}, cleanSafety);
assert.ok(["secureBand7", "secureBand75"].includes(cleanSafety.languageProfile.overallLexicalControl));
assert.ok(["secureBand7", "secureBand75"].includes(cleanSafety.languageProfile.overallGrammarControl));
assert.ok(Number(cleanCanonical.criterionAssessment.lexicalResource.range.match(/\d+(?:\.\d+)?/)[0]) >= 7);
assert.ok(Number(cleanCanonical.criterionAssessment.grammaticalRangeAccuracy.range.match(/\d+(?:\.\d+)?/)[0]) >= 7);
assert.equal(cleanCanonical.overallScore.label, "7.0");

const borderlineProfile = buildTask2LanguageProfile(borderlineWriting);
assert.equal(borderlineProfile.overallLexicalControl, "band6Point5");
assert.equal(borderlineProfile.overallGrammarControl, "band6Point5");

const currentRecord = {
  submissionId: "urban-zoning-v11-1",
  taskType: "Task 2",
  dateTime: "2026-07-17T10:00:00.000Z",
  estimatedBandRange: canonical.overallScore.label,
  mostUrgentRepair: canonical.executiveSummary.mostUrgentRepair,
  top3Issues: [{ issueType: "Vocabulary Precision" }],
  analysisValidity: "valid"
};
const progress = buildServerProgressSummary([currentRecord], currentRecord, "Task 2");
assert.equal(progress.latestEstimatedRange, canonical.overallScore.label);
assert.equal(progress.currentMainRepair, canonical.executiveSummary.mostUrgentRepair);
assert.doesNotMatch(progress.currentMainRepair, /comparative judgement|company-level|concession/i);
assert.equal(progress.repeatedIssue, "", "one report cannot manufacture a repeated issue");

const metadata = buildPrintReportMetadata({
  generatedAt: "2026-07-17T10:00:00.000Z",
  taskType: "Task 2",
  estimatedBandRange: canonical.overallScore.label,
  top3Issues: [{ summary: "Development and language control" }],
  disclaimer: "Estimated diagnostic only."
});
assert.equal(metadata.estimatedBandRange, "6.0-6.5");

const [domainSource, analyzerSource] = await Promise.all([
  readFile(new URL("../domain/task2Safety.js", import.meta.url), "utf8"),
  readFile(new URL("../services/aiAnalyzer.js", import.meta.url), "utf8")
]);
assert.doesNotMatch(`${domainSource}\n${analyzerSource}`, /individual or company-level cases|mechanisms that directly prove the comparative judgement|Full-response language signals do not trigger a lower deterministic ceiling/);

console.log("V11.1 language calibration hotfix: urban zoning, full-response profile, family summary, progress, and anti-overcorrection checks passed.");
