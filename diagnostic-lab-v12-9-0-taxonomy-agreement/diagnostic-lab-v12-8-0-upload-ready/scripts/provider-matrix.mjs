// Real-provider matrix + repeatability harness (brief §32). The OWNER runs this with their key to
// validate gpt-5.6-sol on anonymised Task 1 / Task 2 cases before selling. It calls the REAL engine
// (analyzeWriting + validateReportOutput) directly, so:
//   • it never touches student quota, report history, or the teacher daily limit,
//   • it never deducts credit,
//   • the content is generic/anonymised (no real student writing),
//   • the model in use is exactly OPENAI_MODEL (no fallback).
//
// Usage (PowerShell):
//   $env:OPENAI_API_KEY="sk-..."; $env:OPENAI_MODEL="gpt-5.6-sol"; $env:OPENAI_REASONING_EFFORT="high"
//   node scripts/provider-matrix.mjs
// Optional: REPEAT=3 (repeatability runs for borderline cases), ONLY=task2 | task1
//
// Reports per case: detected task type, estimated band, latency, and (for repeated cases) the
// stability of task type + band neighbourhood across runs.

import { analyzeWriting, validateReportOutput, getAnalyzerHealth } from "../services/aiAnalyzer.js";

if (!process.env.OPENAI_API_KEY) { console.error("FAIL: set OPENAI_API_KEY"); process.exit(1); }
if (!String(process.env.OPENAI_MODEL || "").trim()) { console.error("FAIL: set OPENAI_MODEL (e.g. gpt-5.6-sol)"); process.exit(1); }
process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "true";

const REPEAT = Math.max(1, Number(process.env.REPEAT || 3));
const ONLY = String(process.env.ONLY || "").toLowerCase();

const p = (o) => ({ reportLanguage: "en", options: { essayTypeConfirmed: true, visualTypeConfirmed: true }, ...o });

// Anonymised, generic cases — deliberately NOT the gold fixtures, to prove the engine generalises.
const TASK2 = [
  p({ label: "T2 weak (opinion)", taskType: "Task 2", essayType: "Opinion Essay", targetBand: "6.0",
    prompt: "Some people think students should study alone. Others think group study is better. Discuss and give your opinion.",
    writing: "I think study alone is good. Because when you alone you can focus. Group study is many people talk talk and no focus. But sometimes group can help when you not understand. So in my opinion alone is more better for exam because concentration is high and no distraction from friend." }),
  p({ label: "T2 medium (advantages)", taskType: "Task 2", essayType: "Advantages and Disadvantages", targetBand: "6.5",
    prompt: "More people are working from home. What are the advantages and disadvantages of this development?",
    writing: ["Remote work has become common, and it brings both clear benefits and real drawbacks that deserve balanced consideration.","The main advantage is flexibility, because employees save commuting time and can arrange their day around family responsibilities, which often raises both productivity and wellbeing.","However, the key disadvantage is isolation, since workers lose the informal conversations that build teamwork, and some struggle to separate work from rest at home.","On balance, working from home offers meaningful gains in flexibility, but companies must actively manage communication to prevent isolation."].join("\n\n") }),
  p({ label: "T2 strong (discuss)", taskType: "Task 2", essayType: "Discuss Both Views", targetBand: "7.5",
    prompt: "Some believe governments should fund space exploration; others think the money should address problems on Earth. Discuss both views and give your opinion.",
    writing: ["Whether scarce public funds should reach for the stars or stay grounded in immediate human needs is a genuine dilemma, and both positions rest on defensible reasoning.","Advocates of space investment argue that exploration drives foundational innovation; satellite technology, medical imaging and climate monitoring all emerged from space programmes, so the returns extend far beyond the launch pad.","Critics counter that pressing terrestrial problems, from clean water to healthcare, demand priority, because it is difficult to justify distant missions while preventable suffering persists at home.","In my view the two goals are not mutually exclusive: a measured share of funding should sustain exploration for its long-term innovation dividend, while the majority addresses urgent needs, ensuring progress is both visionary and humane."].join("\n\n") })
];

