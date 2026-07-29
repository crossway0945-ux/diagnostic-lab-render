import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildQaSnapshot, redactForQa } from "../services/qaCanonicalExport.js";
import {
  assertStudentReportViewModel,
  buildStudentReportViewModel
} from "../domain/reportViewModels.js";
import {
  assertPrintableTextIntegrity,
  unicodeIntegrityIssues
} from "../domain/textIntegrity.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, ...value] = item.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  })
);
if (!args.output || !args["eva-qa"] || !args["sun-qa"]) {
  throw new Error("Usage: node qa/build-release-artifacts.mjs --output=<dir> --eva-qa=<json> --sun-qa=<json>");
}

const outputDir = path.resolve(args.output);
await mkdir(outputDir, { recursive: true });
process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const evaSource = JSON.parse(await readFile(path.resolve(args["eva-qa"]), "utf8"));
const sunSource = JSON.parse(await readFile(path.resolve(args["sun-qa"]), "utf8"));

const payloadFromQa = (source, id) => ({
  taskType: source.taskInput.taskType,
  essayType: source.taskInput.essayType,
  visualType: source.taskInput.visualType || "",
  targetBand: "7.0",
  reportLanguage: "en",
  clientSubmissionId: id,
  prompt: source.taskInput.prompt,
  writing: source.taskInput.studentWriting,
  options: source.taskInput.diagnosticOptions || {}
});

async function replayProviderOutput(payload, providerOutput, replayName) {
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = replayName;
  process.env.OPENAI_MODEL = replayName;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: JSON.stringify(providerOutput) })
  });
  try {
    return await analyzeWriting(payload);
  } finally {
    globalThis.fetch = previousFetch;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  }
}

async function authoritativeProviderReplay(source, id) {
  const payload = payloadFromQa(source, id);
  const local = await analyzeWriting(payload);
  return replayProviderOutput(payload, {
    ...local,
    estimatedBandRange: source.frozenScoring?.estimatedBandRange || local.estimatedBandRange,
    criteriaScores: source.frozenScoring?.criteriaScores || local.criteriaScores,
    kruPomScores: source.frozenScoring?.kruPomScores || source.frameworkBreakdown || local.kruPomScores,
    feedbackCards: source.feedbackCards || local.feedbackCards,
    top3Issues: source.topIssues || local.top3Issues,
    paragraphFeedback: source.paragraphCoverage || local.paragraphCoverage,
    paragraphCoverage: source.paragraphCoverage || local.paragraphCoverage,
    practicePlan: source.repairPlan || local.practicePlan,
    routeAssessment: source.canonicalRoute?.requirements ? source.canonicalRoute : local.routeAssessment,
    languageProfile: source.canonicalAnalysis?.languageProfile || local.languageProfile,
    mainScoreLimitingFactor: source.executiveSummary?.mainScoreLimitingFactor || local.mainScoreLimitingFactor,
    mostUrgentRepair: source.executiveSummary?.mostUrgentRepair || local.mostUrgentRepair
  }, "authoritative-provider-replay");
}

function assertReleaseAnalysis(analysis, { studentName, taskType }) {
  analysis.studentDisplayNameSnapshot = studentName;
  const studentView = buildStudentReportViewModel(analysis);
  assertStudentReportViewModel(studentView);
  const serialized = JSON.stringify(studentView);
  assertPrintableTextIntegrity(serialized);
  const unicodeIssues = unicodeIntegrityIssues(serialized, { studentFacing: true });
  if (unicodeIssues.length) throw new Error(`${studentName} Student View failed Unicode integrity: ${unicodeIssues.join(", ")}`);
  if (new RegExp("\\b(?:issue|development)-[a-z0-9-]+\\b", "i").test(serialized)) {
    throw new Error(`${studentName} Student View leaked an internal issue id.`);
  }
  if (taskType === "Task 2") {
    const evidenceAudit = analysis.feedbackIntegrity?.frameworkEvidence?.audit || [];
    if (!evidenceAudit.length || evidenceAudit.some((item) => !item.pass)) {
      throw new Error(`${studentName} framework evidence contract did not pass.`);
    }
  }
  return studentView;
}

