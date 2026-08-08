import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildPrompt } from "../services/promptBuilder.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;
const replayFixture = JSON.parse(await readFile(
  new URL("./fixtures/poon-qualified-provider-strong-replay.json", import.meta.url),
  "utf8"
));

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const writing = [
  "Some people think that towns and cities should divide into separate areas, where is schools, shopping malls, and industrial sites are kept in their specific own zones. While this type of planning city can help to make easier for city management. I believe that this integrate is far more beneficial for modern society because this will bring too many problems for people.",
  "Firstly, dividing a city to specific zones offer significantly advantages for public safety and traffic management, if many industrials are moved to placed far from residential and schools, their won't have effect with public health from pollution. For example, the chemist from chemical factory can only in special industrial areas so the smoke won't be hurt people in the residential area. Consequently, implementing a level of targeted zoning essentially for preserving environmental safety and traffic.",
  "On the other hand, integrating everyday amenities such as schools and residential spaces fosters significantly much more convenience and lively communities. When people are not forced to commute long distances for basic daily requirements, cities experience a dramatic reduction in automobile dependency, traffic congestion, and carbon emissions. For instance, local neighborhoods that include schools allow residents for walk or useing public transport easily instead of relying constantly on cars. Therefore, having mixed areas helps to reduce traffic and makes neighborhoods much better to live in.",
  "In conclusion, I completely disagree with putting every school and shop into separate zones. While some areas like factories need to stay far away for safety, dividing normal places like schools and houses causes too many problems with traffic and travel. Therefore, mixing homes, schools, and shops together makes cities much better and easier for everyone."
].join("\n\n");

const payload = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  visualType: "",
  targetBand: "7.0",
  prompt,
  writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true },
  reportLanguage: "en",
  clientSubmissionId: "v12-9-11-final-canonical-authority"
};

function assertQualifiedTerminalState(report, pathName) {
  const qualified = report.routeAssessment?.qualifiedPositionState;
  assert.equal(qualified?.qualified, true, `${pathName}: qualified route must survive`);
  assert.equal(qualified?.thesisClarity, "locally-contradictory", `${pathName}: local thesis defect must survive`);
  assert.equal(report.detectedPosition, "qualified disagreement", `${pathName}: final position`);
  assert.deepEqual(
    report.routeAssessment.bodyRoutes.map((item) => item.routeRole),
    ["exception-concession", "main-position-support"],
    `${pathName}: body roles`
  );
  assert.doesNotMatch(String(report.kruPomScores?.["Position Clarity"]?.status || ""), /^Strong$/i, `${pathName}: position cannot be Strong`);
  assert.doesNotMatch(String(report.kruPomScores?.["Thesis Route Clarity"]?.status || ""), /^Strong$/i, `${pathName}: thesis cannot be Strong`);
  assert.equal(report.feedbackIntegrity?.finalValidatedState?.terminal, true, `${pathName}: final state`);
  assert.deepEqual(report.canonicalAnalysis.frameworkAssessment.display["Position Clarity"], report.feedbackIntegrity.finalValidatedState.frameworkScores["Position Clarity"], `${pathName}: canonical Position Clarity card`);
  assert.deepEqual(report.canonicalAnalysis.frameworkAssessment.display["Thesis Route Clarity"], report.feedbackIntegrity.finalValidatedState.frameworkScores["Thesis Route Clarity"], `${pathName}: canonical Thesis Route Clarity card`);
  assert.deepEqual(report.kruPomScores["Position Clarity"], report.feedbackIntegrity.finalValidatedState.frameworkScores["Position Clarity"], `${pathName}: top-level Position Clarity card`);
  assert.deepEqual(report.kruPomScores["Thesis Route Clarity"], report.feedbackIntegrity.finalValidatedState.frameworkScores["Thesis Route Clarity"], `${pathName}: top-level Thesis Route Clarity card`);
}

try {
  process.env = { ...ORIGINAL_ENV, DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false" };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  const providerPrompt = buildPrompt(payload);
  assert.match(providerPrompt, /limited exception or concession can coexist with the controlling agree\/disagree judgement/i);
  assert.match(providerPrompt, /do not rate Position Clarity or Thesis Route Clarity as Strong/i);

  // Path A: deterministic/no-provider.
  const deterministic = await analyzeWriting(payload);
  assertQualifiedTerminalState(deterministic, "deterministic");

  // Path B: saved-provider replay. The provider is deliberately stale and reports both
  // terminal thesis dimensions as Strong. Canonical reconciliation must own the final values.
  const replay = structuredClone(deterministic);
  replay.kruPomScores["Position Clarity"] = structuredClone(replayFixture.frameworkRatings["Position Clarity"]);
  replay.kruPomScores["Thesis Route Clarity"] = structuredClone(replayFixture.frameworkRatings["Thesis Route Clarity"]);
  if (replay.feedbackIntegrity?.frameworkScores) {
    replay.feedbackIntegrity.frameworkScores["Position Clarity"] = structuredClone(replay.kruPomScores["Position Clarity"]);
    replay.feedbackIntegrity.frameworkScores["Thesis Route Clarity"] = structuredClone(replay.kruPomScores["Thesis Route Clarity"]);
  }
  if (replay.canonicalTask2Analysis?.frameworkAssessment?.thesisRouteClarity) {
    replay.canonicalTask2Analysis.frameworkAssessment.thesisRouteClarity.status = "Strong";
  }

  process.env.OPENAI_API_KEY = "saved-provider-replay-not-real";
  process.env.OPENAI_MODEL = "saved-provider-replay";
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: JSON.stringify(replay) })
  });

  const replayed = await analyzeWriting({ ...payload, clientSubmissionId: "v12-9-11-provider-replay" });
  assertQualifiedTerminalState(replayed, "saved-provider-replay");
  assert.notEqual(replayed.kruPomScores["Position Clarity"].status, replay.kruPomScores["Position Clarity"].status);
  assert.notEqual(replayed.kruPomScores["Thesis Route Clarity"].status, replay.kruPomScores["Thesis Route Clarity"].status);
  assert.doesNotMatch(JSON.stringify(replayed), /The writer's position is clear and consistent throughout|The thesis clearly establishes the route/);

  console.log("V12.9.11 final canonical authority: deterministic and stale-provider replay converge on the qualified Poon terminal state.");
} finally {
  process.env = ORIGINAL_ENV;
  globalThis.fetch = ORIGINAL_FETCH;
}