const TASK1 = [
  p({ label: "T1 chart", taskType: "Task 1", visualType: "Bar Chart", targetBand: "6.5",
    prompt: "The chart below shows the number of visitors to three museums between 2010 and 2015. Summarise the information.",
    writing: ["The bar chart compares annual visitor numbers to three museums — City, Modern and Natural History — over a six-year period from 2010 to 2015.","Overall, all three museums saw rising attendance across the period, with the Modern Museum recording the strongest growth and overtaking the others by the end.","In 2010 the City Museum led with about 400,000 visitors, while the Modern trailed at roughly 250,000.","By 2015 the Modern had climbed to around 600,000, surpassing the City Museum, which grew more modestly to about 500,000, while Natural History remained the least visited throughout."].join("\n\n") }),
  p({ label: "T1 map", taskType: "Task 1", visualType: "Map", targetBand: "6.5",
    prompt: "The maps show a town centre in 1990 and today. Summarise the changes.",
    writing: ["The two maps illustrate how the centre of a small town was redeveloped between 1990 and the present day.","Overall, the area changed from a largely open, low-density layout into a denser, more commercial and pedestrian-focused centre.","In 1990 a car park occupied the north, and a row of small shops lined the main road, with open fields to the east.","Today the car park has been replaced by a shopping centre, the fields have been converted into apartments, and the main road has been pedestrianised."].join("\n\n") }),
  p({ label: "T1 process", taskType: "Task 1", visualType: "Process Diagram", targetBand: "6.5",
    prompt: "The diagram shows how glass bottles are recycled. Summarise the stages.",
    writing: ["The diagram outlines the sequence by which used glass bottles are collected and reprocessed into new glass products.","Overall, the process is cyclical and comprises six main stages, beginning with consumer collection and ending with the manufacture of new bottles.","First, used bottles are deposited in collection banks and transported to a processing plant, where they are washed and sorted by colour.","The clean glass is then crushed into small pieces called cullet, melted in a furnace, and finally moulded into new bottles, which return to shops to restart the cycle."].join("\n\n") })
];

async function runCase(payload) {
  const startedAt = Date.now();
  const analysis = validateReportOutput(await analyzeWriting(payload), payload);
  return {
    label: payload.label,
    latencyMs: Date.now() - startedAt,
    taskType: analysis?.taskType || "",
    band: analysis?.estimatedBandRange || analysis?.overallBand || "",
    topIssues: Array.isArray(analysis?.topIssues) ? analysis.topIssues.length : (Array.isArray(analysis?.priorityIssues) ? analysis.priorityIssues.length : null)
  };
}

const health = getAnalyzerHealth();
console.log(`[matrix] model=${health.modelName} effort=${health.reasoningEffort} maxOut=${health.maxOutputTokens} repeat=${REPEAT}`);
const cases = [];
if (ONLY !== "task1") cases.push(...TASK2);
if (ONLY !== "task2") cases.push(...TASK1);

const results = [];
for (const c of cases) {
  try {
    const r = await runCase(c);
    results.push({ ok: true, ...r });
    console.log(`PASS  ${r.label.padEnd(26)} type=${r.taskType.padEnd(7)} band=${String(r.band).padEnd(9)} ${r.latencyMs}ms`);
  } catch (error) {
    results.push({ ok: false, label: c.label, errorCode: error?.errorCode, providerStatus: error?.providerStatus });
    console.log(`FAIL  ${c.label.padEnd(26)} ${error?.errorCode || "PROVIDER_ERROR"} status=${error?.providerStatus ?? "-"}`);
  }
}

// Repeatability: rerun the borderline medium case and check task type + band neighbourhood stability.
const borderline = TASK2[1];
if (borderline && (ONLY !== "task1")) {
  console.log(`\n[repeatability] ${borderline.label} x${REPEAT}`);
  const runs = [];
  for (let i = 0; i < REPEAT; i++) {
    try { const r = await runCase(borderline); runs.push(r); console.log(`  run[${i}] type=${r.taskType} band=${r.band} ${r.latencyMs}ms`); }
    catch (e) { console.log(`  run[${i}] FAIL ${e?.errorCode}`); }
  }
  const types = new Set(runs.map((r) => r.taskType));
  const bands = new Set(runs.map((r) => String(r.band)));
  console.log(`  stability: taskType ${types.size === 1 ? "STABLE" : "VARIED"} (${[...types].join(", ")}); band set = {${[...bands].join(", ")}}`);
}

const failures = results.filter((r) => !r.ok).length;
console.log(`\n[matrix] ${results.length - failures}/${results.length} cases passed.`);
process.exit(failures ? 1 : 0);