async function writeJson(name, value) {
  const target = path.join(outputDir, name);
  await writeFile(target, `${JSON.stringify(redactForQa(value), null, 2)}\n`, "utf8");
  return target;
}

async function materialise(name, analysis, payload, validationMode) {
  const studentView = assertReleaseAnalysis(analysis, { studentName: name, taskType: payload.taskType });
  analysis.studentReportViewModel = studentView;
  const savedRecord = {
    ...ANALYSIS_VERSIONS,
    submissionId: `${name.toLowerCase()}-v12-9-7-release-evidence`,
    studentProfileId: `${name.toLowerCase()}-qa-profile`,
    studentDisplayNameSnapshot: name,
    taskType: payload.taskType,
    essayType: payload.essayType || "",
    visualType: payload.visualType || "",
    wordCount: analysis.wordCount,
    sourceInput: { prompt: payload.prompt, writing: payload.writing, diagnosticOptions: payload.options }
  };
  const canonicalQa = buildQaSnapshot({ analysis, savedRecord, payload });
  canonicalQa.studentReportViewModel = studentView;
  canonicalQa.exportedAt = new Date().toISOString();
  canonicalQa.canonicalDataSource = validationMode;
  canonicalQa.releaseValidation = {
    appVersion: ANALYSIS_VERSIONS.appVersion,
    validationMode,
    liveProvider: false,
    evidenceAuditPass: (analysis.feedbackIntegrity?.frameworkEvidence?.audit || []).every((item) => item.pass),
    projectionAuditPass: (analysis.feedbackIntegrity?.projectionConsistencyAudit || []).every((item) => item.pass),
    studentBoundaryPass: true
  };
  await Promise.all([
    writeJson(`${name}-final-analysis.json`, analysis),
    writeJson(`${name}-final-canonical-qa.json`, canonicalQa),
    writeJson(`${name}-final-student-view.json`, studentView),
    writeJson(`${name}-render-input.json`, analysis)
  ]);
  return { analysis, studentView, canonicalQa };
}

const evaPayload = payloadFromQa(evaSource, "eva-v12-9-7-release-evidence");
const evaAnalysis = await authoritativeProviderReplay(evaSource, "eva-v12-9-7-authoritative-provider-replay");
const eva = await materialise("Eva", evaAnalysis, evaPayload, "authoritative-provider-replay");

const evinWriting = [
  "In recent times, an increasing number of rural residents prefer traveling to a metropolis to purchase goods, leading to bankruptcy of local business establishments in small town centers. While this trend offers economic and logistical benefits to individuals, I firmly believe that its community-wide and environmental disadvantages significantly outweigh these privileges.",
  "Shopping in big cities has considerable personal advantages for citizens, primarily cost-efficiency and product variety. Large big cities' stores benefit from economies of scale allowing them to offer commodities at significantly lower prices than small vendors. Furthermore, these centers act as commercial hubs where consumers can access a range of international brands and specialized products. For example, a rural family traveling to a metropolitan hypermarket can purchase bulk groceries and international clothing brands in a single trip, saving money that would otherwise be spent on inflated local prices. Therefore, rural residents can reduce their financial expenditure on basic necessities and the time spent visiting local shops.",
  "However, the consequence of this behavior shift inflicts severe damage on rural communities. The primary drawback is the erosion of the local economy and social cohesion. When town shops close permanently, it triggers immediate job losses for local residents, trapping rural communities in economic slump. Moreover, traditional town squares have functioned as vital social arenas, their decline isolates vulnerable populations such as the elderly and those without private vehicles. Therefore, the collapse of small-town retail not only destabilizes the local economy but also shatters the networks that protect the most vulnerable residents.",
  "In conclusion, although traveling to big cities provides consumers with broader choices and cheaper prices, it threatens the survival of rural communities. The resulting socio-economic decline of small towns and the heightened toll of increased car dependency clearly demonstrate that the negative ramifications of this trend far outweigh its initial conveniences."
].join("\n\n");
const evinPayload = {
  taskType: "Task 2",
  essayType: "Advantages & Disadvantages",
  visualType: "",
  targetBand: "7.0",
  reportLanguage: "en",
  clientSubmissionId: "evin-v12-9-7-release-evidence",
  prompt: evaPayload.prompt,
  writing: evinWriting,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};
