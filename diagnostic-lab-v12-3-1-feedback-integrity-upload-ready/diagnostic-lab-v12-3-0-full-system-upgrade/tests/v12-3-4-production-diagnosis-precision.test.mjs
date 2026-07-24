// Fixtures in this file are VERBATIM strings taken from a real production PDF report
// (Sun urban-zoning, engine 12.3.3). They exist because the 12.3.2/12.3.3 detectors were tuned
// against hand-written fixtures and silently failed on the way the live provider actually writes.
// Do not paraphrase these strings: their exact wording is the regression surface.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  auditFeedbackIntegrity,
  buildFeedbackIntegrityModel,
  detectDevelopmentSignal,
  detectLanguageSignal,
  evaluateRevisionAlignment,
  executiveParagraphLabels,
  projectRouteAlignmentDisplay,
  validateFeedbackIntegrity
} from "../domain/feedbackIntegrity.js";
import { normalizeStudentFacingText } from "../domain/canonicalAnalysis.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.4.0");

const norm = (value) => String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
const primaryOf = (text) => detectDevelopmentSignal(norm(text)) || detectLanguageSignal(norm(text)) || "";

// ---------------------------------------------------------------------------
// D-1: production diagnosis prose must resolve to the category it describes.
// ---------------------------------------------------------------------------
const productionCases = [
  {
    shippedHeading: "Word Form",
    diagnosis: "The route is relevant but clusterization of a specific place is unnatural and unclear for an urban planning policy so the examiner has to infer your meaning. The paragraph has a good reason route, but the controlling sentence needs precise facility-zoning language before the example begins.",
    expected: ["Lexical Precision", "Topic Sentence Strength"],
    mustNotBe: ["Word Form"]
  },
  {
    shippedHeading: "Collocation",
    diagnosis: "The sentence is relevant, but it ends with a comma and uses awkward phrasing so the paragraph closure feels unfinished. The link-back function is correct but the sentence needs grammatical closure and a direct return to the thesis reason.",
    expected: ["Sentence Completion", "Paragraph Closure"],
    mustNotBe: ["Collocation"]
  },
  {
    shippedHeading: "Countability",
    diagnosis: "The cause is logical but restaurants or shopping malls mixes facility types and the final consequence needs more precise traffic language. The example works, but the SAR result should specify peak-hour movement and road-network pressure more accurately.",
    expected: ["SAR Example Quality", "Example Development"],
    mustNotBe: ["Countability"]
  },
  {
    shippedHeading: "Reference Control",
    diagnosis: "The conclusion function is complete but specific places like towns and cities and thus all the same places are imprecise and slightly distort the policy description. Conclusion closure is strong, but the final sentence needs cleaner terminology that matches the prompt.",
    expected: ["Lexical Precision"],
    mustNotBe: []
  },
  {
    shippedHeading: "Tense Control",
    diagnosis: "The progressive tense is not controlled for a general statement.",
    expected: ["Tense Control"],
    mustNotBe: []
  },
  {
    shippedHeading: "Example Development",
    diagnosis: "The example is relevant, but it stays mostly at one student's personal result and does not fully connect the zoning policy to a broader urban consequence. The SAR chain is present, but the Result needs to move from one student's bad grades to a wider pattern affecting many families and schools.",
    expected: ["SAR Example Quality", "Example Development"],
    mustNotBe: []
  }
];

for (const testCase of productionCases) {
  const primary = primaryOf(testCase.diagnosis);
  assert.ok(
    testCase.expected.includes(primary),
    `production diagnosis shipped as "${testCase.shippedHeading}" resolved to "${primary}", expected one of ${testCase.expected.join(" / ")}`
  );
  for (const forbidden of testCase.mustNotBe) {
    assert.notEqual(primary, forbidden, `"${forbidden}" must not be the primary category for this diagnosis`);
  }
}

