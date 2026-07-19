import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import {
  buildServerProgressSummary,
  createStudentWorkFingerprint,
  createSubmissionGroupId
} from "../services/apiRouter.js";

const outputDir = path.resolve(process.argv[2] || "work/tmp/v11-4-proof");
await mkdir(outputDir, { recursive: true });

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const writing = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const report = await analyzeWriting({
  ownerAccountId: "teacher-proof",
  accountRole: "teacher",
  studentProfileId: "sun-proof",
  studentDisplayNameSnapshot: "Sun",
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt,
  writing,
  targetBand: "7.0",
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
});

const studentWorkFingerprint = createStudentWorkFingerprint("teacher-proof", {
  taskType: "Task 2",
  publicEssayType: "Opinion Essay",
  internalEssaySubtype: "opinion",
  studentProfileId: "sun-proof",
  prompt,
  writing
});
const submissionGroupId = createSubmissionGroupId("teacher-proof", { studentWorkFingerprint });
const previousRecords = Array.from({ length: 4 }, (_, index) => ({
  username: "teacher-proof",
  ownerAccountId: "teacher-proof",
  submissionId: `previous-submission-${index + 1}`,
  submissionGroupId: `work-previous-${index + 1}`,
  studentWorkFingerprint: `previous-fingerprint-${index + 1}`,
  dateTime: `2026-07-${String(index + 10).padStart(2, "0")}T08:00:00.000Z`,
  taskType: "Task 2",
  studentProfileId: "sun-proof",
  estimatedBandRange: "6.0-6.5",
  top3Issues: [{ issueType: index < 2 ? "Vocabulary Precision" : `Distinct prior issue ${index + 1}` }],
  mostUrgentRepair: "Previous distinct-response repair",
  analysisValidity: "valid",
  progressEligible: true
}));
const currentVersions = Array.from({ length: 4 }, (_, index) => ({
  username: "teacher-proof",
  ownerAccountId: "teacher-proof",
  submissionId: `sun-report-version-${index + 1}`,
  submissionGroupId,
  parentReportId: index ? `sun-report-version-${index}` : "",
  studentWorkFingerprint,
  dateTime: `2026-07-17T${String(index + 8).padStart(2, "0")}:00:00.000Z`,
  taskType: "Task 2",
  studentProfileId: "sun-proof",
  estimatedBandRange: "6.0-6.5",
  top3Issues: report.top3Issues,
  mostUrgentRepair: report.mostUrgentRepair,
  analysisValidity: "valid",
  progressEligible: index === 0,
  analysisReason: index ? "engine-upgrade" : "first-analysis",
  appVersion: `11.${index + 1}.0`,
  engineVersion: `proof-engine-${index + 1}`
}));
const storedRecords = [...previousRecords, ...currentVersions];
const progressAggregation = buildServerProgressSummary(storedRecords, currentVersions.at(-1), "Task 2");

await Promise.all([
  writeFile(path.join(outputDir, "canonical-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputDir, "canonical-analysis.json"), `${JSON.stringify(report.canonicalAnalysis, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputDir, "report-version-records.json"), `${JSON.stringify(storedRecords, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputDir, "progress-aggregation.json"), `${JSON.stringify(progressAggregation, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputDir, "browser-print-fixture.json"), `${JSON.stringify({ report, progressAggregation, storedRecords }, null, 2)}\n`, "utf8")
]);

console.log(`V11.4 deterministic proof written to ${outputDir}`);