const evinLocal = await analyzeWriting(evinPayload);
// These language findings are transcribed from the supplied Evin production PDF. The replay keeps
// the historical provider evidence but passes it through the current canonical consistency,
// evidence, taxonomy, sanitisation and PDF gates. The false SVA claim for
// "the consequence ... inflicts" is deliberately absent because the subject and verb agree.
const evinHistoricalProviderCards = [
  {
    issueType: "Collocation",
    severity: "Minor Repair",
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC CPC Control"],
    paragraphLocation: "Introduction, Sentence 1",
    exactSentence: "In recent times, an increasing number of rural residents prefer traveling to a metropolis to purchase goods, leading to bankruptcy of local business establishments in small town centers.",
    sentenceFunction: "Introduces the development and its effect on local retail.",
    whyItLimitsBand: "\"Leading to the closure or bankruptcy of local businesses\" is more natural and concise.",
    kruPomDiagnosis: "The wording uses an unnatural noun sequence for business closure.",
    targetedRevision: "In recent times, an increasing number of rural residents prefer traveling to a metropolis to purchase goods, leading to the closure or bankruptcy of local businesses in small town centers.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The revision uses a natural closure collocation and removes unnecessary nominal wording without changing the claim.",
    studentAction: "Replace the unnatural business-closure collocation while preserving the original cause-and-effect route."
  },
  {
    issueType: "Lexical Precision",
    severity: "Minor Repair",
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC CPC Control"],
    paragraphLocation: "Introduction, Sentence 2",
    exactSentence: "While this trend offers economic and logistical benefits to individuals, I firmly believe that its community-wide and environmental disadvantages significantly outweigh these privileges.",
    sentenceFunction: "States the comparative judgement and previews the two sides.",
    whyItLimitsBand: "\"These privileges\" is an inaccurate label for the consumer benefits named earlier.",
    kruPomDiagnosis: "The referring noun should name advantages or benefits, not privileges.",
    targetedRevision: "While this trend offers economic and logistical benefits to individuals, I firmly believe that its community-wide and environmental disadvantages significantly outweigh these personal advantages.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The replacement keeps the judgement and refers precisely to the benefit side.",
    studentAction: "Replace \"these privileges\" with a noun phrase that accurately names the benefit side."
  },
  {
    issueType: "Lexical Precision",
    severity: "Minor Repair",
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC CPC Control"],
    paragraphLocation: "Body Paragraph 1, Sentence 2",
    exactSentence: "Large big cities' stores benefit from economies of scale allowing them to offer commodities at significantly lower prices than small vendors.",
    sentenceFunction: "Explains how urban retailers offer a price advantage.",
    whyItLimitsBand: "\"Large big cities' stores\" is redundant and unnatural.",
    kruPomDiagnosis: "The store phrase duplicates the idea of size and uses an unnatural possessive structure.",
    targetedRevision: "Large stores in big cities benefit from economies of scale allowing them to offer commodities at significantly lower prices than small vendors.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The revision removes the redundant size wording and keeps the original price claim unchanged.",
    studentAction: "Replace \"Large big cities' stores\" with \"Large stores in big cities\"."
  },
  {
    issueType: "Lexical Precision",
    severity: "Moderate",
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC CPC Control"],
    paragraphLocation: "Body Paragraph 1, Sentence 2",
    exactSentence: "Large big cities' stores benefit from economies of scale allowing them to offer commodities at significantly lower prices than small vendors.",
    sentenceFunction: "Explains how urban retailers offer a price advantage.",
    whyItLimitsBand: "\"Lower prices than small vendors\" compares prices with vendors rather than with the prices they charge.",
    kruPomDiagnosis: "The comparison needs parallel items on both sides: prices compared with prices.",
    targetedRevision: "Large big cities' stores benefit from economies of scale allowing them to offer commodities at significantly lower prices than those charged by small vendors.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The revision completes the comparison accurately without changing the claimed price advantage.",
    studentAction: "Replace \"lower prices than small vendors\" with \"lower prices than those charged by small vendors\"."
  },
  {
    issueType: "Reference Control",
    severity: "Minor Repair",
    criteria: ["Coherence & Cohesion"],
    framework: ["Reference Control", "LFC CPC Control"],
    paragraphLocation: "Body Paragraph 1, Sentence 3",
    exactSentence: "Furthermore, these centers act as commercial hubs where consumers can access a range of international brands and specialized products.",
    sentenceFunction: "Adds product-access evidence to the advantage route.",
    whyItLimitsBand: "\"These centers\" can refer to cities or stores.",
    kruPomDiagnosis: "The demonstrative reference has more than one plausible antecedent.",
    targetedRevision: "Furthermore, large urban stores act as commercial hubs where consumers can access a range of international brands and specialized products.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The explicit noun phrase identifies the intended actor without changing the route.",
    studentAction: "Replace \"these centers\" with the exact noun phrase intended."
  },
  {
    issueType: "Reference Control",
    severity: "Moderate",
    criteria: ["Coherence & Cohesion", "Grammatical Range & Accuracy"],
    framework: ["Reference Control", "LFC CPC Control"],
    paragraphLocation: "Body Paragraph 2, Sentence 3",
    exactSentence: "When town shops close permanently, it triggers immediate job losses for local residents, trapping rural communities in economic slump.",
    sentenceFunction: "Explains the first consequence of shop closure.",
    whyItLimitsBand: "The singular pronoun has no clear singular antecedent after the plural noun \"shops\".",
    kruPomDiagnosis: "The cause should be named explicitly as the closure of the shops.",
    targetedRevision: "When town shops close permanently, their closure triggers immediate job losses for local residents, trapping rural communities in economic slump.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The revision supplies a traceable antecedent and preserves the causal chain.",
    studentAction: "Replace \"it\" with an explicit noun phrase for the closure while preserving the causal chain."
  },
  {
    issueType: "Grammar and Sentence Control",
    severity: "Moderate",
    criteria: ["Grammatical Range & Accuracy", "Coherence & Cohesion"],
    framework: ["Grammar and Sentence Control", "LFC CPC Control"],
    paragraphLocation: "Body Paragraph 2, Sentence 4",
    exactSentence: "Moreover, traditional town squares have functioned as vital social arenas, their decline isolates vulnerable populations such as the elderly and those without private vehicles.",
    sentenceFunction: "Explains the social consequence of local retail decline.",
    whyItLimitsBand: "Two independent clauses are joined with only a comma.",
    kruPomDiagnosis: "The comma splice obscures the boundary between the established social role and its consequence.",
    targetedRevision: "Moreover, traditional town squares have functioned as vital social arenas; their decline isolates vulnerable populations such as the elderly and those without private vehicles.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The semicolon creates a valid sentence boundary while preserving the cause-and-effect meaning.",
    studentAction: "Replace the comma splice with a valid clause boundary and retain the original social-consequence claim."
  }
];
const evinAssertionTypes = ["collocation", "lexical_meaning", "lexical_meaning", "lexical_meaning", "reference", "reference", "grammar"];
const evinExactProblemSpans = [
  "bankruptcy of local business establishments",
  "privileges",
  "Large big cities' stores",
  "lower prices than small vendors",
  "these centers",
  "it",
  ", their decline"
];
evinHistoricalProviderCards.forEach((card, index) => {
  card.issueCategory = card.issueType;
  card.primaryCategory = card.issueType;
  card.evidenceAssertionType = evinAssertionTypes[index];
  card.exactProblemSpan = evinExactProblemSpans[index];
  card.targetSpan = evinExactProblemSpans[index];
});
const evinHistoricalLanguageAudit = [
  {
    exactSentence: evinHistoricalProviderCards[0].exactSentence,
    exactProblemSpan: "leading to bankruptcy of local business establishments",
    criterion: "Lexical Resource",
    category: "collocation",
    classification: "awkward-but-understandable",
    severity: "minor",
    explanation: evinHistoricalProviderCards[0].whyItLimitsBand,
    affectsMeaning: false,
    recurringPatternKey: ""
  },
  {
    exactSentence: evinHistoricalProviderCards[1].exactSentence,
    exactProblemSpan: "these privileges",
    criterion: "Lexical Resource",
    category: "precision",
    classification: "clear-error",
    severity: "minor",
    explanation: evinHistoricalProviderCards[1].whyItLimitsBand,
    affectsMeaning: false,
    recurringPatternKey: ""
  },
  {
    exactSentence: evinHistoricalProviderCards[2].exactSentence,
    exactProblemSpan: "Large big cities' stores",
    criterion: "Lexical Resource",
    category: "precision",
    classification: "clear-error",
    severity: "moderate",
    explanation: evinHistoricalProviderCards[2].whyItLimitsBand,
    affectsMeaning: false,
    recurringPatternKey: ""
  },
  {
    exactSentence: evinHistoricalProviderCards[3].exactSentence,
    exactProblemSpan: "lower prices than small vendors",
    criterion: "Lexical Resource",
    category: "precision",
    classification: "clear-error",
    severity: "moderate",
    explanation: evinHistoricalProviderCards[3].whyItLimitsBand,
    affectsMeaning: false,
    recurringPatternKey: ""
  },
  {
    exactSentence: evinHistoricalProviderCards[4].exactSentence,
    exactProblemSpan: "these centers",
    criterion: "Lexical Resource",
    category: "reference wording",
    classification: "awkward-but-understandable",
    severity: "minor",
    explanation: evinHistoricalProviderCards[4].whyItLimitsBand,
    affectsMeaning: false,
    recurringPatternKey: ""
  },
  {
    exactSentence: evinHistoricalProviderCards[5].exactSentence,
    exactProblemSpan: "it triggers",
    criterion: "Grammatical Range & Accuracy",
    category: "pronoun/reference control",
    classification: "clear-error",
    severity: "moderate",
    explanation: evinHistoricalProviderCards[5].whyItLimitsBand,
    affectsMeaning: false,
    recurringPatternKey: ""
  },
  {
    exactSentence: evinHistoricalProviderCards[6].exactSentence,
    exactProblemSpan: ", their decline",
    criterion: "Grammatical Range & Accuracy",
    category: "run-on sentences",
    classification: "clear-error",
    severity: "moderate",
    explanation: evinHistoricalProviderCards[6].whyItLimitsBand,
    affectsMeaning: false,
    recurringPatternKey: ""
  }
];
const evinAnalysis = await replayProviderOutput(evinPayload, {
  ...evinLocal,
  estimatedBandRange: "6.0-6.5",
  criteriaScores: {
    "Task Response": { range: "6.0", diagnosis: "The route and position are clear, but direct weighing is not demonstrated, environmental harm is promised but undeveloped, and the conclusion adds car dependency." },
    "Coherence & Cohesion": { range: "6.0-6.5", diagnosis: "The paragraph route is clear, but local reference and one clause boundary require repair." },
    "Lexical Resource": { range: "6.0-6.5", diagnosis: "The response has good topical range, with several validated collocation and comparison-precision repairs." },
    "Grammatical Range & Accuracy": { range: "6.0-6.5", diagnosis: "Complex structures are used, but the validated pronoun and comma-splice errors prevent a secure Band 7 profile." }
  },
  languageAudit: evinHistoricalLanguageAudit,
  feedbackCards: evinHistoricalProviderCards,
  top3Issues: evinHistoricalProviderCards.slice(0, 3)
}, "evin-historical-provider-evidence-replay");
const evin = await materialise("Evin", evinAnalysis, evinPayload, "historical-provider-evidence-replay-with-current-gates");