// Genuine single-domain language errors must keep their own category.
assert.equal(primaryOf("A countable noun is used without the plural form."), "Countability");
assert.equal(primaryOf("The article is missing before the singular countable noun."), "Article Control");
assert.equal(primaryOf("The word form is wrong: the noun derivation should be used instead of the verb."), "Word Form");
assert.equal(primaryOf("The noun and preposition combination is unnatural."), "Collocation");
assert.equal(primaryOf("The preposition after this verb should be 'on' rather than 'in'."), "Preposition Control");

// ---------------------------------------------------------------------------
// D-2: a revision is judged on the content it introduces, not on length growth.
// ---------------------------------------------------------------------------
const narrowExample = "For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades.";
const shippedExpansion = "For example, if all schools were placed in one district, many students living on the opposite side of the city might spend hours commuting each day, leaving them tired in class and forcing parents to adjust their work schedules.";

const expansionAlignment = evaluateRevisionAlignment({
  exactSentence: narrowExample,
  targetedRevision: shippedExpansion,
  revisionType: "Teacher-Guided Expansion",
  repairTargets: ["SAR completeness", "mechanism", "consequence"],
  taskType: "Task 2",
  sentenceRole: "example"
});
// The shipped revision is SHORTER than the original yet repairs every diagnosed target.
assert.ok(shippedExpansion.split(/\s+/).length < narrowExample.split(/\s+/).length, "fixture must stay shorter than the original");
assert.deepEqual(expansionAlignment.unresolvedTargets, [], "a genuine expansion must not be reported as unrepaired");
assert.equal(expansionAlignment.revisionAlignmentStatus, "aligned");

// A pure word swap must still be rejected as an unrepaired development target.
const wordSwap = evaluateRevisionAlignment({
  exactSentence: "For example, commuters gather at the same time, resulting in a large traffic congestion.",
  targetedRevision: "For example, commuters gather at the same time, resulting in severe traffic congestion.",
  revisionType: "Minimal Correction",
  repairTargets: ["mechanism", "affected group", "consequence"],
  taskType: "Task 2",
  sentenceRole: "example"
});
assert.equal(wordSwap.pass, false);
assert.ok(wordSwap.unresolvedTargets.includes("mechanism"));

// ---------------------------------------------------------------------------
// D-2b: a card must never both claim an expansion and deny writing the content.
// ---------------------------------------------------------------------------
const writing = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const paragraphs = segmentStudentResponse(writing, "Task 2");
const body1 = paragraphs[1].sentences.map((item) => item.exactText);
const body2 = paragraphs[2].sentences.map((item) => item.exactText);

const expansionCard = {
  issueType: "Example Development",
  severity: "Moderate",
  criteria: ["Task Response"],
  framework: ["SAR Example Quality"],
  paragraphLocation: "Body Paragraph 1, Sentence 3",
  exactSentence: body1[2],
  whyItLimitsBand: "The example is relevant, but it stays mostly at one student's personal result and does not fully connect the zoning policy to a broader urban consequence.",
  kruPomDiagnosis: "The SAR chain is present, but the Result needs to move from one student's bad grades to a wider pattern affecting many families and schools.",
  targetedRevision: shippedExpansion,
  revisionType: "Teacher-Guided Expansion",
  whyRevisionIsStronger: "This keeps the school example but expands the mechanism, affected groups, and wider consequence without changing your disagreement route.",
  studentAction: "For each example, add one sentence that answers who else is affected."
};

const body2DevelopmentCard = {
  issueType: "Countability",
  severity: "High-Band Refinement",
  criteria: ["Task Response"],
  framework: ["SAR Example Quality"],
  paragraphLocation: "Body Paragraph 2, Sentence 3",
  exactSentence: body2[2],
  whyItLimitsBand: "The cause is logical but the final consequence needs more precise traffic language.",
  kruPomDiagnosis: "The example works, but the SAR result should specify peak-hour movement and road-network pressure more accurately.",
  targetedRevision: body2[2].replace("a large traffic congestion", "severe traffic congestion"),
  revisionType: "Minimal Correction",
  whyRevisionIsStronger: "The collocation is now natural.",
  studentAction: "Specify the time and road impact."
};

