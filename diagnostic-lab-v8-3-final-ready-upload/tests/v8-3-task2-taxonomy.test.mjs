import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyTask2ClassificationGuard } from "../services/apiRouter.js";
import {
  analyzeTask2Safety,
  classifyTask2Prompt,
  mapLegacyTask2PublicType,
  reconcileTask2CanonicalAnalysis,
  TASK2_AUTO_DETECT_LABEL
} from "../services/task2Safety.js";

const negativeSpacePrompt = "Some people believe that the amount of money spent on the development of technology for space exploration is not justified, and there are more beneficial ways to spend this money. To what extent do you agree or disagree?";

testPublicTaxonomyMatrix();
testAutoDetectAndMismatchGuards();
testSemanticParagraphFunctionMatching();
testEvaSemanticPosition();
testSunSemanticPosition();
await testProductionAndPreviewUi();
console.log("V8.3 Task 2 public taxonomy, internal obligations, semantic position, guard, and UI regressions passed.");

function testPublicTaxonomyMatrix() {
  assert.equal(mapLegacyTask2PublicType("Causes & Solutions"), "problem-solution");
  assert.equal(mapLegacyTask2PublicType("Causes & Effects"), "direct-question");
  assert.equal(mapLegacyTask2PublicType("Positive / Negative Development"), "direct-question");
  assert.equal(mapLegacyTask2PublicType("Advantages Outweigh Disadvantages"), "advantages-disadvantages");
  const cases = [
    ["Opinion Essay", "Governments should fund public transport. To what extent do you agree or disagree?", "Opinion Essay", "standard"],
    ["Discuss Both Views", "Some people prefer cities while others prefer villages. Discuss both views and give your own opinion.", "Discuss Both Views", "standard"],
    ["Problem & Solution", "What problems does urban congestion cause and what solutions can be taken?", "Problem & Solution", "standard"],
    ["Problem & Solution", "What are the causes of urban congestion and what solutions can be taken?", "Problem & Solution", "causes-solutions"],
    ["Advantages & Disadvantages", "What are the advantages and disadvantages of online learning?", "Advantages & Disadvantages", "standard"],
    ["Advantages & Disadvantages", "Do the advantages of a young population outweigh the disadvantages?", "Advantages & Disadvantages", "outweigh"],
    ["Direct Question", "What causes this trend and what effects does it have?", "Direct Question", "causes-effects"],
    ["Direct Question", "Is this a positive or negative development?", "Direct Question", "positive-negative-development"],
    [TASK2_AUTO_DETECT_LABEL, "Why do graduates move to cities? What problems can this create?", "Direct Question", "multi-question"]
  ];
  for (const [essayType, prompt, label, subtype] of cases) {
    const classification = classifyTask2Prompt({ essayType, prompt });
    assert.equal(classification.essayTypeLabel, label, prompt);
    assert.equal(classification.internalSubtype, subtype, prompt);
    assert.equal(classification.confidence, "high", prompt);
    assert.ok(classification.promptObligations.length, prompt);
    assert.equal(classification.classificationMatch, true, prompt);
  }
}

function testAutoDetectAndMismatchGuards() {
  const high = applyTask2ClassificationGuard({
    taskType: "Task 2",
    essayType: TASK2_AUTO_DETECT_LABEL,
    prompt: "What are the causes of urban congestion and what solutions can be taken?",
    writing: "A complete response would explain the causes and solutions in separate developed paragraphs.",
    options: {}
  });
  assert.equal(high.essayType, "Problem & Solution");
  assert.equal(high.task2InternalSubtype, "causes-solutions");

  assert.throws(
    () => applyTask2ClassificationGuard({
      taskType: "Task 2",
      essayType: "Discuss Both Views",
      prompt: "What problems does congestion cause and what solutions can be taken?",
      writing: "The essay addresses the problem and solution routes.",
      options: {}
    }),
    (error) => error.errorCode === "ESSAY_TYPE_MISMATCH" && error.detectedEssayType === "Problem & Solution"
  );

  assert.throws(
    () => applyTask2ClassificationGuard({
      taskType: "Task 2",
      essayType: TASK2_AUTO_DETECT_LABEL,
      prompt: "Consider the role of technology in modern society.",
      writing: "The response gives a general consideration of technology.",
      options: {}
    }),
    (error) => error.errorCode === "ESSAY_TYPE_SELECTION_REQUIRED"
  );
}

