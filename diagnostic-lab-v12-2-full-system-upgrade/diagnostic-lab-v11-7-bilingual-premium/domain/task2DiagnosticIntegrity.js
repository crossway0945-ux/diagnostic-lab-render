import {
  analyzeTask2Safety,
  assessTask2RevisionFidelity,
  parseTask2Structure,
  validateTask2RevisionIntegrity
} from "./task2Safety.js";

const STOPWORDS = new Set([
  "a","an","the","this","that","these","those","it","its","they","them","their","there","here",
  "is","are","was","were","be","been","being","do","does","did","have","has","had","will","would","could","should","may","might","must",
  "and","or","but","so","because","since","as","of","to","in","on","at","for","from","with","by","into","within","through","about","than",
  "some","many","more","most","all","same","specific","certain","place","places","thing","things","people","person","area","areas",
  "first","firstly","second","secondly","furthermore","moreover","however","therefore","thus","hence","example","instance","conclusion"
]);

const THAI_COPY = Object.freeze({
  mechanismTitle: "ความชัดเจนของ Explanation และกลไกเหตุผล",
  mechanismFunction: "ประโยคนี้กำลังอธิบายกลไกที่เชื่อม Topic Sentence กับผลลัพธ์ของย่อหน้า",
  mechanismLimit: "คำอธิบายยังใช้คำนามกว้างหรือข้ามขั้นของเหตุและผล ทำให้ผู้อ่านยังไม่เห็นว่าข้อเสนอหรือสถานการณ์นำไปสู่ผลที่อ้างอย่างไร",
  mechanismDiagnosis: "Route ของย่อหน้ายังมองเห็นได้ แต่ Explanation ต้องระบุผู้ได้รับผล การเปลี่ยนแปลงที่เกิดขึ้น และผลลัพธ์ตามลำดับ",
  mechanismAction: "เขียน Explanation ใหม่เป็น ผู้ได้รับผล -> กลไกหรือการเปลี่ยนแปลง -> ผลที่เชื่อมกลับไปหา Topic Sentence",
  conclusionTitle: "ความแม่นยำของ Conclusion และการปิด Route",
  conclusionFunction: "Conclusion นี้กำลัง restate จุดยืนหรือ route หลักของงาน",
  conclusionLimit: "Conclusion ยังปิด route ได้ไม่เต็มที่ เพราะมีความไม่แม่นของ policy reference, clause control, route overlap หรือความสอดคล้องของจุดยืน",
  conclusionDiagnosis: "Conclusion ต้องรักษาจุดยืนเดิม ใช้คำอ้างอิงที่ตรงกับโจทย์ และปิดเหตุผลหรือหน้าที่เดิมของ Body โดยไม่เพิ่มแนวคิดใหม่",
  conclusionAction: "เขียน Conclusion เป็นประโยคสมบูรณ์ที่ restate จุดยืนหรือหน้าที่ของโจทย์ พร้อมเหตุผลหรือ route เดิมจาก Body เท่านั้น",
  languageTitle: "ความแม่นยำของภาษาและ Sentence Control",
  languageFunction: "ประโยคนี้กำลังทำหน้าที่ใน route ของย่อหน้า แต่มีปัญหาภาษาที่ลดความชัดเจน",
  languageAction: "แก้เฉพาะปัญหาที่ตรวจพบ แล้วตรวจรูปแบบเดียวกันทั้งงานโดยไม่เปลี่ยนจุดยืนหรือเหตุผลหลัก"
});

export function applyTask2FullSystemUpgrade({ payload = {}, analysis = {}, feedbackCards = [], paragraphFeedback = [], practicePlan = [] } = {}) {
  if (payload.taskType !== "Task 2") return { analysis, feedbackCards, paragraphFeedback, practicePlan, integrity: null };

  const safety = payload.task2Safety || analyzeTask2Safety(payload);
  const records = buildSentenceRecords(payload.writing);
  let cards = alignEvidenceCards(feedbackCards, records);
  cards = rejectStaleProviderCards(cards, safety, payload);
  cards = cards.map((card) => normalizeCardLanguage(card, payload));
  cards = cards.map((card) => makeRevisionSafe(card, safety));
  cards = ensureParagraphFunctionCoverage(cards, records, safety, payload);
  cards = ensureBodyMechanismCoverage(cards, records, safety, payload);
  cards = ensureComparativeWeightingCoverage(cards, records, safety, payload);
  cards = ensureLanguageCoverage(cards, records, safety, payload);

  const conclusionIntegrity = assessConclusionIntegrity({ payload, safety, records });
  cards = ensureConclusionCoverage(cards, records, safety, payload, conclusionIntegrity);
  cards = cards.map((card) => makeRevisionSafe(card, safety)).filter((card) => {
    if (!card.revisionIntegrity?.pass) return false;
    const noChange = normalize(card.targetedRevision) === normalize(card.exactSentence);
    const noDiagnosedLanguageIssue = !(card.revisionIntegrity?.diagnosedCategories || []).length;
    return !(card._integrityGenerated && noChange && noDiagnosedLanguageIssue);
  });
  cards = dedupeCards(cards).sort((a, b) => recordOrder(a, records) - recordOrder(b, records));
  cards = cards.map(({ _integrityGenerated, ...card }) => card);

  const criteriaScores = calibrateCriteria(analysis.criteriaScores || {}, safety, conclusionIntegrity);
  const estimatedBandRange = deriveOverallRange(criteriaScores) || analysis.estimatedBandRange || "6.0-6.5";
  const kruPomScores = calibrateFramework(analysis.kruPomScores || {}, safety, conclusionIntegrity, payload.reportLanguage);
  const executive = buildExecutiveSummary({ analysis, safety, conclusionIntegrity, payload });
  const canonicalTask2Analysis = upgradeCanonicalTask2(analysis.canonicalTask2Analysis, {
    criteriaScores,
    estimatedBandRange,
    conclusionIntegrity,
    executive,
    cards,
    topIssues: buildGenericTopIssues(cards, safety, conclusionIntegrity, payload.reportLanguage),
    paragraphFeedback: buildParagraphFeedback(records, cards, payload.reportLanguage),
    practicePlan: buildRepairPlan(cards, safety, conclusionIntegrity, payload.reportLanguage, practicePlan)
  });
  const upgradedAnalysis = {
    ...analysis,
    criteriaScores,
    estimatedBandRange,
    kruPomScores,
    canonicalTask2Analysis,
    conclusionClosureStatus: conclusionIntegrity.status,
    mainScoreLimitingFactor: executive.mainScoreLimitingFactor,
    mostUrgentRepair: executive.mostUrgentRepair,
    fullSystemIntegrity: {
      schema: "Task2DiagnosticIntegrity.v12.2",
      paragraphCount: records.paragraphs.length,
      sentenceCount: records.sentences.length,
      evidenceMatched: cards.every((card) => evidenceFound(card.exactSentence, records)),
      conclusion: conclusionIntegrity
    }
  };

  const topIssues = buildGenericTopIssues(cards, safety, conclusionIntegrity, payload.reportLanguage);
  const alignedParagraphFeedback = buildParagraphFeedback(records, cards, payload.reportLanguage);
  const plan = buildRepairPlan(cards, safety, conclusionIntegrity, payload.reportLanguage, practicePlan);
  return { analysis: upgradedAnalysis, feedbackCards: cards, topIssues, paragraphFeedback: alignedParagraphFeedback, practicePlan: plan, integrity: upgradedAnalysis.fullSystemIntegrity };
}

export function buildSentenceRecords(writing = "") {
  const structure = parseTask2Structure(String(writing || ""));
  const paragraphs = structure.paragraphs || [];
  const sentences = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    splitSentences(paragraph).forEach((sentence, sentenceIndex) => {
      sentences.push({
        paragraphIndex,
        sentenceIndex,
        sentence,
        location: paragraphLocation(paragraphIndex, paragraphs.length, sentenceIndex)
      });
    });
  });
  return { paragraphs, sentences, confidence: structure.confidence, method: structure.method };
}