const sunPayload = payloadFromQa(sunSource, "sun-v12-9-7-release-evidence");
const sunAnalysis = await analyzeWriting(sunPayload);
const sunStudentView = assertReleaseAnalysis(sunAnalysis, { studentName: "Sun", taskType: "Task 2" });
await writeJson("Sun-final-regression.json", {
  appVersion: ANALYSIS_VERSIONS.appVersion,
  validationMode: "deterministic-current-engine",
  route: sunAnalysis.routeAssessment,
  estimatedBandRange: sunAnalysis.estimatedBandRange,
  topIssues: sunAnalysis.top3Issues,
  paragraphCoverage: sunStudentView.paragraphCoverage,
  checks: {
    problemSolutionRoute: /Problem & Solution/i.test(sunAnalysis.task2EssayTypeLabel || sunAnalysis.essayType || ""),
    sentenceCompletionPresent: sunAnalysis.feedbackCards.some((item) => /Sentence Completion/i.test(item.issueCategory || item.issueType || "")),
    countabilityDeduplicated: new Set(
      sunAnalysis.feedbackCards
        .filter((item) => /Countability/i.test(item.issueCategory || item.issueType || ""))
        .map((item) => `${item.paragraphLocation}|${item.targetSpan}|${item.kruPomDiagnosis}`)
    ).size === sunAnalysis.feedbackCards.filter((item) => /Countability/i.test(item.issueCategory || item.issueType || "")).length,
    studentBoundaryPass: true
  }
});