const conclusionMinorCard = {
  issueType: "Reference Control",
  severity: "Minor Repair",
  criteria: ["Lexical Resource"],
  framework: ["Conclusion Closure"],
  paragraphLocation: "Conclusion, Sentence 1",
  exactSentence: paragraphs[3].sentences[0].exactText,
  whyItLimitsBand: "The conclusion function is complete but the wording is imprecise.",
  kruPomDiagnosis: "Conclusion closure is strong, but the final sentence needs cleaner terminology that matches the prompt.",
  targetedRevision: "In conclusion, I firmly believe that urban areas should not be divided into separate zones for similar facilities because this could make daily travel harder and worsen traffic congestion.",
  revisionType: "Minimal Correction",
  whyRevisionIsStronger: "The revision preserves your stance while using accurate prompt-related terminology.",
  studentAction: "Reuse the task's key nouns accurately."
};

const languageCards = body1.slice(0, 2).map((sentence, index) => ({
  issueType: "Lexical Precision",
  severity: "Moderate",
  criteria: ["Lexical Resource"],
  framework: ["Vocabulary Precision"],
  paragraphLocation: `Body Paragraph 1, Sentence ${index + 1}`,
  exactSentence: sentence,
  whyItLimitsBand: "The wording is imprecise and unnatural for an urban planning policy.",
  kruPomDiagnosis: "Replace the invented wording with natural zoning vocabulary.",
  targetedRevision: `${sentence.replace(/\.$/, "")} in clearer policy wording.`,
  revisionType: "Minimal Correction",
  whyRevisionIsStronger: "The wording is now precise.",
  studentAction: "Use natural policy vocabulary."
}));

const executiveSummary = "The essay has a clear and well-aligned judgement route, but the examples and causal mechanisms are not developed with enough precision. Body Paragraph 1 relies on a narrow individual case without fully demonstrating the wider impact, while Body Paragraph 2 uses a vague and only partly convincing example.";

const model = buildFeedbackIntegrityModel({
  writing,
  taskType: "Task 2",
  feedbackCards: [...languageCards, expansionCard, conclusionMinorCard, body2DevelopmentCard],
  topIssues: [...languageCards, expansionCard, conclusionMinorCard],
  mainScoreLimitingFactor: executiveSummary,
  mostUrgentRepair: "Rebuild each example so that it clearly shows how concentrating facilities in one zone affects a wider group of residents."
});

const byLocation = (location) => model.issues.find((issue) => issue.paragraphLocation === location);

// The genuine expansion is aligned and carries no contradicting limitation note.
const expansionIssue = byLocation("Body Paragraph 1, Sentence 3");
assert.equal(expansionIssue.revisionAlignmentStatus, "aligned");
assert.equal(expansionIssue.revisionLimitationNote, "");
assert.doesNotMatch(expansionIssue.whyRevisionIsStronger, /does not write that content for you/i);
assert.match(expansionIssue.whyRevisionIsStronger, /expands the mechanism/i);

// A card may never simultaneously claim an expansion and deny writing the content.
for (const issue of model.issues) {
  const text = String(issue.whyRevisionIsStronger || "");
  const claimsExpansion = /expands? the (?:mechanism|example|analysis)|adds? an explanatory premise/i.test(text);
  const deniesWriting = /does not write that content for you/i.test(text);
  assert.ok(!(claimsExpansion && deniesWriting), `contradictory revision rationale at ${issue.paragraphLocation}`);
}