function testSemanticParagraphFunctionMatching() {
  const direct = analyzeTask2Safety({
    taskType: "Task 2",
    essayType: "Direct Question",
    prompt: "Why do graduates move to large cities? What problems can this movement create?",
    writing: [
      "Graduates move for employment, but this movement can also create urban pressure.",
      "A serious problem is pressure on housing and transport because rapid population growth can exceed available capacity and harm existing residents.",
      "The main reason graduates move is access to employment because major firms and specialist careers are concentrated in large urban centres.",
      "In conclusion, employment attracts graduates, while the resulting movement can strain housing and transport."
    ].join("\n\n")
  });
  assert.equal(direct.routeAssessment.bodyRoutes[0].label, "answers question 2");
  assert.equal(direct.routeAssessment.bodyRoutes[1].label, "answers question 1");
  assert.equal(direct.routeAssessment.bodyRoutes[0].controllingSentence.startsWith("A serious problem"), true);
  assert.equal(typeof direct.routeAssessment.bodyRoutes[0].routeShiftDetected, "boolean");

  const discussion = analyzeTask2Safety({
    taskType: "Task 2",
    essayType: "Discuss Both Views",
    prompt: "Some people prefer working from home, while others prefer working in an office. Discuss both views and give your own opinion.",
    writing: [
      "Both arrangements have value, but I believe office work is more effective for collaborative roles.",
      "Working in an office supports direct communication and shared problem solving because colleagues can exchange feedback immediately.",
      "Working from home saves commuting time and allows employees to organise focused individual tasks more flexibly.",
      "In conclusion, home working offers flexibility, but I believe office work better supports collaboration."
    ].join("\n\n")
  });
  assert.equal(discussion.routeAssessment.bodyRoutes[0].label, "presents the second view");
  assert.equal(discussion.routeAssessment.bodyRoutes[1].label, "presents the first view");
}

function testEvaSemanticPosition() {
  const writing = [
    "While the costs used for space exploration could be diverted into the promotion of healthcare or education, I firmly agree that the space exploration spending is justified due to technological benefits and future security.",
    "Space technologies support communication, weather forecasting, crop monitoring and healthcare research. These practical benefits show why continued public investment can improve life on Earth and support future innovation.",
    "In addition, space programmes support economic growth and future resource security by creating specialist jobs and developing technologies that can address finite resources and long-term risks.",
    "In conclusion, I firmly agree that the costs of space exploration arejustified due to long-term benefits and future economic security."
  ].join("\n\n");
  const safety = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing });
  assert.equal(safety.essayRoute, "opinion");
  assert.equal(safety.detectedPosition, "generally disagree");
  assert.equal(safety.positionConfidence, "high");
  assert.equal(safety.semanticPosition.relationToPromptClaim, "disagreement");
  assert.equal(safety.semanticPosition.positionClarity, "clear");
  assert.equal(safety.semanticPosition.positionConsistency, "consistent");
  assert.match(safety.semanticPosition.stanceWordingQuality, /indirect/);
  assert.equal(safety.semanticPosition.concessionControl, "integrated concession");
  assert.equal(safety.routeConflict, false);
  assert.equal(safety.capMetadata.caps.some((cap) => cap.reasonCode === "REQUIRED_POSITION_ABSENT"), false);
  const canonical = reconcileTask2CanonicalAnalysis(
    { taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing },
    {
      criteriaScores: {
        "Task Response": { range: "6.5-7.0" },
        "Coherence & Cohesion": { range: "6.5-7.0" },
        "Lexical Resource": { range: "6.0-6.5" },
        "Grammatical Range & Accuracy": { range: "6.0-6.5" }
      }
    },
    safety
  );
  assert.equal(canonical.overallScore.label, "6.5");
  assert.equal(canonical.capMetadata.caps.some((cap) => cap.reasonCode === "REQUIRED_POSITION_ABSENT"), false);
}

function testSunSemanticPosition() {
  const writing = [
    "Some people believe that spending on space exploration is not justified. However, I heavily disagree with this view because it can provide numerous benefits for humans.",
    "Investing in space technology is advantageous because satellites support communication, navigation and disaster monitoring. It can also encourage young people to study science and create future innovations.",
    "On the other hand, poverty, healthcare, food supply and climate change also need financial support. Governments should invest in hospitals, schools and basic needs, although this paragraph does not explicitly return to the main disagreement.",
    "In conclusion, even though urgent public problems need funding, I believe that money spent on space exploration is justified because it provides long-term benefits."
  ].join("\n\n");
  const safety = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing });
  assert.equal(safety.detectedPosition, "strongly disagree");
  assert.equal(safety.semanticPosition.positionClarity, "clear");
  assert.equal(safety.semanticPosition.positionConsistency, "consistent");
  assert.match(safety.semanticPosition.stanceWordingQuality, /collocationally awkward/);
  assert.match(safety.routeAssessment.bodyRoutes[1].label, /concession/);
  assert.equal(safety.routeAssessment.bodyRoutes[1].status, "partially_developed");
  assert.equal(safety.capMetadata.caps.some((cap) => cap.reasonCode === "REQUIRED_POSITION_ABSENT"), false);
}

async function testProductionAndPreviewUi() {
  const expected = [
    "Not Sure / Auto-detect",
    "Opinion Essay",
    "Discuss Both Views",
    "Problem & Solution",
    "Advantages & Disadvantages",
    "Direct Question"
  ];
  const [production, preview] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../netlify-static-preview/index.html", import.meta.url), "utf8")
  ]);
  for (const html of [production, preview]) {
    const select = html.match(/<select id="essay-type"[\s\S]*?<\/select>/)?.[0] || "";
    const options = [...select.matchAll(/<option(?:\s+selected)?>([^<]+)<\/option>/g)].map((match) => match[1]);
    assert.deepEqual(options, expected);
    assert.match(select, /<option selected>Not Sure \/ Auto-detect<\/option>/);
    assert.doesNotMatch(select, /Causes & Solutions|Causes & Effects|Outweigh|Positive or Negative|Hybrid/);
  }
}