const task1Fixtures = [
  {
    visualType: "Bar Chart",
    prompt: "The bar charts compare marriage and divorce rates per thousand people in five countries in 1985 and 2010.",
    writing: "The bar charts compare marriage and divorce rates in five countries in 1985 and 2010, measured per thousand people. Overall, marriage rates were generally higher than divorce rates, and most countries recorded lower marriage figures in 2010. The USA had the highest marriage rate in both years, although its figure fell. The UK and Denmark also declined, while Japan and Germany changed more modestly. Divorce rates were lower in every country. The USA again recorded the highest value, whereas Japan had the lowest. Between the two years, divorce rose slightly in Japan and Germany but remained broadly stable elsewhere. The clearest pattern is therefore a widespread reduction in marriage alongside much smaller movements in divorce."
  },
  {
    visualType: "Map",
    prompt: "The maps show how Langley Village changed between 1910 and 1950.",
    writing: "The maps compare the layout of Langley Village in 1910 and 1950. Overall, the settlement changed from a mainly industrial village into a larger residential area with more public facilities, while the railway and several older buildings disappeared. In 1910, a factory, laundry and small shops occupied the northern area beside Jordan Street. Townhouses stood opposite them, and railway workers' cottages were located near the railway in the south. By 1950, the industrial buildings had been removed and high-rise flats had replaced the townhouses. The road network was extended by New Lane, while the railway and cottages were demolished. Sherman Park, including a pond and children's play area, was created on the former railway land, and additional housing was added around the expanded village."
  },
  {
    visualType: "Process",
    prompt: "The diagram shows how electricity is generated by a solar-panel system.",
    writing: "The diagram illustrates how a domestic solar-panel system generates and supplies electricity. Overall, sunlight is converted into direct current by roof panels, changed into alternating current by an inverter, and then distributed to the house or exchanged with the public grid. First, solar panels installed on the roof absorb energy from sunlight and produce direct-current electricity. This current travels to an inverter, which converts it into alternating current suitable for household appliances. The converted electricity then passes through an electrical panel and is distributed around the home. A utility meter records the flow of power. When the panels produce more electricity than the household needs, the surplus is sent through the meter to the grid. Conversely, when solar production is insufficient, additional electricity is drawn from the grid through the same meter."
  },
  {
    visualType: "Combination Graphs",
    prompt: "The table and line graph show visitor numbers and average spending at a museum from 2018 to 2022.",
    writing: "The table and line graph compare annual museum visitor numbers with average spending per visitor between 2018 and 2022. Overall, attendance fell sharply in the middle of the period before recovering, whereas spending per person rose steadily throughout. Visitor numbers began at 1.2 million in 2018 and increased slightly to 1.3 million in 2019. They then dropped to 0.6 million in 2020 and remained relatively low at 0.8 million in 2021, before rebounding to 1.4 million in 2022, the highest figure shown. By contrast, average spending moved upward each year, from 18 dollars in 2018 to 20 dollars in 2019 and 24 dollars in 2020. It reached 27 dollars in 2021 and finished at 30 dollars in 2022. Thus, the lowest attendance coincided with a comparatively high level of individual spending."
  }
];
// Use the permanent, already source-controlled provider-case corpus for the release gate. The
// inline descriptions above remain readable documentation of the four required visual families,
// while these exact fixtures are shared with the full regression suite.
const regressionCorpus = JSON.parse(
  await readFile(new URL("../fixtures/v12-6-regression-corpus.json", import.meta.url), "utf8")
);
const certifiedTask1Fixtures = ["provider-chart", "provider-map", "provider-process-neutral", "provider-mixed"]
  .map((id) => regressionCorpus.providerCases.find((item) => item.id === id))
  .filter(Boolean);