// A word-swap on a development diagnosis keeps a non-expansion label AND discloses the shortfall.
const body2Issue = byLocation("Body Paragraph 2, Sentence 3");
assert.ok(["SAR Example Quality", "Example Development", "Causal Mechanism"].includes(body2Issue.issueCategory));
assert.notEqual(body2Issue.revisionType, "Teacher-Guided Expansion", "a word swap must not be relabelled as teacher guidance");
assert.equal(body2Issue.revisionAlignmentStatus, "partial-repair");
assert.match(body2Issue.revisionLimitationNote, /still require your own rewrite/i);

// ---------------------------------------------------------------------------
// D-3: a paragraph named in the Executive Summary must hold a Top Issue slot.
// ---------------------------------------------------------------------------
assert.deepEqual(executiveParagraphLabels(executiveSummary), ["Body Paragraph 1", "Body Paragraph 2"]);
const topLabels = model.topIssues.map((issue) => issue.paragraphLabel);
assert.ok(topLabels.includes("Body Paragraph 2"), `Body Paragraph 2 is named in the summary but missing from Top Issues: ${topLabels.join(", ")}`);
assert.ok(topLabels.includes("Body Paragraph 1"));
// A development gap must never be downgraded to an optional refinement.
assert.notEqual(body2Issue.severity, "High-Band Refinement");

// ---------------------------------------------------------------------------
// D-4: paragraph status must not outrank its own weakest dimension.
// ---------------------------------------------------------------------------
const body2Coverage = model.paragraphCoverage.find((item) => item.paragraphLabel === "Body Paragraph 2");
assert.ok(body2Coverage);
assert.ok(!["Strong", "Mostly Controlled"].includes(body2Coverage.status), `Body Paragraph 2 carries an unrepaired development gap but is shown as "${body2Coverage.status}"`);

// The whole model still passes the fatal gate.
assert.deepEqual(validateFeedbackIntegrity(model, writing), []);
assert.equal(auditFeedbackIntegrity(model, writing).filter((finding) => finding.severity === "fatal").length, 0);

// ---------------------------------------------------------------------------
// D-5: report copy defects.
// ---------------------------------------------------------------------------
const aligned = projectRouteAlignmentDisplay({
  status: "Strong",
  diagnosis: "Body 1: develops a reason aligned with the writer's disagreement | Body 2: develops a reason aligned with the writer's disagreement"
});
assert.equal(aligned.status, "Aligned");
assert.doesNotMatch(aligned.diagnosis, /disagreement This rating/, "the route summary must be closed before the scope note");
assert.match(aligned.diagnosis, /disagreement\. This rating assesses route alignment only\./);

assert.equal(normalizeStudentFacingText('say "traffic jam. "'), 'say "traffic jam."');
assert.equal(normalizeStudentFacingText("LFC CPC Control"), "LFC-CPC Control");
assert.equal(normalizeStudentFacingText("residents/commuters/students. ”"), "residents/commuters/students.”");

const scriptSource = await readFile(new URL("../script.js", import.meta.url), "utf8");
// The route section heading must not be repeated by its own callout label.
assert.doesNotMatch(scriptSource, /<h2>\$\{escapePrintHtml\(task2RouteLabel\)\}<\/h2>\s*\$\{renderPrintCallout\(task2RouteLabel/);
assert.match(scriptSource, /renderPrintCallout\(copy\.detectedRouteLabel/);
assert.match(scriptSource, /LFC\[\\s\\u00a0\]\+CPC/);

// ---------------------------------------------------------------------------
// D-7: render.yaml must point at the live Render root.
// ---------------------------------------------------------------------------
const renderConfig = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
assert.match(renderConfig, /rootDir:\s*diagnostic-lab-v12-3-1-feedback-integrity-upload-ready\/diagnostic-lab-v12-3-0-full-system-upgrade/);
assert.match(renderConfig, /buildCommand:\s*npm install/);
assert.match(renderConfig, /startCommand:\s*npm start/);

console.log("V12.3.5 production-diagnosis precision: verbatim provider prose classified correctly, expansion fidelity, executive top-issue coverage, dimensional paragraph status, report copy and Render root verified.");