export function assessConclusionIntegrity({ payload = {}, safety = null, records = null } = {}) {
  const effectiveSafety = safety || analyzeTask2Safety(payload);
  const map = records || buildSentenceRecords(payload.writing);
  const conclusionRecord = map.sentences.find((item) => item.paragraphIndex === map.paragraphs.length - 1) || null;
  if (!conclusionRecord) return { status: "Needs Work", present: false, complete: false, stanceConsistent: false, routeOverlap: 0, policyContradiction: false, reasons: ["missing conclusion"] };
  const conclusion = conclusionRecord.sentence;
  const complete = /[.!?][\"')\]]?$/.test(conclusion.trim()) && !/[,;:]\s*$/.test(conclusion.trim());
  const stanceConsistent = !effectiveSafety.stanceRequired || !["unclear", "contradictory"].includes(effectiveSafety.detectedPosition) && !effectiveSafety.routeConflict;
  const routeText = [
    ...((effectiveSafety.routeAssessment?.bodyRoutes || []).map((item) => item.controllingSentence || item.evidence || "")),
    effectiveSafety.routeAssessment?.position || ""
  ].join(" ");
  const routeOverlap = tokenOverlap(routeText, conclusion);
  const routeConclusion = effectiveSafety.routeAssessment?.requirements?.find?.((item) => item.id === "conclusion");
  const routeConclusionControlled = /adequately_developed|fully_developed/.test(String(routeConclusion?.status || ""));
  const policyContradiction = detectNegationContradiction(conclusion, payload.prompt);
  const conclusionLanguageIssues = (effectiveSafety.languageProfile?.validatedIssues || []).filter((item) => item.paragraphLocation === "Conclusion" || Number(item.paragraphIndex) === map.paragraphs.length - 1).length;
  const reasons = [];
  if (!complete) reasons.push("unfinished or uncontrolled sentence ending");
  if (!stanceConsistent) reasons.push("position or route conflict");
  if (!routeConclusionControlled && routeOverlap < 0.14) reasons.push("weak overlap with the body routes");
  if (policyContradiction) reasons.push("policy restatement contradicts or reverses the stated position");
  if (conclusionLanguageIssues >= 2) reasons.push("multiple language-control issues in the conclusion");
  const routeClosed = routeConclusionControlled || routeOverlap >= 0.14;
  const status = complete && stanceConsistent && !policyContradiction && routeClosed && conclusionLanguageIssues < 2
    ? "Strong"
    : complete && stanceConsistent && !policyContradiction && routeClosed
      ? "Moderate"
      : "Needs Work";
  return { status, present: true, complete, stanceConsistent, routeOverlap: Number(routeOverlap.toFixed(3)), policyContradiction, conclusionLanguageIssues, reasons, exactSentence: conclusionRecord.sentence, paragraphLocation: conclusionRecord.location };
}

function upgradeCanonicalTask2(canonical, { criteriaScores, estimatedBandRange, conclusionIntegrity, executive, cards, topIssues, paragraphFeedback, practicePlan }) {
  if (!canonical || typeof canonical !== "object") return canonical || null;
  const next = structuredCloneSafe(canonical);
  next.criterionAssessment = {
    ...(next.criterionAssessment || {}),
    taskResponseOrAchievement: { ...(next.criterionAssessment?.taskResponseOrAchievement || {}), ...(criteriaScores["Task Response"] || {}) },
    coherenceCohesion: { ...(next.criterionAssessment?.coherenceCohesion || {}), ...(criteriaScores["Coherence & Cohesion"] || {}) },
    lexicalResource: { ...(next.criterionAssessment?.lexicalResource || {}), ...(criteriaScores["Lexical Resource"] || {}) },
    grammaticalRangeAccuracy: { ...(next.criterionAssessment?.grammaticalRangeAccuracy || {}), ...(criteriaScores["Grammatical Range & Accuracy"] || {}) }
  };
  next.criterionScores = criteriaScores;
  const overall = parseRange(estimatedBandRange) || { low: 6, high: 6.5 };
  next.overallScore = { ...(next.overallScore || {}), low: overall.low, high: overall.high, label: estimatedBandRange, confidence: next.overallScore?.confidence || "medium" };
  next.overallBandRange = next.overallScore;
  next.executiveSummary = executive;
  next.frameworkAssessment = {
    ...(next.frameworkAssessment || {}),
    conclusionClosure: { status: conclusionIntegrity.status },
    display: {
      ...(next.frameworkAssessment?.display || {}),
      "Conclusion Closure": { status: conclusionIntegrity.status, diagnosis: conclusionIntegrity.reasons.join("; ") }
    }
  };
  next.evidenceIssues = cards;
  next.topIssues = topIssues;
  next.paragraphFeedback = paragraphFeedback;
  next.repairPlan = practicePlan;
  next.consistency = { ...(next.consistency || {}), analysisSource: "full-system-integrity-v12.2", scoreSource: "criterion-arithmetic-v12.2" };
  return next;
}

function alignEvidenceCards(cards, records) {
  return (Array.isArray(cards) ? cards : []).map((card) => {
    const exact = String(card?.exactSentence || "").trim();
    if (!exact) return null;
    const exactNormalized = normalize(exact);
    let match = records.sentences.find((item) => normalize(item.sentence) === exactNormalized);
    if (match) return { ...card, exactSentence: match.sentence, paragraphLocation: match.location };
    for (let index = 0; index < records.sentences.length - 1; index += 1) {
      const first = records.sentences[index];
      const second = records.sentences[index + 1];
      if (first.paragraphIndex !== second.paragraphIndex) continue;
      const joined = `${first.sentence}${second.sentence}`;
      if (normalize(joined) === exactNormalized || normalize(`${first.sentence} ${second.sentence}`) === exactNormalized) {
        return { ...card, exactSentence: exact, paragraphLocation: `${first.location}–${second.sentenceIndex + 1}` };
      }
    }
    const candidate = records.sentences.map((item) => ({ item, score: similarity(exact, item.sentence) })).sort((a, b) => b.score - a.score)[0];
    match = candidate?.score >= 0.68 ? candidate.item : null;
    if (!match) return null;
    return { ...card, exactSentence: match.sentence, paragraphLocation: match.location };
  }).filter(Boolean);
}

function rejectStaleProviderCards(cards, safety, payload) {
  const bodyRoutes = safety.routeAssessment?.bodyRoutes || [];
  return cards.filter((card) => {
    if (!/topic sentence route alignment|body paragraph route alignment/i.test(String(card.issueType || ""))) return true;
    const match = String(card.paragraphLocation || "").match(/Body Paragraph (\d+)/i);
    const route = bodyRoutes.find((item) => Number(item.index) === Number(match?.[1]));
    const routeControlled = route && /adequately_developed|fully_developed/.test(String(route.alignmentStatus || route.status || ""));
    return !routeControlled || Boolean(safety.routeConflict);
  });
}

function normalizeCardLanguage(card, payload) {
  const thaiReport = String(payload.reportLanguage || "").toLowerCase() === "th";
  const hasThai = (value) => /[ก-๙]/u.test(String(value || ""));
  if (thaiReport || ![card.sentenceFunction, card.whyItLimitsBand, card.kruPomDiagnosis, card.studentAction].some(hasThai)) return card;
  const label = String(card.issueType || "this control point");
  const location = String(card.paragraphLocation || "the paragraph");
  return {
    ...card,
    sentenceFunction: `This sentence is being evaluated for ${label.toLowerCase()} within the task route.`,
    whyItLimitsBand: `At ${location}, the sentence does not yet express its function with enough precision, development or language control for a secure higher-band response.`,
    kruPomDiagnosis: `Keep the valid paragraph route at ${location}, but repair the specific ${label.toLowerCase()} weakness without replacing the student's central claim.`,
    studentAction: `Revise the ${label.toLowerCase()} issue at ${location}, then check the same control point throughout the response.`
  };
}

function makeRevisionSafe(card, safety) {
  const source = String(card.exactSentence || "");
  let revision = repairGenericSentence(String(card.targetedRevision || source));
  let type = String(card.revisionType || "Route-Preserving Revision");
  const sourceTokens = contentTokens(source);
  const revisionTokens = contentTokens(revision);
  const semanticOverlap = tokenOverlap(source, revision);
  const semanticJaccard = similarity(source, revision);
  const keyConceptsPreserved = sourceTokens.filter((token) => revisionTokens.includes(token)).length;
  const sourceConcepts = routeConcepts(source);
  const revisionConcepts = routeConcepts(revision);
  const sharedConcept = sourceConcepts.some((concept) => revisionConcepts.includes(concept));
  const minimumOverlap = type === "Teacher-Guided Expansion" ? 0.04 : 0.20;
  const semanticAnchored = (type === "Teacher-Guided Expansion" && (sharedConcept || keyConceptsPreserved >= 1)) ||
    (type !== "Teacher-Guided Expansion" && sharedConcept && keyConceptsPreserved >= 1);
  const unrelatedRevision = sourceTokens.length >= 3 && revisionTokens.length >= 3 && !semanticAnchored && (
    semanticOverlap < minimumOverlap ||
    (type !== "Teacher-Guided Expansion" && semanticJaccard < 0.12 && keyConceptsPreserved < 2)
  );
  if (unrelatedRevision) {
    revision = repairGenericSentence(source);
    type = normalize(revision) === normalize(source) ? "High-Band Refinement" : "Route-Preserving Revision";
  }
  if (safety.positionConfidence === "low" && /\bi\s+(?:strongly|firmly|generally|partly|partially)?\s*(?:agree|disagree)\b/i.test(revision)) {
    type = "Teacher-Guided Expansion";
  }
  const fidelity = assessTask2RevisionFidelity({ exactSentence: source, targetedRevision: revision, revisionType: type });
  revision = fidelity.targetedRevision;
  type = fidelity.revisionType;
  let integrity = validateTask2RevisionIntegrity({ exactSentence: source, targetedRevision: revision, revisionType: type });
  if (!integrity.pass && type !== "Teacher-Guided Expansion") {
    type = "Teacher-Guided Expansion";
    integrity = validateTask2RevisionIntegrity({ exactSentence: source, targetedRevision: revision, revisionType: type });
  }
  if (!integrity.pass) {
    revision = repairGenericSentence(source);
    type = normalize(revision) === normalize(source) ? "High-Band Refinement" : "Route-Preserving Revision";
    integrity = validateTask2RevisionIntegrity({ exactSentence: source, targetedRevision: revision, revisionType: type });
  }
  return { ...card, targetedRevision: revision, revisionType: type, revisionIntegrity: integrity };
}

function ensureParagraphFunctionCoverage(cards, records, safety, payload) {
  const output = [...cards];
  const thai = String(payload.reportLanguage || "").toLowerCase() === "th";
  const add = (card) => {
    const sameSentenceIndex = output.findIndex((item) => normalize(item.exactSentence) === normalize(card.exactSentence));
    if (sameSentenceIndex < 0) {
      output.push(card);
      return;
    }
    const existing = output[sameSentenceIndex];
    const existingSpecificity = cardSpecificity(existing);
    const incomingSpecificity = cardSpecificity(card);
    if (incomingSpecificity >= existingSpecificity) output[sameSentenceIndex] = card;
  };
  const issueMap = new Map();
  for (const issue of safety.languageProfile?.validatedIssues || []) {
    const key = normalize(issue.exactSentence);
    const list = issueMap.get(key) || [];
    list.push(issue);
    issueMap.set(key, list);
  }
  const introRecords = records.sentences.filter((item) => item.paragraphIndex === 0);
  const introFirst = introRecords[0];
  const stanceRecord = introRecords.find((item) => /\b(?:agree|disagree|outweigh|in my (?:view|opinion)|i believe)\b/i.test(item.sentence)) || introRecords.at(-1);
  if (introFirst && (issueMap.has(normalize(introFirst.sentence)) || promptFrameOverlap(payload.prompt, introFirst.sentence) < 0.18)) {
    add({
      _integrityGenerated: true,
      issueType: thai ? "ความแม่นยำของ Introduction Paraphrase" : "Introduction Paraphrase Precision",
      severity: "Moderate",
      criteria: ["Task Response", "Lexical Resource"],
      framework: ["Prompt Understanding", "Clear / Precise", "Thesis Entry Control"],
      paragraphLocation: introFirst.location,
      exactSentence: introFirst.sentence,
      sentenceFunction: thai ? "ประโยคเปิดกำลัง paraphrase ประเด็นหลักของโจทย์ก่อนเข้าสู่ Thesis" : "This opening sentence is paraphrasing the proposition or context before the thesis states the response route.",
      whyItLimitsBand: thai ? "กรอบโจทย์ยังใช้คำนามกว้างหรือความสัมพันธ์ของแนวคิดไม่แม่น ทำให้ Thesis เข้าสู่ route ได้ไม่คม" : "The prompt frame uses vague nouns or imprecise relationships, so the thesis does not enter a fully controlled task route.",
      kruPomDiagnosis: thai ? "รักษาความหมายเดิมของโจทย์ แต่ใช้คำนามและความสัมพันธ์ที่ระบุจริงแทนคำกว้าง" : "Preserve the original proposition, but replace vague categories with the precise entities and relationship stated in the prompt.",
      targetedRevision: buildPromptAnchoredParaphrase(payload.prompt, introFirst.sentence),
      revisionType: "Teacher-Guided Expansion",
      whyRevisionIsStronger: thai ? "เวอร์ชันนี้ยึดกรอบโจทย์โดยตรงและติดป้าย Teacher-Guided Expansion เพราะมีการจัดถ้อยคำใหม่" : "The revision is anchored to the prompt and is labelled Teacher-Guided Expansion because it reconstructs the framing sentence.",
      studentAction: thai ? "ขีดเส้นใต้ entity และความสัมพันธ์ในโจทย์ แล้ว paraphrase โดยห้ามเปลี่ยน agent, policy หรือ direction" : "Underline the prompt entities and relationship, then paraphrase without changing the agent, policy or direction."
    });
  }
  const thesisNeedsPrecision = stanceRecord && /\b(?:lack of travel accessibility|difficulty of traveling|specific places?|same places?|congestion of traffic|due to the lack of)\b/i.test(stanceRecord.sentence);
  if (stanceRecord && (issueMap.has(normalize(stanceRecord.sentence)) || thesisNeedsPrecision || !/adequately_developed|fully_extended/.test(String(safety.routeAssessment?.thesisRouteStatus || "")))) {
    add({
      _integrityGenerated: true,
      issueType: thai ? "ความแม่นยำของ Thesis Route" : "Thesis Route and Language Precision",
      severity: safety.positionConfidence === "low" ? "Critical" : "Moderate",
      criteria: ["Task Response", "Lexical Resource"],
      framework: ["Position Clarity", "Thesis Route Clarity", "Clear / Precise"],
      paragraphLocation: stanceRecord.location,
      exactSentence: stanceRecord.sentence,
      sentenceFunction: thai ? "Thesis นี้กำลังระบุ judgement และวาง route ของ Body" : "This thesis is stating the judgement and establishing the route for the body paragraphs.",
      whyItLimitsBand: thai ? "จุดยืนอาจชัด แต่เหตุผลหรือภาษาที่ใช้วาง route ยังไม่เป็นผลโดยตรงของ proposition อย่างแม่นยำ" : "The position may be visible, but the reasons or route wording are not expressed as precise consequences or functions of the proposition.",
      kruPomDiagnosis: thai ? "แยก route clarity ออกจาก language precision: คง judgement เดิม แล้วเขียนเหตุผล Body เป็น noun phrase ที่แม่น" : "Separate route clarity from language precision: preserve the judgement and state each body reason in a precise, parallel form.",
      targetedRevision: buildThesisRevision(safety, stanceRecord.sentence),
      revisionType: "Teacher-Guided Expansion",
      whyRevisionIsStronger: thai ? "เวอร์ชันนี้รักษา judgement และนำ route จาก Body กลับมาวางใน Thesis อย่างชัดเจน" : "The revision preserves the judgement and states the body routes explicitly in the thesis.",
      studentAction: thai ? "ตรวจว่าเหตุผลทุกข้อใน Thesis มี Body รองรับ และใช้ถ้อยคำเดียวกันในระดับ concept" : "Check that every thesis reason has a matching body paragraph and uses the same concept-level wording."
    });
  }

  for (const route of safety.routeAssessment?.bodyRoutes || []) {
    const paragraphRecords = records.sentences.filter((item) => item.paragraphIndex === Number(route.index));
    if (!paragraphRecords.length) continue;
    const topic = paragraphRecords[0];
    const routeWeak = !/adequately_developed|fully_extended/.test(String(route.alignmentStatus || route.status || ""));
    if (topic && (routeWeak || issueMap.has(normalize(topic.sentence)))) {
      const repaired = buildTopicSentenceRevision(topic.sentence, route, payload.prompt);
      add({
      _integrityGenerated: true,
        issueType: thai ? `ความแม่นยำของ Body ${route.index} Topic Sentence` : `Body ${route.index} Topic Sentence Precision`,
        severity: routeWeak ? "Major" : "Moderate",
        criteria: ["Task Response", "Coherence & Cohesion", "Lexical Resource"],
        framework: ["Body Paragraph Route Alignment", "Topic Sentence Strength", "Clear / Precise"],
        paragraphLocation: topic.location,
        exactSentence: topic.sentence,
        sentenceFunction: thai ? "Topic Sentence นี้กำลังเปิด mini-claim ของย่อหน้า" : "This topic sentence is opening the paragraph's mini-claim and linking it to the thesis route.",
        whyItLimitsBand: thai ? "mini-claim ยังใช้คำกว้างหรือไม่แสดงความสัมพันธ์กับ Thesis อย่างแม่น" : "The mini-claim uses vague wording or does not express its relationship to the thesis with enough precision.",
        kruPomDiagnosis: thai ? "คงเหตุผลเดิม แต่เขียน subject, mechanism และ result ของย่อหน้าให้มองเห็นตั้งแต่ประโยคแรก" : "Keep the original reason, but make the paragraph subject, mechanism and intended result visible from the first sentence.",
        targetedRevision: repaired,
        revisionType: normalize(repaired) === normalize(topic.sentence) ? "High-Band Refinement" : "Route-Preserving Revision",
        whyRevisionIsStronger: thai ? "เวอร์ชันนี้ลดคำกว้างและรักษา route เดิม" : "The revision reduces vague wording while preserving the paragraph route.",
        studentAction: thai ? "เทียบ Topic Sentence กับ Thesis แล้ววง concept ที่ต้องตรงกัน" : "Compare the topic sentence with the thesis and circle the concept that must match."
      });
    }
    const example = paragraphRecords.find((item) => /^(?:for example|for instance|such as|to illustrate)\b/i.test(item.sentence));
    const developmentPartial = /partially_developed|mentioned_only/.test(String(route.developmentStatus || route.status || ""));
    if (example && developmentPartial) {
      add({
      _integrityGenerated: true,
        issueType: thai ? `การพัฒนาตัวอย่าง Body ${route.index}` : `Body ${route.index} Example Development`,
        severity: "Moderate",
        criteria: ["Task Response", "Coherence & Cohesion"],
        framework: ["Explanation Depth", "SAR Example Quality", "LFC CPC Control"],
        paragraphLocation: example.location,
        exactSentence: example.sentence,
        sentenceFunction: thai ? "ตัวอย่างนี้กำลังพิสูจน์ mini-claim ของย่อหน้า" : "This example is trying to prove the paragraph's mini-claim through a situation, mechanism and result.",
        whyItLimitsBand: thai ? "ตัวอย่างเกี่ยวข้อง แต่กลไกหรือผลลัพธ์ยังแคบ กว้างเกินไป หรืออาศัย causal chain ที่ยังไม่สมเหตุสมผล" : "The example is relevant, but its mechanism or result is too narrow, vague or dependent on an unsupported causal chain.",
        kruPomDiagnosis: thai ? "ไม่จำเป็นต้องเปลี่ยนหัวข้อตัวอย่าง เพียงทำให้ affected group, mechanism และ realistic result ชัด" : "The example topic can remain; the repair is to make the affected group, mechanism and realistic result explicit.",
        targetedRevision: buildExampleRevision(example.sentence, route, payload.prompt),
        revisionType: "Teacher-Guided Expansion",
        whyRevisionIsStronger: thai ? "เวอร์ชันนี้รักษา example route และเพิ่มกลไกอย่างมีป้ายกำกับ" : "The revision preserves the example route and adds an explicit mechanism as labelled teacher guidance.",
        studentAction: thai ? "เขียนตัวอย่างใหม่เป็น Situation -> Action/Mechanism -> Result และตัดผลสุดโต่งที่พิสูจน์ไม่ได้" : "Rewrite the example as Situation -> Action/Mechanism -> Result and remove unsupported extreme outcomes."
      });
    }
    const last = paragraphRecords.at(-1);
    const incomplete = last && !/[.!?]["')\]]*$/.test(last.sentence.trim());
    const lastIsExample = last && /^(?:for example|for instance|such as|to illustrate)\b/i.test(last.sentence);
    if (last && (incomplete || (!route.linkBack && !lastIsExample))) {
      const repaired = buildClosureRevision(last.sentence, route, payload.prompt);
      const revision = repaired;
      add({
      _integrityGenerated: true,
        issueType: thai ? `การปิด Body ${route.index} และ Link-Back` : `Body ${route.index} Paragraph Closure and Link-Back`,
        severity: incomplete ? "Moderate" : "Minor Repair",
        criteria: ["Coherence & Cohesion", "Grammatical Range & Accuracy"],
        framework: ["Link Back Control", "LFC CPC Control"],
        paragraphLocation: last.location,
        exactSentence: last.sentence,
        sentenceFunction: thai ? "ประโยคนี้กำลังปิดย่อหน้าและพากลับไปหา Topic Sentence" : "This sentence is closing the paragraph and returning the result to its topic sentence.",
        whyItLimitsBand: thai ? "ประโยคปิดยังไม่สมบูรณ์หรือยังไม่พากลับไปหา mini-claim อย่างชัด" : "The paragraph ending is incomplete or does not return clearly to the mini-claim.",
        kruPomDiagnosis: thai ? "ปิด sentence ให้ครบก่อน แล้วใช้ result เดิมเชื่อมกลับไปหาเหตุผลของย่อหน้า" : "Complete the sentence first, then use the same result to reconnect with the paragraph reason.",
        targetedRevision: revision,
        revisionType: normalize(repaired) === normalize(last.sentence) ? "Teacher-Guided Expansion" : "Route-Preserving Revision",
        whyRevisionIsStronger: thai ? "เวอร์ชันนี้ปิด sentence และทำหน้าที่ Link-Back ชัดขึ้น" : "The revision completes the sentence and makes the link-back function explicit.",
        studentAction: thai ? "ตรวจคำสุดท้ายของทุก Body: ต้องเป็นประโยคสมบูรณ์และตอบว่า result นี้พิสูจน์ Topic Sentence อย่างไร" : "Check the final sentence of each body paragraph: it must be complete and show how the result proves the topic sentence."
      });
    }
  }
  return output;
}

function promptFrameOverlap(prompt, sentence) {
  const promptTokens = contentTokens(String(prompt || "").split(/\n+/)[0]);
  if (!promptTokens.length) return 1;
  const sentenceTokens = new Set(contentTokens(sentence));
  return promptTokens.filter((token) => sentenceTokens.has(token)).length / promptTokens.length;
}

function buildPromptAnchoredParaphrase(prompt, fallback) {
  const statement = String(prompt || "").split(/\n+/).map((item) => item.trim()).find((item) => item && !/\?$/.test(item)) || String(prompt || "").split(/[?]/)[0].trim();
  if (!statement) return repairGenericSentence(fallback);
  const clean = statement.replace(/^(?:some people (?:think|believe|argue) that\s*)/i, "").replace(/[.!?]+$/g, "").trim();
  return `Some people argue that ${clean.charAt(0).toLowerCase()}${clean.slice(1)}.`;
}

function buildThesisRevision(safety, fallback) {
  const rawPosition = String(safety.routeAssessment?.position || safety.detectedPosition || "");
  const conclusionPosition = String(safety.conclusionPosition || safety.routeAssessment?.conclusionLabel || "");
  const position = /unclear|contradictory|absent/i.test(rawPosition) ? conclusionPosition : rawPosition;
  const stance = /strongly disagree/i.test(position) ? "I strongly disagree" : /disagree/i.test(position) ? "I disagree" : /strongly agree/i.test(position) ? "I strongly agree" : /agree/i.test(position) ? "I agree" : "I maintain the same position";
  const prompt = String(safety.prompt || safety.payload?.prompt || "");
  const routeText = (safety.routeAssessment?.bodyRoutes || []).map((route) => `${route.label || ""} ${route.controllingSentence || ""} ${route.evidence || ""}`).join(" ").toLowerCase();
  if (/clean water|water supply/i.test(`${prompt} ${routeText}`) && /free of charge|for free|without charg/i.test(`${prompt} ${routeText}`)) {
    return `${stance} that every home should receive a clean-water supply free of charge because access to safe water protects public health and reduces essential household costs.`;
  }
  const reasons = (safety.routeAssessment?.bodyRoutes || []).map((route) => normalizedRouteReason(route, route.controllingSentence || route.evidence || "")).slice(0, 2);
  if (!reasons.length || /maintain the same position/i.test(stance)) return repairGenericSentence(fallback);
  const clauses = reasons.map((reason) => `${reason.verb} ${reason.object}`);
  return `However, ${stance} because this arrangement could ${clauses.join(clauses.length > 1 ? " and " : "")}.`;
}

function buildTopicSentenceRevision(sentence, route, prompt) {
  const connector = /^\s*(first(?:ly)?|second(?:ly)?|furthermore|moreover|in addition|another reason),?/i.exec(sentence)?.[0]?.trim() || "";
  const reason = normalizedRouteReason(route, sentence);
  const subject = promptActionSubject(prompt);
  const core = `${subject} could ${reason.verb} ${reason.object}`;
  const renderedCore = connector ? core.charAt(0).toLowerCase() + core.slice(1) : core;
  return `${connector ? `${connector.replace(/,$/, "")}, ` : ""}${renderedCore}.`;
}

function buildExampleRevision(example, route, prompt) {
  const text = String(example || "");
  const lower = text.toLowerCase();
  if (/student/.test(lower) && /school/.test(lower)) {
    return "For example, students who live far from a centrally located school zone could face longer daily journeys, leaving them with less time and energy for study.";
  }
  if (/(?:shopping mall|shopper|restaurant)/.test(lower) && /(traffic|road|congestion|same direction)/.test(lower)) {
    return "For example, shoppers travelling to facilities concentrated in one district may use the same roads at similar times, increasing traffic congestion around that area.";
  }
  const groupMatch = text.match(/\b(?:students?|workers?|families|residents?|shoppers?|employees?|children|parents?|governments?|companies|households?|commuters?|citizens?|people)\b/i);
  const group = groupMatch?.[0]?.toLowerCase() || "the affected group";
  const reason = normalizedRouteReason(route, text);
  const action = promptActionSubject(prompt).replace(/^concentrating/i, "the proposed change involving");
  return `For example, ${group} affected by ${action} could experience ${reason.object} through the mechanism explained in the paragraph, producing a direct and realistic result.`;
}

function buildClosureRevision(sentence, route, prompt) {
  const reason = normalizedRouteReason(route, sentence);
  const arrangement = promptReferencePhrase(prompt);
  const affected = /\b(?:some residents|some people|students|workers|families|shoppers|commuters)\b/i.exec(sentence)?.[0] || "the affected group";
  const verb = /difficulties|pressure|problems/.test(reason.object) ? "face" : "experience";
  return `Therefore, ${arrangement} could cause ${affected.toLowerCase()} to ${verb} ${reason.object}.`;
}

function ensureBodyMechanismCoverage(cards, records, safety, payload) {
  const output = [...cards];
  const thai = String(payload.reportLanguage || "").toLowerCase() === "th";
  const routes = safety.routeAssessment?.bodyRoutes || [];
  for (const route of routes) {
    const paragraphIndex = route.index;
    const paragraphRecords = records.sentences.filter((item) => item.paragraphIndex === paragraphIndex);
    if (!paragraphRecords.length) continue;
    const exampleIndex = paragraphRecords.findIndex((item) => /^(for example|for instance|such as)\b/i.test(item.sentence));
    const candidate = paragraphRecords.find((item, index) => index > 0 && (exampleIndex < 0 || index < exampleIndex)) || paragraphRecords[1];
    const already = candidate && output.some((card) => normalize(card.exactSentence) === normalize(candidate.sentence));
    if (already) continue;
    const vagueCandidate = /\b(?:some|many|things?|places?|people|important|good|bad|in some period|this can cause|this may cause)\b/i.test(candidate?.sentence || "");
    const missingMechanism = vagueCandidate || (!route.explanationMechanism && paragraphRecords.length < 3);
    if (!candidate || !missingMechanism) continue;
    const revision = buildMechanismRevision(candidate.sentence, route.controllingSentence || route.evidence || "", payload.prompt);
    output.push({
    _integrityGenerated: true,
      issueType: thai ? THAI_COPY.mechanismTitle : `Body ${route.index} Explanation and Mechanism`,
      severity: "Moderate",
      criteria: ["Task Response", "Coherence & Cohesion"],
      framework: ["Explanation Depth", "LFC CPC Control", "Clear / Precise"],
      paragraphLocation: candidate.location,
      exactSentence: candidate.sentence,
      sentenceFunction: thai ? THAI_COPY.mechanismFunction : "This sentence is trying to explain the mechanism that connects the paragraph claim to its consequence.",
      whyItLimitsBand: thai ? THAI_COPY.mechanismLimit : "The explanation relies on vague nouns or skips a causal step, so the reader cannot yet see precisely how the paragraph claim produces the stated result.",
      kruPomDiagnosis: thai ? THAI_COPY.mechanismDiagnosis : "The paragraph route is visible, but the explanation should identify the affected group, the change or mechanism, and the resulting consequence in a controlled sequence.",
      targetedRevision: revision,
      revisionType: "Teacher-Guided Expansion",
      whyRevisionIsStronger: thai ? "เวอร์ชันนี้ทำให้ causal chain มองเห็นชัดขึ้นและติดป้าย Teacher-Guided Expansion เพราะมีการจัดกลไกใหม่เพื่อการสอน" : "The revision makes the causal chain explicit and is labelled Teacher-Guided Expansion because it reorganises the mechanism for teaching clarity.",
      studentAction: thai ? THAI_COPY.mechanismAction : "Rewrite the explanation as affected group -> mechanism or change -> consequence linked to the topic sentence."
    });
  }
  return output;
}

function ensureComparativeWeightingCoverage(cards, records, safety, payload) {
  const risk = safety.developmentRisk || {};
  const comparativeTask = /outweigh|advantages.*disadvantages|disadvantages.*advantages/i.test(`${safety.routeAssessment?.schema || ""} ${safety.routeAssessment?.position || ""}`);
  const needsWeighting = comparativeTask && (risk.unevenDevelopment || risk.thesisBodySeverityMismatch || risk.overloadedAdvantageRoute || risk.missingNationalBridge);
  if (!needsWeighting || cards.some((card) => /weighting|relative importance|outweigh/i.test(`${card.issueType} ${card.kruPomDiagnosis}`))) return cards;
  const output = [...cards];
  const thai = String(payload.reportLanguage || "").toLowerCase() === "th";
  const route = (safety.routeAssessment?.bodyRoutes || []).at(-1);
  const record = records.sentences.find((item) => normalize(item.sentence) === normalize(route?.linkBack || "")) ||
    records.sentences.find((item) => item.paragraphIndex === records.paragraphs.length - 1) ||
    records.sentences.find((item) => item.paragraphIndex === Number(route?.index || 2));
  if (!record) return output;
  const base = repairGenericSentence(record.sentence).replace(/[.!?]+$/g, "");
  output.push({
    _integrityGenerated: true,
    issueType: thai ? "การชั่งน้ำหนักระหว่างสองด้าน" : "Comparative Weighting and Evidence Scope",
    severity: "Moderate",
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Thesis Route Clarity", "Explanation Depth", "LFC CPC Control"],
    paragraphLocation: record.location,
    exactSentence: record.sentence,
    sentenceFunction: thai ? "ประโยคนี้กำลังสรุปว่าด้านใดมีน้ำหนักมากกว่า" : "This sentence is trying to explain why one side carries greater weight than the other.",
    whyItLimitsBand: thai ? "มี comparative judgement แล้ว แต่เหตุผลที่ทำให้ด้านหนึ่งสำคัญกว่ายังต้องเชื่อมกับขอบเขตผลกระทบและหลักฐานใน Body ให้ชัด" : "The comparative judgement is present, but the essay should make the basis of that weighting explicit and connect it to the scope of evidence developed in both body paragraphs.",
    kruPomDiagnosis: thai ? "รักษา outweigh judgement เดิม แล้วอธิบายเกณฑ์การชั่งน้ำหนัก เช่น ระยะเวลา ขอบเขตผู้ได้รับผล หรือความสำคัญระดับระบบ" : "Preserve the existing outweigh judgement and state the basis of comparison, such as duration, scale of impact or systemic importance.",
    targetedRevision: `${base}. This judgement is stronger when the essay explicitly explains why its wider or longer-term effects carry more weight than the competing concern.`,
    revisionType: "Teacher-Guided Expansion",
    whyRevisionIsStronger: thai ? "เวอร์ชันนี้ไม่เปลี่ยน judgement แต่เพิ่มเกณฑ์การชั่งน้ำหนักในฐานะ Teacher-Guided Expansion" : "The revision preserves the judgement and adds an explicit weighting criterion as Teacher-Guided Expansion.",
    studentAction: thai ? "ระบุหนึ่งเกณฑ์ชัดเจนที่ทำให้ด้านที่เลือกมีน้ำหนักมากกว่า แล้วให้หลักฐานใน Body รองรับเกณฑ์นั้น" : "State one clear criterion that makes the selected side more important, then ensure the body evidence supports that criterion."
  });
  return output;
}

function ensureLanguageCoverage(cards, records, safety, payload) {
  const output = [...cards];
  const thai = String(payload.reportLanguage || "").toLowerCase() === "th";
  const issuesBySentence = new Map();
  for (const issue of safety.languageProfile?.validatedIssues || []) {
    if (!issue.exactSentence) continue;
    const key = normalize(issue.exactSentence);
    const list = issuesBySentence.get(key) || [];
    list.push(issue);
    issuesBySentence.set(key, list);
  }
  const candidates = [...issuesBySentence.entries()]
    .map(([key, issues]) => ({ key, issues, weight: issues.reduce((sum, item) => sum + (item.classification === "clear-error" ? 2 : 1), 0) }))
    .sort((a, b) => b.weight - a.weight);
  for (const candidate of candidates) {
    if (output.length >= 10) break;
    if (output.some((card) => normalize(card.exactSentence) === candidate.key)) continue;
    const record = records.sentences.find((item) => normalize(item.sentence) === candidate.key);
    if (!record) continue;
    const categories = [...new Set(candidate.issues.map((item) => item.category))];
    output.push({
    _integrityGenerated: true,
      issueType: thai ? THAI_COPY.languageTitle : `Language Precision: ${categories.join(", ")}`,
      severity: candidate.weight >= 4 ? "Moderate" : "Minor Repair",
      criteria: [...new Set(candidate.issues.map((item) => item.criterion))],
      framework: ["Vocabulary Precision", "LFC CPC Control", "Clear / Precise"],
      paragraphLocation: record.location,
      exactSentence: record.sentence,
      sentenceFunction: thai ? THAI_COPY.languageFunction : "This sentence performs a paragraph function, but its language control reduces precision and readability.",
      whyItLimitsBand: candidate.issues.map((item) => item.explanation).filter(Boolean).join(" "),
      kruPomDiagnosis: thai ? `พบปัญหา ${categories.join(", ")} ในประโยคนี้ ซึ่งต้องแก้โดยรักษาความหมายและ route เดิม` : `The sentence contains validated ${categories.join(", ")} issues. Repair the language without changing its paragraph route or intended meaning.`,
      targetedRevision: repairGenericSentence(record.sentence),
      revisionType: "Route-Preserving Revision",
      whyRevisionIsStronger: thai ? "เวอร์ชันแก้ลดข้อผิดที่ตรวจพบและรักษาหน้าที่เดิมของประโยค" : "The revision removes the validated language errors while preserving the sentence's original function and direction of meaning.",
      studentAction: thai ? THAI_COPY.languageAction : "Correct the diagnosed error pattern, then scan the full response for the same pattern without changing the stance or central reason."
    });
  }
  return output;
}

function ensureConclusionCoverage(cards, records, safety, payload, integrity) {
  if (!integrity.present || integrity.status === "Strong") return cards;
  const output = [...cards];
  const record = records.sentences.find((item) => normalize(item.sentence) === normalize(integrity.exactSentence));
  if (!record) return output;
  const existingIndex = output.findIndex((card) => normalize(card.exactSentence) === normalize(record.sentence));
  const thai = String(payload.reportLanguage || "").toLowerCase() === "th";
  const conclusionCard = {
    _integrityGenerated: true,
    issueType: thai ? THAI_COPY.conclusionTitle : "Conclusion Precision and Route Closure",
    severity: integrity.status === "Needs Work" ? "Major" : "Moderate",
    criteria: ["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"],
    framework: ["Conclusion Closure", "LFC CPC Control", "Clear / Precise"],
    paragraphLocation: record.location,
    exactSentence: record.sentence,
    sentenceFunction: thai ? THAI_COPY.conclusionFunction : "This conclusion is trying to restate the position or task route developed in the essay.",
    whyItLimitsBand: thai ? THAI_COPY.conclusionLimit : `The conclusion does not close the route securely: ${integrity.reasons.join("; ")}.`,
    kruPomDiagnosis: thai ? THAI_COPY.conclusionDiagnosis : "The conclusion must preserve the same position, use prompt-accurate reference, and close the established body routes in one controlled sentence without adding a new premise.",
    targetedRevision: buildConclusionRevision(payload, safety),
    revisionType: "Route-Preserving Revision",
    whyRevisionIsStronger: thai ? "เวอร์ชันนี้ใช้จุดยืนและ route เดิมจาก Thesis กับ Body พร้อมลด policy-reference และ clause-control error" : "The revision uses the same position and body routes while repairing policy reference and clause control without introducing a different argument.",
    studentAction: thai ? THAI_COPY.conclusionAction : "Write one complete conclusion sentence that restates the same position and body routes using prompt-accurate terminology."
  };
  if (existingIndex >= 0) output[existingIndex] = conclusionCard;
  else output.push(conclusionCard);
  return output;
}

function calibrateCriteria(input, safety, conclusionIntegrity) {
  const scores = structuredCloneSafe(input);
  if (safety.criticalInteraction) {
    setRange(scores, "Task Response", "4.0");
    return scores;
  }
  if (safety.seriousInteraction) {
    const current = parseRange(scores["Task Response"]?.range || scores["Task Response"]);
    if (!current || current.high > 5.0) setRange(scores, "Task Response", "4.5-5.0");
    return scores;
  }
  const bodyModerate = (safety.developmentRisk?.bodyDevelopment || []).filter((item) => /moderate|partially/i.test(item.status || item.developmentStatus || "")).length;
  const grammarIssues = Number(safety.languageProfile?.grammarIssueCount || 0);
  const grammarParagraphs = new Set((safety.languageProfile?.validatedIssues || []).filter((item) => item.criterion === "Grammatical Range & Accuracy").map((item) => item.paragraphIndex)).size;
  const lexicalIssues = Number(safety.languageProfile?.lexicalIssueCount || 0);
  const currentTR = scores["Task Response"]?.range || "6.5";
  const currentCC = scores["Coherence & Cohesion"]?.range || "6.0-6.5";
  const currentLR = scores["Lexical Resource"]?.range || "6.0-6.5";
  const currentGRA = scores["Grammatical Range & Accuracy"]?.range || "6.0-6.5";
  setRange(scores, "Task Response", bodyModerate >= 2 && conclusionIntegrity.status !== "Strong" ? "6.0-6.5" : currentTR);
  setRange(scores, "Coherence & Cohesion", safety.languageProfile?.sentenceCompletionErrors?.length ? "6.0" : conclusionIntegrity.status === "Needs Work" ? "6.0" : currentCC);
  setRange(scores, "Lexical Resource", lexicalIssues >= 12 ? "6.0" : currentLR);
  setRange(scores, "Grammatical Range & Accuracy", grammarIssues >= 7 && grammarParagraphs >= 4 ? "5.5-6.0" : grammarIssues >= 5 || safety.languageProfile?.sentenceCompletionErrors?.length ? "6.0" : grammarIssues >= 3 ? "6.0-6.5" : currentGRA);
  return scores;
}

function calibrateFramework(input, safety, conclusionIntegrity, language) {
  const thai = String(language || "").toLowerCase() === "th";
  const output = structuredCloneSafe(input);
  const bodyRoutes = safety.routeAssessment?.bodyRoutes || [];
  output["Position Clarity"] = output["Position Clarity"] || { status: safety.positionConfidence === "high" ? "Strong" : "Needs Work", diagnosis: "" };
  output["Thesis Route Clarity"] = output["Thesis Route Clarity"] || { status: /adequately_developed/.test(safety.routeAssessment?.thesisRouteStatus || "") ? "Strong" : "Moderate", diagnosis: "" };
  output["Body Paragraph Route Alignment"] = {
    ...(output["Body Paragraph Route Alignment"] || {}),
    status: safety.routeConflict ? "Needs Work" : bodyRoutes.every((item) => /adequately_developed/.test(item.alignmentStatus || item.status || "")) ? "Strong" : "Moderate",
    diagnosis: bodyRoutes.map((item) => `Body ${item.index}: ${item.label}`).join(" | ")
  };
  output["Explanation Depth"] = { ...(output["Explanation Depth"] || {}), status: safety.developmentRisk?.hasModerateDevelopment ? "Moderate" : "Strong" };
  output["SAR Example Quality"] = { ...(output["SAR Example Quality"] || {}), status: safety.developmentRisk?.hasModerateDevelopment ? "Moderate" : "Strong" };
  output["Link Back Control"] = { ...(output["Link Back Control"] || {}), status: safety.languageProfile?.sentenceCompletionErrors?.length || bodyRoutes.some((item) => !item.linkBack) ? "Moderate" : "Strong" };
  output["Conclusion Closure"] = {
    status: conclusionIntegrity.status,
    diagnosis: conclusionIntegrity.status === "Strong"
      ? (thai ? "Conclusion รักษาจุดยืนและปิด route เดิมได้ครบในประโยคที่ควบคุมได้" : "The conclusion preserves the position and closes the established route in a controlled sentence.")
      : (thai ? `Conclusion ยังต้องซ่อม: ${conclusionIntegrity.reasons.join("; ")}` : `The conclusion still needs repair: ${conclusionIntegrity.reasons.join("; ")}.`)
  };
  output["LFC CPC Control"] = { ...(output["LFC CPC Control"] || {}), status: safety.languageAccuracyRisk?.blocksSecureBand7 ? "Moderate" : "Strong" };
  return output;
}

function buildExecutiveSummary({ analysis, safety, conclusionIntegrity, payload }) {
  const thai = String(payload.reportLanguage || "").toLowerCase() === "th";
  if (safety.criticalInteraction || safety.seriousInteraction) {
    return {
      mainScoreLimitingFactor: analysis.mainScoreLimitingFactor || safety.criticalInteractionSummary || "The response is incomplete and its task route is not yet controlled.",
      mostUrgentRepair: analysis.mostUrgentRepair || "Complete the response, establish the required route, and finish the conclusion before refining language."
    };
  }
  const bodyModerate = (safety.developmentRisk?.bodyDevelopment || []).filter((item) => /moderate|partially/i.test(item.status || item.developmentStatus || "")).length;
  const essayType = String(safety.canonicalAnalysis?.metadata?.essayType || "").toLowerCase();
  if (essayType !== "opinion" && analysis.mainScoreLimitingFactor && analysis.mostUrgentRepair) {
    return { mainScoreLimitingFactor: analysis.mainScoreLimitingFactor, mostUrgentRepair: analysis.mostUrgentRepair };
  }
  if (thai) {
    return {
      mainScoreLimitingFactor: `งานมี route หลักที่มองเห็นได้ แต่ ${bodyModerate || "บาง"} Body ยังอธิบายกลไกและตัวอย่างไม่แม่นพอ${conclusionIntegrity.status !== "Strong" ? " และ Conclusion ยังปิด policy/route ได้ไม่สมบูรณ์" : ""} ขณะเดียวกัน lexical และ grammar error ที่เกิดซ้ำยังขัดขวาง Band 7 ที่มั่นคง`,
      mostUrgentRepair: `คง route ที่ถูกต้องไว้ แล้วซ่อม Explanation ของแต่ละ Body ให้ครบ affected group -> mechanism -> result ปรับตัวอย่างให้สมเหตุสมผล และเขียน Conclusion ให้ใช้จุดยืนกับเหตุผลเดิมอย่างแม่นยำก่อนตรวจภาษาเต็มทั้งงาน`
    };
  }
  return {
    mainScoreLimitingFactor: `The main route is visible, but ${bodyModerate || "some"} body paragraph${bodyModerate === 1 ? "" : "s"} still lack precise causal development${conclusionIntegrity.status !== "Strong" ? ", and the conclusion does not yet close the policy and route securely" : ""}. Recurring lexical and grammatical errors also prevent a secure Band 7 profile.`,
    mostUrgentRepair: "Keep the valid task route. Rebuild each weak explanation as affected group -> mechanism -> result, make examples credible, close the same route in the conclusion, and then complete a full language edit."
  };
}

function buildGenericTopIssues(cards, safety, conclusionIntegrity, language) {
  const ranked = [...cards].sort((a, b) => topIssuePriority(b) - topIssuePriority(a));
  const selected = [];
  const seenCategory = new Set();
  for (const card of ranked) {
    const category = issueCategory(card);
    if (seenCategory.has(category)) continue;
    seenCategory.add(category);
    const evidenceSentence = topEvidenceSentence(card.exactSentence);
    selected.push({
      issueType: card.issueType,
      title: card.issueType,
      severity: card.severity || "Moderate",
      criteria: [...new Set(card.criteria || [])],
      framework: [...new Set(card.framework || [])],
      scope: /–|\bSentence \d+[-–]\d+/.test(String(card.paragraphLocation || "")) ? "multi-location" : "single-location",
      paragraphLocations: [card.paragraphLocation],
      evidenceItems: [{ paragraphLocation: card.paragraphLocation, exactSentence: evidenceSentence, evidenceRole: card.issueType }],
      exactSentence: evidenceSentence,
      paragraphLocation: card.paragraphLocation,
      diagnosis: card.whyItLimitsBand,
      whyItLimitsBand: card.whyItLimitsBand,
      studentAction: card.studentAction
    });
    if (selected.length >= 3) break;
  }
  return selected;
}

function topIssuePriority(card) {
  const severity = /critical/i.test(card.severity || "") ? 60 : /major/i.test(card.severity || "") ? 45 : /moderate/i.test(card.severity || "") ? 30 : 12;
  const text = `${card.issueType || ""} ${(card.criteria || []).join(" ")} ${(card.framework || []).join(" ")}`;
  let scope = 0;
  if (/weighting|development|mechanism|example/i.test(text)) scope += 18;
  if (/thesis|route|prompt coverage/i.test(text)) scope += 16;
  if (/grammar and punctuation|grammatical and sentence control|full-response grammatical/i.test(text)) scope += 17;
  else if (/grammar|grammatical|punctuation|reference/i.test(text)) scope += 10;
  if (/lexical|vocabulary|collocation|word form/i.test(text)) scope += 9;
  if (/conclusion|closure/i.test(text)) scope += 12;
  if (/full-response|multi-location|Sentence \d+[-–]\d+/i.test(`${text} ${card.paragraphLocation || ""}`)) scope += 5;
  return severity + scope;
}

function topEvidenceSentence(value) {
  const text = String(value || "").trim();
  const parts = text.split(/(?<=[.!?])(?=[A-Z])/).map((item) => item.trim()).filter(Boolean);
  return parts[0] || text;
}

function issueCategory(card) {
  const label = normalize(`${card.issueType || ""} ${(card.framework || []).join(" ")}`);
  const text = normalize(`${label} ${(card.criteria || []).join(" ")}`);
  if (/meaning reversing|meaning changing|semantic reversal/.test(label)) return "meaning";
  if (/thesis|route|prompt coverage|topic sentence|position clarity/.test(label)) return "route";
  if (/conclusion|completion integrity|closure|link back/.test(label)) return "closure";
  if (/grammar|punctuation|sentence control|article|tense|clause|reference control/.test(label)) return "grammar";
  if (/lexical|vocabulary|collocation|word form|countability|precision/.test(label)) return "vocabulary";
  if (/example|explanation|mechanism|development|weighting|outweigh/.test(text)) return "development";
  return normalize(card.issueType || "issue");
}

function buildParagraphFeedback(records, cards, language) {
  const thai = String(language || "").toLowerCase() === "th";
  return records.paragraphs.map((paragraph, paragraphIndex) => {
    const name = paragraphIndex === 0 ? "Introduction" : paragraphIndex === records.paragraphs.length - 1 ? "Conclusion" : `Body Paragraph ${paragraphIndex}`;
    const relevant = cards.filter((card) => card.paragraphLocation.startsWith(name));
    return {
      paragraphLocation: name,
      exactEvidence: relevant[0]?.exactSentence || splitSentences(paragraph)[0] || paragraph,
      diagnosis: relevant.length ? relevant.map((item) => item.kruPomDiagnosis).join(" ") : (thai ? "ย่อหน้านี้ทำหน้าที่พื้นฐานได้ แต่ควรตรวจความชัดของ route และความแม่นยำของภาษา" : "This paragraph performs its basic function, but its route and language precision should still be checked."),
      action: relevant.length ? relevant.map((item) => item.studentAction).join(" ") : (thai ? "ตรวจ Topic Sentence, Explanation, Evidence และ Link-Back ให้ทำหน้าที่สอดคล้องกัน" : "Check that the topic sentence, explanation, evidence and link-back perform a consistent function.")
    };
  });
}

function buildRepairPlan(cards, safety, conclusionIntegrity, language, existing = []) {
  const thai = String(language || "").toLowerCase() === "th";
  const plan = thai ? [
    ["ซ่อม Route Map", "เขียนหน้าที่ของ Introduction, Body แต่ละย่อหน้า และ Conclusion เป็นหนึ่งบรรทัด แล้วตรวจว่าทุกส่วนตอบโจทย์ประเภทเดียวกัน"],
    ["ซ่อมกลไกเหตุและผล", "เขียน Explanation ของแต่ละ Body ใหม่เป็น ผู้ได้รับผล -> กลไกหรือการเปลี่ยนแปลง -> ผลลัพธ์"],
    ["ยกระดับตัวอย่าง", "ปรับตัวอย่างทุก Body ให้สมเหตุสมผล ระบุ situation, mechanism และ result โดยไม่ใช้ผลสุดโต่งที่ไม่มีหลักรองรับ"],
    ["ตรวจคำศัพท์และ Collocation", "แทนคำนามกว้างด้วยคำเฉพาะของหัวข้อ แล้วตรวจ word form, countability, noun reference และ collocation"],
    ["ตรวจ Grammar และ Sentence Ending", "ตรวจ tense, article, preposition, agreement, clause control, punctuation และประโยคที่จบไม่สมบูรณ์"],
    ["ซ่อม Conclusion", "เขียน Conclusion ให้ restate จุดยืนหรือ task route เดิม พร้อมเหตุผลเดิมจาก Body และไม่เพิ่ม premise ใหม่"],
    ["เขียนใหม่และ Proofread", "เขียนงานใหม่ทั้งชิ้น ตรวจ Thesis-to-Body route, paragraph matching, development และ language control รอบสุดท้าย"]
  ] : [
    ["Map the task route", "Write the function of the introduction, each body paragraph and the conclusion in one line, then verify that every section serves the same task family."],
    ["Repair causal mechanisms", "Rewrite each body explanation as affected group -> mechanism or change -> consequence."],
    ["Upgrade examples", "Make every body example credible and explicit about situation, mechanism and result without unsupported extreme outcomes."],
    ["Edit lexical precision", "Replace vague nouns with topic-specific language and check word form, countability, noun reference and collocation."],
    ["Control grammar and endings", "Check tense, articles, prepositions, agreement, clause control, punctuation and incomplete sentence endings."],
    ["Repair conclusion closure", "Restate the same position or task route and the same body reasons without adding a new premise."],
    ["Rewrite and proofread", "Rewrite the full response, verify thesis-to-body matching, and complete a final development and language audit."]
  ];
  return plan.map(([title, task], index) => ({ day: index + 1, title, task }));
}

function buildMechanismRevision(sentence, topicSentence, prompt = "") {
  const combined = `${sentence} ${topicSentence}`.toLowerCase();
  if (/traffic|congestion|road|vehicle/.test(combined)) {
    return "During busy periods, concentrating destinations in one area could direct more travellers onto the same roads, increasing traffic congestion around that district.";
  }
  if (/travel|commut|journey|distance|access/.test(combined)) {
    return "Residents living in different parts of the city could have to travel farther to reach facilities concentrated in one area, creating travel difficulties.";
  }
  const subject = extractSubjectPhrase(topicSentence) || "the group affected by this change";
  const result = extractReasonPhrase(topicSentence) || "the paragraph's stated consequence";
  return `${capitalize(subject)} would be affected because ${promptReferencePhrase(prompt)} would change the relevant access, behaviour or condition, leading directly to ${result}.`;
}

function buildConclusionRevision(payload, safety) {
  const position = String(safety.routeAssessment?.position || safety.detectedPosition || "").toLowerCase();
  const policy = conclusionPolicyClause(payload.prompt, position);
  const routeReasons = (safety.routeAssessment?.bodyRoutes || []).map((item) => normalizedRouteReason(item, item.controllingSentence || item.evidence || ""));
  const reasonClauses = routeReasons.slice(0, 2).map((reason) => `${reason.verb} ${reason.object}`);
  if (safety.stanceRequired) {
    const stance = /strongly disagree/.test(position) ? "I strongly disagree" : /disagree/.test(position) ? "I disagree" : /strongly agree/.test(position) ? "I strongly agree" : /agree/.test(position) ? "I agree" : "I maintain the same position";
    const because = reasonClauses.length ? reasonClauses.join(reasonClauses.length > 1 ? " and " : "") : "produce the consequences developed in the body paragraphs";
    return `In conclusion, ${stance} that ${policy}, because this could ${because}.`;
  }
  const labels = (safety.routeAssessment?.bodyRoutes || []).map((item) => item.label).filter(Boolean).slice(0, 2);
  return `In conclusion, the response should summarise ${labels.join(" and ") || "the same required routes developed in the body paragraphs"}.`;
}

function repairGenericSentence(value) {
  let text = String(value || "").trim();
  text = text
    .replace(/\bthe clusterization of a specific place\b/gi, "concentrating the relevant facilities or services")
    .replace(/\bclusterization\b/gi, "concentration")
    .replace(/\bspecific places like towns and cities\b/gi, "urban areas")
    .replace(/\ball the same places\b/gi, "facilities or services of the same type")
    .replace(/\ba specific place\b/gi, "a relevant facility or service")
    .replace(/\ba certain place\b/gi, "a relevant facility or service")
    .replace(/\bthe difficulty of traveling\b/gi, "travel difficulties")
    .replace(/\ban issue of traveling\b/gi, "travel difficulties")
    .replace(/\btravel through long distance\b/gi, "travel long distances")
    .replace(/\ba large traffic congestion\b/gi, "heavy traffic congestion")
    .replace(/\bthe congestion of traffic\b/gi, "traffic congestion")
    .replace(/\bin some period of time\b/gi, "during busy periods")
    .replace(/\bEvery family is living\b/g, "Families live")
    .replace(/\bplaces and distances\b/gi, "parts of the city")
    .replace(/\b5AM\b/g, "5 a.m.")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/g, ".")
    .replace(/;\s*(Therefore|However|Moreover|Furthermore|Hence)\b/g, ". $1")
    .trim();
  if (text && !/[.!?][\"')\]]?$/.test(text)) text += ".";
  return text;
}


function normalizedRouteReason(route, fallback = "") {
  const text = `${route?.label || ""} ${route?.controllingSentence || ""} ${route?.evidence || ""} ${fallback}`.toLowerCase();
  if (/traffic|congestion|road|vehicle/.test(text)) return { verb: "increase", object: "traffic congestion" };
  if (/travel|commut|journey|distance|access/.test(text)) return { verb: "create", object: "travel difficulties" };
  if (/cost|expense|financial|money|tax/.test(text)) return { verb: "increase", object: "financial pressure" };
  if (/health|medical|disease|illness/.test(text)) return { verb: "create", object: "health-related difficulties" };
  if (/environment|pollution|emission|climate/.test(text)) return { verb: "worsen", object: "environmental problems" };
  if (/education|school|student|learn|study/.test(text)) return { verb: "affect", object: "educational outcomes" };
  const extracted = extractReasonPhrase(route?.controllingSentence || route?.evidence || fallback);
  return { verb: "produce", object: extracted || "the paragraph's stated consequence" };
}

function promptActionSubject(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  if (/zones?|zoning|schools?|shopping malls?|industrial sites?|facilit/.test(text)) return "Concentrating facilities or services of the same type in one designated area";
  if (/ban|prohibit|forbid/.test(text)) return "Applying the proposed restriction";
  if (/government|policy|law|regulation/.test(text)) return "Implementing the proposed policy";
  return "The proposed arrangement";
}

function promptReferencePhrase(prompt = "") {
  const subject = promptActionSubject(prompt);
  return subject === "The proposed arrangement" ? "this arrangement" : subject.charAt(0).toLowerCase() + subject.slice(1);
}

function conclusionPolicyClause(prompt = "", position = "") {
  const text = String(prompt || "");
  const lower = text.toLowerCase();
  if (/(?:towns?|cities|urban areas?).*(?:zones?|zoning)|(?:zones?|zoning).*(?:towns?|cities|urban areas?)/is.test(lower)) {
    return "urban areas should be divided into separate zones for different types of facilities";
  }
  const statement = text.split(/\n+/).map((item) => item.trim()).find((item) => item && !/\?$/.test(item)) || text.split(/[?]/)[0].trim();
  const clean = statement.replace(/^(?:some people (?:think|believe|argue) that\s*)/i, "").replace(/[.!?]+$/g, "").trim();
  if (!clean) return negative ? "the proposal should not be adopted" : "the proposal should be adopted";
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

function routeConcepts(value) {
  const text = String(value || "").toLowerCase();
  return [
    [/\b(?:travel|travell|commut|journey|access|distance|difficult)\w*\b/, "access-travel"],
    [/\b(?:traffic|congestion|road|vehicle|car)\w*\b/, "traffic"],
    [/\b(?:cost|budget|tax|money|financial|expense)\w*\b/, "cost"],
    [/\b(?:health|hospital|disease|illness|medical)\w*\b/, "health"],
    [/\b(?:education|school|student|learn|study)\w*\b/, "education"],
    [/\b(?:environment|climate|pollution|emission)\w*\b/, "environment"]
  ].filter(([pattern]) => pattern.test(text)).map(([, concept]) => concept);
}

function cardSpecificity(card) {
  const text = normalize(`${card?.issueType || ""} ${card?.sentenceFunction || ""}`);
  let score = card?._integrityGenerated ? 2 : 0;
  if (/introduction|thesis|topic sentence|example|explanation|mechanism|closure|conclusion|link back|ตัวอย่าง|กลไก|ปิด|บทสรุป|วิทยานิพนธ์/.test(text)) score += 3;
  if ((card?.framework || []).length >= 2) score += 1;
  if ((card?.criteria || []).length >= 2) score += 1;
  return score;
}

function detectNegationContradiction(conclusion, prompt) {
  const clauses = String(conclusion || "").split(/\b(?:thus|therefore|hence|so|as a result)\b/i).map((item) => item.trim()).filter(Boolean);
  if (clauses.length < 2) return false;
  const firstNegative = /\b(?:not|disagree|oppose|reject|against)\b/i.test(clauses[0]);
  const secondNegative = /\b(?:not|disagree|oppose|reject|against)\b/i.test(clauses.slice(1).join(" "));
  if (!firstNegative || secondNegative) return false;
  const promptTokens = contentTokens(prompt);
  const secondTokens = contentTokens(clauses.slice(1).join(" "));
  const overlap = secondTokens.filter((token) => promptTokens.includes(token)).length;
  return overlap >= 2;
}

function setRange(scores, name, range) {
  const current = scores[name];
  scores[name] = typeof current === "object" && current ? { ...current, range } : { range, diagnosis: "", evidence: "" };
}

function deriveOverallRange(scores) {
  const ranges = ["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"].map((name) => parseRange(scores[name]?.range || scores[name]));
  if (ranges.some((item) => !item)) return "";
  const low = roundHalf(ranges.reduce((sum, item) => sum + item.low, 0) / 4);
  const high = roundHalf(ranges.reduce((sum, item) => sum + item.high, 0) / 4);
  return low === high ? low.toFixed(1) : `${low.toFixed(1)}-${high.toFixed(1)}`;
}

function parseRange(value) {
  const numbers = String(value || "").replace(/[–—−]/g, "-").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return numbers.length ? { low: numbers[0], high: numbers[1] ?? numbers[0] } : null;
}

function roundHalf(value) { return Math.round(value * 2) / 2; }
function structuredCloneSafe(value) { return JSON.parse(JSON.stringify(value || {})); }
function evidenceFound(exact, records) {
  const target = normalize(exact);
  if (records.sentences.some((item) => normalize(item.sentence) === target)) return true;
  for (let index = 0; index < records.sentences.length - 1; index += 1) {
    const first = records.sentences[index];
    const second = records.sentences[index + 1];
    if (first.paragraphIndex === second.paragraphIndex && normalize(`${first.sentence}${second.sentence}`) === target) return true;
  }
  return false;
}
function recordOrder(card, records) { const index = records.sentences.findIndex((item) => normalize(item.sentence) === normalize(card.exactSentence)); return index < 0 ? Number.MAX_SAFE_INTEGER : index; }
function dedupeCards(cards) { const seen = new Set(); return cards.filter((card) => { const key = `${normalize(card.exactSentence)}|${normalize(card.issueType)}`; if (!key.replace(/\|/g, "") || seen.has(key)) return false; seen.add(key); return true; }); }
function splitSentences(paragraph) { return String(paragraph || "").replace(/\s+/g, " ").trim().match(/[^.!?]+(?:[.!?]+|$)/g)?.map((item) => item.trim()).filter(Boolean) || []; }
function paragraphLocation(paragraphIndex, count, sentenceIndex) { if (paragraphIndex === 0) return `Introduction, Sentence ${sentenceIndex + 1}`; if (paragraphIndex === count - 1) return `Conclusion, Sentence ${sentenceIndex + 1}`; return `Body Paragraph ${paragraphIndex}, Sentence ${sentenceIndex + 1}`; }
function normalize(value) { return String(value || "").normalize("NFKC").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9ก-๙%]+/gu, " ").replace(/\s+/g, " ").trim(); }
function contentTokens(value) { return [...new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !STOPWORDS.has(token)))]; }
function tokenOverlap(left, right) { const a = contentTokens(left); const b = new Set(contentTokens(right)); if (!a.length) return 0; return a.filter((token) => b.has(token)).length / a.length; }
function similarity(left, right) { const a = new Set(contentTokens(left)); const b = new Set(contentTokens(right)); const intersection = [...a].filter((token) => b.has(token)).length; const union = new Set([...a, ...b]).size; return union ? intersection / union : 0; }
function extractReasonPhrase(sentence) { const text = repairGenericSentence(sentence).replace(/[.!?]+$/g, ""); const patterns = [/\blead to\s+(.+)$/i, /\bresult in\s+(.+)$/i, /\bcause\s+(.+)$/i, /\bcreate\s+(.+)$/i, /\bmore\s+(.+?)\s+when\b/i, /\bdue to\s+(.+)$/i, /\bbecause\s+(.+)$/i]; for (const pattern of patterns) { const match = text.match(pattern); if (match?.[1]) return match[1].replace(/^(the|a|an)\s+/i, "").trim(); } const tokens = contentTokens(text).slice(-4); return tokens.length ? tokens.join(" ") : ""; }
function extractSubjectPhrase(sentence) { const clean = String(sentence || "").replace(/^(first(?:ly)?|second(?:ly)?|furthermore|moreover|however),?\s*/i, ""); const match = clean.match(/^(.+?)\s+(?:could|would|may|might|can|will|is|are|leads?|causes?|creates?)\b/i); return match?.[1]?.trim() || ""; }
function capitalize(value) { const text = String(value || ""); return text ? text[0].toUpperCase() + text.slice(1) : text; }