if (certifiedTask1Fixtures.length !== 4) throw new Error("The certified Task 1 release corpus is incomplete.");
const task1Results = [];
for (const fixture of certifiedTask1Fixtures) {
  const payload = {
    taskType: "Task 1",
    essayType: "",
    visualType: fixture.visualType,
    targetBand: "7.0",
    reportLanguage: "en",
    clientSubmissionId: `task1-${fixture.visualType.toLowerCase().replace(/\W+/g, "-")}-v12-9-7`,
    prompt: fixture.prompt,
    writing: fixture.writing,
    options: { usedTemplate: false, strictFeedback: true, patternRisk: false }
  };
  const analysis = await analyzeWriting(payload);
  const view = assertReleaseAnalysis(analysis, { studentName: `Task 1 ${fixture.visualType}`, taskType: "Task 1" });
  task1Results.push({
    visualType: fixture.visualType,
    estimatedBandRange: analysis.estimatedBandRange,
    criteriaScores: analysis.criteriaScores,
    noRequiredConclusion: !analysis.taskAchievementCapReason || !/conclusion/i.test(analysis.taskAchievementCapReason),
    noTask2SarLeakage: !Object.hasOwn(view.frameworkBreakdown || {}, "SAR Example Quality"),
    studentBoundaryPass: true
  });
}
await writeJson("Task1-final-regression-matrix.json", {
  appVersion: ANALYSIS_VERSIONS.appVersion,
  validationMode: "deterministic-current-engine",
  results: task1Results
});

