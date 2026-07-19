import assert from "node:assert/strict";
import { analyzeTask2Safety } from "../domain/task2Safety.js";
import { applyTask2FullSystemUpgrade } from "../domain/task2DiagnosticIntegrity.js";

const prompt = "Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. To what extent do you agree or disagree?";
const writing = `Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. While the opinion is valid, I partly disagree because space research also brings new technology, useful knowledge, and future opportunities that can help improve life on Earth in the long run.
On one hand, it is true that many countries still face serious problems such as poverty, hunger, and poor healthcare. Millions of people do not have enough food, clean water, or proper education. In this situation, spending billions on rockets and satellites can seem wasteful. Governments could use that money to build hospitals, schools, and houses for people in need. These projects would make life better for people right away, instead of focusing on something far away in space.
On the other hand, space exploration also brings useful results that help us in daily life. For example, satellites are used for weather forecasts, GPS, and communication, all of which come from space research. Studying space also helps scientists learn more about Earth’s climate and how to protect it. Although it costs a lot of money, space technology can lead to new inventions and inspire young people to study science and technology, which helps society grow in the future.
In conclusion, I believe that while it is important to solve the problems we have on Earth, investing in space exploration is still valuable. If countries spend money wisely, they can support both the needs of people today and the discoveries that will help us in the near future.`;

const payload = { taskType: "Task 2", essayType: "Opinion Essay", prompt, writing, reportLanguage: "en" };
const safety = analyzeTask2Safety(payload);
assert.equal(safety.introPosition, "partly disagree");
assert.equal(safety.conclusionPosition, "balanced/conditional position");
assert.equal(safety.detectedPosition, "partly disagree");
assert.equal(safety.positionConfidence, "high");
assert.match(safety.routeAssessment.bodyRoutes[0].label, /controlled concession/i);
assert.match(safety.routeAssessment.bodyRoutes[1].label, /aligned with the writer's disagreement/i);
assert.equal(safety.routeAssessment.status, "adequately_developed");
assert.equal(safety.concessionStatus, "Controlled partial-position concession");

const cards = [
  {
    issueType: "Vocabulary Precision",
    severity: "High-Band Refinement",
    criteria: ["Lexical Resource", "Task Response"],
    framework: ["Thesis Route Clarity", "Vocabulary Precision"],
    paragraphLocation: "Introduction, Sentence 2",
    exactSentence: "While the opinion is valid, I partly disagree because space research also brings new technology, useful knowledge, and future opportunities that can help improve life on Earth in the long run.",
    sentenceFunction: "This is the thesis sentence that states the writer's partial disagreement and previews the main reasons.",
    whyItLimitsBand: "The route is clear, but broad roadmap nouns could be more precise.",
    kruPomDiagnosis: "The Golden Thread is present, but the thesis roadmap could be more precise.",
    revisionType: "High-Band Refinement",
    targetedRevision: "While this concern is understandable, I partly disagree because space research produces practical technologies, climate data, and scientific innovation that can improve life on Earth in the long run.",
    whyRevisionIsStronger: "The revision preserves the position and matches the developed body categories.",
    studentAction: "Replace broad roadmap words with the exact categories your body paragraphs will prove."
  },
  {
    issueType: "Conclusion Closure",
    severity: "High-Band Refinement",
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Conclusion Closure"],
    paragraphLocation: "Conclusion, Sentence 2",
    exactSentence: "If countries spend money wisely, they can support both the needs of people today and the discoveries that will help us in the near future.",
    sentenceFunction: "This sentence closes the essay by restating a balanced spending approach.",
    whyItLimitsBand: "The conclusion is consistent, but the final time frame is slightly narrower than the thesis.",
    kruPomDiagnosis: "Closure is successful, but the final time frame should match the introduction and Body 2 more closely.",
    revisionType: "High-Band Refinement",
    targetedRevision: "If countries spend money wisely, they can support people's urgent needs today while still funding discoveries that will benefit society in the long run.",
    whyRevisionIsStronger: "The revision aligns the final wording with the thesis route.",
    studentAction: "Keep the final time frame consistent with the thesis and developed body route."
  }
];

const upgraded = applyTask2FullSystemUpgrade({
  payload,
  analysis: {
    criteriaScores: {
      "Task Response": { range: "7.0" },
      "Coherence & Cohesion": { range: "7.0" },
      "Lexical Resource": { range: "7.0" },
      "Grammatical Range & Accuracy": { range: "7.0" }
    },
    kruPomScores: {},
    estimatedBandRange: "7.0"
  },
  feedbackCards: cards
});

assert.match(upgraded.analysis.mainScoreLimitingFactor, /controlled partly disagree route/i);
assert.doesNotMatch(upgraded.analysis.mainScoreLimitingFactor, /lack precise causal development|Recurring lexical and grammatical errors/i);
assert.equal(upgraded.analysis.kruPomScores["Position Clarity"].status, "Strong");
assert.equal(upgraded.analysis.kruPomScores["Body Paragraph Route Alignment"].status, "Strong");
assert.equal(upgraded.analysis.kruPomScores["Link Back Control"].status, "Strong");
assert.match(upgraded.paragraphFeedback[1].diagnosis, /valid concession/i);
assert.match(upgraded.paragraphFeedback[2].diagnosis, /aligned with the writer's position/i);
assert.ok(upgraded.paragraphFeedback.every((item) => !/performs its basic function|should still be checked/i.test(item.diagnosis)));
assert.equal(upgraded.practicePlan.length, 7);
assert.match(upgraded.practicePlan[0].title, /partial-position/i);
assert.match(upgraded.practicePlan[1].task, /exact categories/i);
assert.match(upgraded.practicePlan[5].task, /time frame/i);
assert.ok(upgraded.practicePlan.every((item) => !/^Repair causal mechanisms$|^Upgrade examples$|^Control grammar and endings$/.test(item.title)));

console.log("V12.2.1 Yuki partial-position and personalized-report regression passed.");