const summary = {
  appVersion: ANALYSIS_VERSIONS.appVersion,
  generatedAt: new Date().toISOString(),
  providerValidation: {
    liveProvider: "BLOCKED_NO_CREDENTIAL",
    deterministicPath: "PASS",
    authoritativeProviderReplay: "PASS"
  },
  eva: {
    estimatedBandRange: eva.analysis.estimatedBandRange,
    detectedPosition: eva.analysis.detectedPosition,
    sar: eva.analysis.kruPomScores?.["SAR Example Quality"],
    frameworkAuditPass: eva.analysis.feedbackIntegrity.frameworkEvidence.audit.every((item) => item.pass),
    projectionAuditPass: eva.analysis.feedbackIntegrity.projectionConsistencyAudit.every((item) => item.pass)
  },
  evin: {
    estimatedBandRange: evin.analysis.estimatedBandRange,
    detectedPosition: evin.analysis.detectedPosition,
    routeStatus: evin.analysis.routeAssessment?.status,
    sar: evin.analysis.kruPomScores?.["SAR Example Quality"]
  },
  sun: {
    essayType: sunAnalysis.task2EssayTypeLabel || sunAnalysis.essayType,
    estimatedBandRange: sunAnalysis.estimatedBandRange
  },
  task1: task1Results.map((item) => ({
    visualType: item.visualType,
    noRequiredConclusion: item.noRequiredConclusion,
    noTask2SarLeakage: item.noTask2SarLeakage
  }))
};
await writeJson("release-artifact-index.json", summary);
console.log(JSON.stringify(summary, null, 2));
