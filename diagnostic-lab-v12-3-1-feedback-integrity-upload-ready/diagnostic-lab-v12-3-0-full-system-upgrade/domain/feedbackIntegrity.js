import { segmentStudentResponse } from "./paragraphEvidence.js";

export const SENTENCE_ROLES = Object.freeze([
  "introduction_background",
  "introduction_paraphrase",
  "thesis",
  "overview",
  "body_topic_sentence",
  "explanation",
  "example",
  "comparison",
  "data_sentence",
  "process_stage",
  "map_change_sentence",
  "link_back",
  "paragraph_closing_sentence",
  "conclusion_position",
  "conclusion_summary",
  "conclusion_new_idea",
  "fragment",
  "unknown"
]);

export const ISSUE_TAXONOMY = Object.freeze([
  "Position Clarity", "Thesis Route Clarity", "Prompt Coverage", "Body Route Alignment",
  "Explanation Depth", "Example Development", "SAR Example Quality", "Link Back Control",
  "Paragraph Unity", "Conclusion Closure", "Meaning Control", "Visual Understanding",
  "Overview Quality", "Overview Accuracy", "Data Selection", "Data Accuracy", "Grouping Logic",
  "Comparison Precision", "Objective Reporting", "Process Sequence", "Process Endpoint",
  "Map Change Accuracy", "Magnitude Precision", "Lexical Precision", "Collocation", "Word Form",
  "Reference Control", "Countability", "Article Control", "Preposition Control",
  "Grammar and Sentence Control", "Punctuation", "Sentence Completion", "Academic Tone", "Concision"
]);

export const REPAIR_TARGETS = Object.freeze([
  "grammar", "punctuation", "collocation", "word form", "reference", "countability", "article", "preposition",
  "sentence completeness", "topic-sentence clarity", "task wording", "policy wording",
  "data accuracy", "comparison accuracy", "overview accuracy", "mechanism", "explanation depth",
  "example specificity", "SAR completeness", "scope", "affected group", "consequence",
  "link-back", "conclusion closure", "paragraph unity", "prompt coverage"
]);

const SENTENCE_COMPLETE = /[.!?]["')\]]*$/u;
const CONCLUSION_MARKER = /^(?:in conclusion|to conclude|to sum up|in summary|overall)\b/i;
const EXAMPLE_MARKER = /^(?:for example|for instance|as an example|to illustrate)\b/i;
const RESULT_MARKER = /\b(?:so|therefore|thus|hence|as a result|consequently|this means|which (?:means|causes|leads)|resulting in|leads? to|raises?|increases?|reduces?|improves?)\b/i;
const CAUSE_MARKER = /\b(?:because|since|when|due to|as a result of|thereby|helping|enabling|allowing|which (?:causes|means|allows|prevents)|leads? to|results? in)\b/i;
const COMPARISON_MARKER = /\b(?:whereas|while|compared with|in contrast|by contrast|higher|lower|more than|less than|respectively)\b/i;
const DATA_MARKER = /(?:\b\d+(?:[.,]\d+)?%?\b|\b(?:percent|percentage|million|billion|tonnes?|kilograms?|years?|minutes?)\b)/i;
const PROCESS_MARKER = /\b(?:first|next|then|subsequently|afterwards|finally|stage|step|is (?:heated|mixed|transported|processed|collected|stored|converted))\b/i;
const MAP_MARKER = /\b(?:built|constructed|demolished|removed|replaced|converted|expanded|relocated|redeveloped|unchanged)\b/i;

export function buildFeedbackIntegrityModel({
  writing = "",
  taskType = "Task 2",
  visualType = "",
  feedbackCards = [],
  topIssues = [],
  paragraphFeedback = [],
  mainScoreLimitingFactor = "",
  mostUrgentRepair = ""
} = {}) {
  const paragraphs = segmentStudentResponse(writing, taskType);
  const records = paragraphs.flatMap((paragraph) => paragraph.sentences.map((sentence, sentenceIndex) => ({
    ...sentence,
    paragraphRole: paragraph.role,
    paragraphNumber: paragraph.paragraphNumber,
    paragraphSentenceCount: paragraph.sentences.length,
    sentenceIndex,
    paragraphText: paragraph.exactText,
    previousSentence: paragraph.sentences[sentenceIndex - 1]?.exactText || "",
    nextSentence: paragraph.sentences[sentenceIndex + 1]?.exactText || ""
  })));
  const canonicalIssues = (Array.isArray(feedbackCards) ? feedbackCards : [])
    .map((card, index) => canonicalizeIssue(card, index, { writing, taskType, visualType, paragraphs, records }))
    .filter(Boolean);
  const topIssueIds = selectCanonicalTopIssueIds(topIssues, canonicalIssues, taskType);
  const canonicalTopIssues = topIssueIds
    .map((issueId) => canonicalIssues.find((issue) => issue.issueId === issueId))
    .filter(Boolean)
    .map((issue) => projectTopIssue(issue));
  const paragraphCoverage = buildParagraphCoverage({ paragraphs, canonicalIssues, paragraphFeedback, taskType });
  const majorIds = canonicalIssues
    .filter((issue) => ["Critical", "Major", "Serious", "Moderate"].includes(issue.severity))
    .map((issue) => issue.issueId);
  const summaryIssueIds = (majorIds.length ? majorIds : topIssueIds).slice(0, 3);
  const urgentRepairIssueIds = (majorIds.length ? majorIds : topIssueIds).slice(0, 2);
  const conclusionFunction = assessConclusionFunction(paragraphs, taskType);
  return {
    issues: canonicalIssues,
    topIssues: canonicalTopIssues,
    paragraphCoverage,
    conclusionFunction,
    linkage: {
      summaryIssueIds,
      urgentRepairIssueIds,
      topIssueIds,
      detailedIssueIds: canonicalIssues.map((issue) => issue.issueId),
      mainScoreLimitingFactor: String(mainScoreLimitingFactor || ""),
      mostUrgentRepair: String(mostUrgentRepair || "")
    }
  };
}

export function detectSentenceRole({
  taskType = "Task 2",
  visualType = "",
  paragraphRole = "",
  sentenceIndex = 0,
  sentenceCount = 1,
  sentence = "",
  previousSentence = ""
} = {}) {
  const text = String(sentence || "").trim();
  const role = String(paragraphRole || "");
  const finalSentence = sentenceIndex === Math.max(0, sentenceCount - 1);
  if (!text) return "unknown";
  if (!SENTENCE_COMPLETE.test(text) && wordCount(text) < 6) return "fragment";

  if (/^Introduction$/i.test(role)) {
    if (/\b(?:i (?:strongly |firmly |partly |partially )?(?:agree|disagree|believe)|this essay (?:argues|will)|the following (?:report|essay)|while .+ i (?:believe|argue))\b/i.test(text)) return "thesis";
    return sentenceIndex === 0 ? "introduction_paraphrase" : "introduction_background";
  }
  if (/^Overview$/i.test(role)) return "overview";
  if (/^Task 1 Conclusion$/i.test(role)) return CONCLUSION_MARKER.test(text) ? "conclusion_summary" : "unknown";
  if (/^Conclusion$/i.test(role)) {
    if (sentenceIndex > 0 && introducesConclusionNewIdea(text, previousSentence)) return "conclusion_new_idea";
    if (/\b(?:agree|disagree|believe|support|oppose|outweigh|positive|negative)\b/i.test(text)) return "conclusion_position";
    return "conclusion_summary";
  }
  if (/^Body Paragraph/i.test(role)) {
    if (sentenceIndex === 0) return "body_topic_sentence";
    if (EXAMPLE_MARKER.test(text)) return "example";
    if (taskType === "Task 1") {
      if (/map|plan/i.test(visualType) && MAP_MARKER.test(text)) return "map_change_sentence";
      if (/process|diagram|cycle|mechanism/i.test(visualType) && PROCESS_MARKER.test(text)) return "process_stage";
      if (COMPARISON_MARKER.test(text)) return "comparison";
      if (DATA_MARKER.test(text)) return "data_sentence";
    }
    if (finalSentence && RESULT_MARKER.test(text) && refersBackToParagraph(text)) return "link_back";
    if (finalSentence && !introducesNewRoute(text)) return "paragraph_closing_sentence";
    return "explanation";
  }
  return "unknown";
}

export function assessConclusionFunction(paragraphs = [], taskType = "Task 2") {
  if (taskType !== "Task 2") return { status: "Not Applicable", present: false, complete: true, reason: "Task 1 does not require a conclusion." };
  const conclusion = (paragraphs || []).find((paragraph) => paragraph.role === "Conclusion");
  if (!conclusion) return { status: "Critical", present: false, complete: false, reason: "The response has no identifiable conclusion." };
  const sentences = conclusion.sentences || [];
  const text = String(conclusion.exactText || "").trim();
  const complete = SENTENCE_COMPLETE.test(text) && !/[,;:]\s*$/u.test(text);
  const contradictory = /\b(?:however|on the other hand)\b/i.test(text) && /\b(?:new|another)\s+(?:reason|argument|issue)\b/i.test(text);
  const newIdea = sentences.some((sentence, index) => index > 0 && detectSentenceRole({
    taskType,
    paragraphRole: conclusion.role,
    sentenceIndex: index,
    sentenceCount: sentences.length,
    sentence: sentence.exactText,
    previousSentence: sentences[index - 1]?.exactText || ""
  }) === "conclusion_new_idea");
  if (!complete || contradictory || newIdea) {
    return {
      status: !complete || contradictory ? "Critical" : "Moderate",
      present: true,
      complete,
      contradictory,
      newIdea,
      reason: !complete ? "The conclusion is unfinished." : contradictory ? "The conclusion contains a conflicting final route." : "The conclusion introduces a new idea."
    };
  }
  return {
    status: "Strong",
    present: true,
    complete: true,
    contradictory: false,
    newIdea: false,
    reason: "The conclusion is present, complete and closes the established response without opening a new route."
  };
}

export function inferRepairTargets(issue = {}) {
  const category = normalizeIssueCategory(issue.issueCategory || issue.issueType, issue);
  const text = normalizeText([
    issue.issueType, issue.issueSubtype, issue.diagnosis, issue.whyItLimitsBand,
    issue.kruPomDiagnosis, issue.studentAction
  ].filter(Boolean).join(" "));
  const targets = new Set();
  const add = (...values) => values.forEach((value) => targets.add(value));
  if (category === "Grammar and Sentence Control") add("grammar");
  if (category === "Punctuation") add("punctuation");
  if (category === "Collocation") add("collocation");
  if (category === "Word Form") add("word form");
  if (category === "Reference Control") add("reference");
  if (category === "Countability") add("countability");
  if (category === "Article Control") add("article");
  if (category === "Preposition Control") add("preposition");
  if (category === "Sentence Completion") add("sentence completeness");
  if (category === "Body Route Alignment") add("topic-sentence clarity");
  if (category === "Data Accuracy") add("data accuracy");
  if (category === "Comparison Precision") add("comparison accuracy");
  if (["Overview Quality", "Overview Accuracy"].includes(category)) add("overview accuracy");
  if (category === "Link Back Control") add("link-back");
  if (category === "Conclusion Closure") add("conclusion closure");
  if (category === "Paragraph Unity") add("paragraph unity");
  if (category === "Prompt Coverage") add("prompt coverage");
  if ([
    "Grammar and Sentence Control", "Punctuation", "Collocation", "Word Form",
    "Reference Control", "Countability", "Article Control", "Preposition Control",
    "Sentence Completion"
  ].includes(category)) return [...targets].filter((target) => REPAIR_TARGETS.includes(target));
  const developmentCategory = ["Explanation Depth", "SAR Example Quality", "Example Development"].includes(category);
  if (issue.taskType !== "Task 1" && (developmentCategory || /\b(?:missing|weak|insufficient) (?:causal )?mechanism|cause-and-effect|intermediate step\b/.test(text))) add("mechanism");
  if (issue.taskType !== "Task 1" && (category === "Explanation Depth" || /\b(?:explanation depth|underdeveloped (?:reason|idea|argument)|develop (?:the )?reason)\b/.test(text))) add("explanation depth");
  if (/\b(?:example|illustration)\b/.test(text) && /\b(?:narrow|vague|generic|specific|rebuild|develop)\b/.test(text)) add("example specificity");
  if (/\b(?:sar|specific situation|action and result)\b/.test(text)) add("SAR completeness");
  if (/\b(?:narrow scope|wider scope|scope problem|individual case|representative)\b/.test(text)) add("scope");
  if (/\b(?:affected group|who is affected|people affected|wider group)\b/.test(text)) add("affected group");
  if (/\b(?:consequence|wider impact|resulting effect|outcome)\b/.test(text)) add("consequence");
  if (/\b(?:policy wording|vague policy)\b/.test(text)) add("policy wording");
  if (!targets.size && category === "Lexical Precision") add("collocation");
  return [...targets].filter((target) => REPAIR_TARGETS.includes(target));
}

export function evaluateRevisionAlignment({ exactSentence = "", targetedRevision = "", revisionType = "", repairTargets = [], taskType = "", visualType = "", sentenceRole = "" } = {}) {
  const original = String(exactSentence || "").trim();
  const revision = String(targetedRevision || "").trim();
  const originalNorm = normalizeText(original);
  const revisionNorm = normalizeText(revision);
  const changed = Boolean(revisionNorm && revisionNorm !== originalNorm);
  const surfaceChanged = Boolean(revision && revision.normalize("NFKC").replace(/\s+/g, " ").trim() !== original.normalize("NFKC").replace(/\s+/g, " ").trim());
  const addedWords = Math.max(0, wordCount(revision) - wordCount(original));
  const checks = {
    grammar: surfaceChanged,
    punctuation: surfaceChanged && SENTENCE_COMPLETE.test(revision),
    collocation: changed,
    "word form": changed,
    reference: changed,
    countability: changed,
    article: changed,
    preposition: changed,
    "sentence completeness": SENTENCE_COMPLETE.test(revision) && !/[,;:]\s*$/u.test(revision),
    "topic-sentence clarity": changed && wordCount(revision) >= 6,
    "task wording": changed,
    "policy wording": changed && !/\b(?:thing|place|some policy|specific place)\b/i.test(revision),
    "data accuracy": changed && (taskType === "Task 1" ? (/map|plan/i.test(visualType) ? MAP_MARKER.test(revision) : true) : DATA_MARKER.test(revision)),
    "comparison accuracy": changed && COMPARISON_MARKER.test(revision),
    "overview accuracy": changed && (taskType === "Task 1" || sentenceRole === "overview" ? true : /\boverall\b/i.test(revision)),
    mechanism: changed && (CAUSE_MARKER.test(revision) || RESULT_MARKER.test(revision)) && addedWords >= 4,
    "explanation depth": changed && addedWords >= 5 && (CAUSE_MARKER.test(revision) || RESULT_MARKER.test(revision)),
    "example specificity": changed && (EXAMPLE_MARKER.test(revision) || /\b(?:a |an |the )?[a-z]+(?:s|ers|people|students|residents|workers|families|countries|cities)\b/i.test(revision)) && addedWords >= 3,
    "SAR completeness": changed && addedWords >= 6 && (CAUSE_MARKER.test(revision) || RESULT_MARKER.test(revision)),
    scope: changed && /\b(?:people|families|students|residents|workers|commuters|communities|countries|cities|the public|a wider)\b/i.test(revision),
    "affected group": changed && /\b(?:people|families|students|residents|workers|commuters|communities|countries|cities|the public)\b/i.test(revision),
    consequence: changed && RESULT_MARKER.test(revision),
    "link-back": changed && RESULT_MARKER.test(revision),
    "conclusion closure": surfaceChanged && SENTENCE_COMPLETE.test(revision) && !/[,;:]\s*$/u.test(revision),
    "paragraph unity": changed,
    "prompt coverage": changed
  };
  const repairedTargets = repairTargets.filter((target) => Boolean(checks[target]));
  const unresolvedTargets = repairTargets.filter((target) => !checks[target]);
  const materialExpansion = addedWords >= 5 || repairTargets.some((target) => [
    "mechanism", "explanation depth", "example specificity", "SAR completeness", "scope", "affected group", "consequence"
  ].includes(target));
  const revisionTypeAligned = !revisionType || !materialExpansion || ["Teacher-Guided Expansion", "Model Paragraph"].includes(revisionType) || (revisionType === "Route-Preserving Revision" && unresolvedTargets.length === 0 && addedWords < 10);
  return {
    repairTargets,
    repairedTargets,
    unresolvedTargets,
    revisionAlignmentStatus: !revision ? "missing-revision" : unresolvedTargets.length ? "requires-regeneration" : revisionTypeAligned ? "aligned" : "revision-type-mismatch",
    revisionTypeAligned,
    pass: Boolean(revision && unresolvedTargets.length === 0 && revisionTypeAligned)
  };
}

export function validateFeedbackIntegrity(model = {}, writing = "") {
  const issues = [];
  const source = normalizeText(writing);
  const detailedById = new Map((model.issues || []).map((issue) => [issue.issueId, issue]));
  for (const [index, issue] of (model.issues || []).entries()) {
    if (!SENTENCE_ROLES.includes(issue.sentenceRole)) issues.push(`Issue ${index + 1} uses an invalid sentence role.`);
    if (!ISSUE_TAXONOMY.includes(issue.issueCategory)) issues.push(`Issue ${index + 1} uses an invalid issue category.`);
    if (!source.includes(normalizeText(issue.exactEvidence))) issues.push(`Issue ${index + 1} exact evidence is not present in the writing.`);
    if (issue.evidenceCount !== issue.evidenceLocations.length) issues.push(`Issue ${index + 1} evidence count does not match its evidence locations.`);
    if (issue.evidenceScope === "single-location" && issue.evidenceCount !== 1) issues.push(`Issue ${index + 1} single-location evidence is not count 1.`);
    if (issue.evidenceScope === "multi-location" && issue.evidenceCount < 2) issues.push(`Issue ${index + 1} multi-location evidence has fewer than two locations.`);
    if (issue.sentenceRole === "body_topic_sentence" && ["Link Back Control", "Conclusion Closure"].includes(issue.issueCategory)) {
      issues.push(`Issue ${index + 1} describes a body opening as a closure issue.`);
    }
    if (!issue.punctuationClaimValid) issues.push(`Issue ${index + 1} contains a punctuation claim that conflicts with the quoted evidence.`);
    if (issue.revisionAlignmentStatus === "requires-regeneration") issues.push(`Issue ${index + 1} (${issue.issueCategory} at ${issue.paragraphLocation}) targeted revision leaves diagnosed repair targets unresolved: ${issue.unresolvedTargets.join(", ")}.`);
  }
  for (const topIssue of model.topIssues || []) {
    const detailed = detailedById.get(topIssue.issueId);
    if (!detailed) {
      issues.push(`Top issue ${topIssue.issueId} has no detailed canonical issue.`);
      continue;
    }
    for (const key of ["issueCategory", "severity", "paragraphLocation", "exactEvidence", "diagnosis", "targetedRevision"]) {
      if (normalizeText(topIssue[key]) !== normalizeText(detailed[key])) issues.push(`Top issue ${topIssue.issueId} does not match detailed feedback field ${key}.`);
    }
  }
  for (const issueId of [
    ...(model.linkage?.summaryIssueIds || []),
    ...(model.linkage?.urgentRepairIssueIds || []),
    ...(model.linkage?.topIssueIds || [])
  ]) {
    if (!detailedById.has(issueId)) issues.push(`Linked issue ${issueId} is missing from detailed feedback.`);
  }
  return [...new Set(issues)];
}

function canonicalizeIssue(card, index, context) {
  if (!card || typeof card !== "object") return null;
  const exactEvidence = String(card.exactEvidence || card.exactSentence || "").trim();
  if (!exactEvidence) return null;
  const record = findEvidenceRecord(exactEvidence, context.records);
  if (!record) return null;
  const canonicalEvidence = String(context.writing || "").includes(exactEvidence) ? exactEvidence : record.exactText;
  const sentenceRole = detectSentenceRole({
    taskType: context.taskType,
    visualType: context.visualType,
    paragraphRole: record.paragraphRole,
    sentenceIndex: record.sentenceIndex,
    sentenceCount: record.paragraphSentenceCount,
    sentence: record.exactText,
    previousSentence: record.previousSentence
  });
  const originalIssueCategory = normalizeIssueCategory(card.issueCategory || card.issueType, card);
  let issueCategory = correctIssueCategoryForRole(originalIssueCategory, sentenceRole, card);
  const originalPunctuationClaimValid = validatePunctuationClaim(card, canonicalEvidence);
  const roleConflictCorrected = originalIssueCategory !== issueCategory;
  const roleSafeDiagnosis = roleConflictCorrected
    ? String(card.whyItLimitsBand || card.diagnosis || card.kruPomDiagnosis || "")
    : String(card.diagnosis || card.kruPomDiagnosis || card.whyItLimitsBand || "");
  const diagnosis = sanitizeLocationClaims(
    alignIssueCategoryClaims(sanitizeRoleConflictClaims(sanitizePunctuationClaims(roleSafeDiagnosis, canonicalEvidence), sentenceRole, issueCategory), card, issueCategory),
    record.location
  );
  const whyItLimitsBand = sanitizeLocationClaims(
    alignIssueCategoryClaims(sanitizeRoleConflictClaims(sanitizePunctuationClaims(String(card.whyItLimitsBand || diagnosis), canonicalEvidence), sentenceRole, issueCategory), card, issueCategory),
    record.location
  );
  const studentAction = sanitizeLocationClaims(alignIssueCategoryClaims(String(card.studentAction || ""), card, issueCategory), record.location);
  const revisionSurfaceChanged = String(card.targetedRevision || "").normalize("NFKC").replace(/\s+/g, " ").trim() !== canonicalEvidence.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (issueCategory === "Punctuation" && !revisionSurfaceChanged && originalPunctuationClaimValid) return null;
  const evidenceLocations = normalizeEvidenceLocations(card, record, context.records);
  evidenceLocations[0] = { ...evidenceLocations[0], exactEvidence: canonicalEvidence };
  const evidenceScope = evidenceLocations.length > 1 ? "multi-location" : "single-location";
  const issueId = stableIssueId(issueCategory, record.location, canonicalEvidence);
  const unchangedSurface = String(card.targetedRevision || "").normalize("NFKC").replace(/\s+/g, " ").trim() === canonicalEvidence.normalize("NFKC").replace(/\s+/g, " ").trim();
  const deterministicallySupportedRefinement = unchangedSurface && card.revisionIntegrity?.pass === true;
  const unchangedRefinement = (["Pass / Strong", "High-Band Refinement"].includes(String(card.severity || "")) || deterministicallySupportedRefinement) &&
    normalizeText(card.targetedRevision) === normalizeText(canonicalEvidence);
  const severity = deterministicallySupportedRefinement ? "High-Band Refinement" : card.severity;
  const repairTargets = unchangedRefinement
    ? []
    : inferRepairTargets({ taskType: context.taskType, issueCategory, diagnosis, whyItLimitsBand, studentAction: card.studentAction });
  let revisionType = String(card.revisionType || "").trim();
  const preliminaryAlignment = evaluateRevisionAlignment({
    exactSentence: canonicalEvidence,
    targetedRevision: card.targetedRevision,
    revisionType,
    repairTargets,
    taskType: context.taskType,
    visualType: context.visualType,
    sentenceRole
  });
  if (!preliminaryAlignment.pass && repairTargets.some((target) => ["mechanism", "explanation depth", "example specificity", "SAR completeness", "scope", "affected group", "consequence"].includes(target))) {
    revisionType = "Teacher-Guided Expansion";
  }
  const alignment = evaluateRevisionAlignment({
    exactSentence: canonicalEvidence,
    targetedRevision: card.targetedRevision,
    revisionType,
    repairTargets,
    taskType: context.taskType,
    visualType: context.visualType,
    sentenceRole
  });
  return {
    ...card,
    issueId,
    taskType: context.taskType,
    paragraphId: `paragraph-${record.paragraphNumber}`,
    paragraphLabel: record.paragraphRole,
    paragraphLocation: record.location,
    sentenceIndex: record.sentenceNumber,
    exactSentence: canonicalEvidence,
    exactEvidence: canonicalEvidence,
    sentenceRole,
    issueCategory,
    issueType: String(card.issueType || issueCategory),
    severity,
    issueSubtype: String(card.issueSubtype || ""),
    diagnosis,
    coreDiagnosis: diagnosis,
    whyItLimitsBand,
    kruPomDiagnosis: diagnosis,
    studentAction,
    sentenceFunction: sentenceRoleDescription(sentenceRole),
    criteriaAffected: normalizeStringArray(card.criteriaAffected || card.affectedCriteria || card.criteria),
    criteria: normalizeStringArray(card.criteriaAffected || card.affectedCriteria || card.criteria),
    frameworkComponents: normalizeStringArray(card.frameworkComponents || card.framework),
    framework: normalizeStringArray(card.frameworkComponents || card.framework),
    evidenceScope,
    evidenceCount: evidenceLocations.length,
    primaryEvidenceLocation: evidenceLocations[0]?.paragraphLocation || record.location,
    evidenceLocations,
    additionalEvidenceLocations: evidenceLocations.slice(1),
    displayedEvidenceCount: evidenceLocations.length,
    punctuationClaimValid: true,
    punctuationClaimCorrected: !originalPunctuationClaimValid,
    revisionType,
    repairTargets,
    repairedTargets: alignment.repairedTargets,
    unresolvedTargets: alignment.unresolvedTargets,
    revisionAlignmentStatus: alignment.revisionAlignmentStatus,
    revisionAlignmentPass: alignment.pass,
    feedbackCardId: `card-${index + 1}`
  };
}

function projectTopIssue(issue) {
  return {
    ...issue,
    title: issue.issueCategory,
    summary: issue.diagnosis,
    affectedCriteria: issue.criteriaAffected,
    paragraphLocations: issue.evidenceLocations.map((item) => item.paragraphLocation),
    evidenceItems: issue.evidenceLocations.map((item, index) => ({
      paragraphLocation: item.paragraphLocation,
      exactSentence: item.exactEvidence,
      evidenceRole: index === 0 ? "Primary evidence" : "Additional occurrence"
    })),
    scope: issue.evidenceScope,
    whyItLimitsBand: issue.whyItLimitsBand
  };
}

function selectCanonicalTopIssueIds(topIssues, canonicalIssues, taskType) {
  const limit = taskType === "Task 2" ? 5 : 3;
  const selected = [];
  for (const top of Array.isArray(topIssues) ? topIssues : []) {
    const match = canonicalIssues.find((issue) => !selected.includes(issue.issueId) && (
      normalizeText(top?.exactEvidence || top?.exactSentence) === normalizeText(issue.exactEvidence) ||
      String(top?.issueId || "") === issue.issueId ||
      normalizeIssueCategory(top?.issueCategory || top?.issueType, top) === issue.issueCategory
    ));
    if (match) selected.push(match.issueId);
    if (selected.length >= limit) break;
  }
  const ranked = [...canonicalIssues].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
  for (const issue of ranked) {
    if (!selected.includes(issue.issueId)) selected.push(issue.issueId);
    if (selected.length >= limit) break;
  }
  return selected;
}

function buildParagraphCoverage({ paragraphs, canonicalIssues, paragraphFeedback, taskType }) {
  const guidance = Array.isArray(paragraphFeedback) ? paragraphFeedback : [];
  return paragraphs.map((paragraph) => {
    const issues = canonicalIssues.filter((issue) => issue.paragraphLabel === paragraph.role);
    const primary = [...issues].sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0];
    const legacy = guidance.find((item) => normalizeText(item.paragraphLocation).startsWith(normalizeText(paragraph.role)));
    const status = paragraphStatus(primary?.severity);
    return {
      paragraphId: `paragraph-${paragraph.paragraphNumber}`,
      paragraphLabel: paragraph.role,
      paragraphFunction: paragraphFunction(paragraph.role, taskType),
      status,
      diagnosis: primary?.diagnosis || strongParagraphDiagnosis(paragraph.role, taskType, legacy),
      priorityRepair: primary?.studentAction || "No priority repair",
      issueIds: issues.map((issue) => issue.issueId),
      exactEvidence: paragraph.sentences[0]?.exactText || paragraph.exactText
    };
  });
}

function findEvidenceRecord(evidence, records) {
  const target = normalizeText(evidence);
  return records.find((record) => normalizeText(record.exactText) === target) ||
    records.find((record) => normalizeText(record.exactText).includes(target) || target.includes(normalizeText(record.exactText)));
}

function normalizeEvidenceLocations(card, primary, records) {
  const candidates = [
    { paragraphLocation: primary.location, exactEvidence: primary.exactText },
    ...(Array.isArray(card.evidenceLocations) ? card.evidenceLocations : []),
    ...(Array.isArray(card.evidenceItems) ? card.evidenceItems : [])
  ];
  const output = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const evidence = String(candidate?.exactEvidence || candidate?.exactSentence || "").trim();
    const record = findEvidenceRecord(evidence, records);
    if (!record) continue;
    const key = `${record.location}|${normalizeText(record.exactText)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ paragraphLocation: record.location, exactEvidence: record.exactText });
  }
  return output.length ? output : [{ paragraphLocation: primary.location, exactEvidence: primary.exactText }];
}

function normalizeIssueCategory(value, card = {}) {
  const diagnosedCategories = normalizeText([
    ...(Array.isArray(card.revisionIntegrity?.diagnosedCategories) ? card.revisionIntegrity.diagnosedCategories : []),
    ...(Array.isArray(card.revisionIntegrity?.originalIssueCategories) ? card.revisionIntegrity.originalIssueCategories : [])
  ].join(" "));
  const diagnosedCategoryRules = [
    [/countability|countable/, "Countability"],
    [/preposition/, "Preposition Control"],
    [/article/, "Article Control"],
    [/reference|pronoun/, "Reference Control"],
    [/word form|derivation/, "Word Form"],
    [/collocation/, "Collocation"],
    [/punctuation/, "Punctuation"],
    [/grammar|sentence control/, "Grammar and Sentence Control"]
  ];
  const diagnosedMatch = diagnosedCategoryRules.find(([pattern]) => pattern.test(diagnosedCategories));
  if (diagnosedMatch) return diagnosedMatch[1];
  const explicitCategory = String(value || "").trim();
  if (ISSUE_TAXONOMY.includes(explicitCategory)) return explicitCategory;
  const text = normalizeText([value, card.issueType, card.issueCategory, card.criteria, card.framework, card.whyItLimitsBand, card.kruPomDiagnosis].flat().filter(Boolean).join(" "));
  const rules = [
    [/\bmeaning (?:control|change|changing|reversal)|meaning[- ]revers|reverses? (?:the )?meaning|contradictory meaning/, "Meaning Control"],
    [/missing overview|overview accuracy|inaccurate overview/, "Overview Accuracy"],
    [/overview/, "Overview Quality"],
    [/data accuracy|wrong (?:figure|category|year|unit)|reversed category|visual error/, "Data Accuracy"],
    [/visual understanding|misread visual|wrong visual/, "Visual Understanding"],
    [/process endpoint|final stage|endpoint/, "Process Endpoint"],
    [/process sequence|\bsequence\b/, "Process Sequence"],
    [/map change|dominant transformation/, "Map Change Accuracy"],
    [/objective reporting|unsupported purpose|invented purpose/, "Objective Reporting"],
    [/magnitude|degree word/, "Magnitude Precision"],
    [/comparison/, "Comparison Precision"],
    [/grouping/, "Grouping Logic"],
    [/data selection|key feature/, "Data Selection"],
    [/conclusion closure|closure/, "Conclusion Closure"],
    [/link back|link-back/, "Link Back Control"],
    [/paragraph unity|intruder/, "Paragraph Unity"],
    [/\bsar\b|specific situation|situation-action-result/, "SAR Example Quality"],
    [/example/, "Example Development"],
    [/explanation|mechanism|development/, "Explanation Depth"],
    [/body route|topic sentence|route alignment/, "Body Route Alignment"],
    [/thesis route|thesis/, "Thesis Route Clarity"],
    [/position|stance/, "Position Clarity"],
    [/prompt coverage|missing prompt/, "Prompt Coverage"],
    [/sentence completion|fragment|unfinished sentence/, "Sentence Completion"],
    [/punctuation|comma|full stop|period/, "Punctuation"],
    [/preposition/, "Preposition Control"],
    [/article/, "Article Control"],
    [/countability|countable/, "Countability"],
    [/reference|pronoun/, "Reference Control"],
    [/word form|derivation/, "Word Form"],
    [/collocation/, "Collocation"],
    [/grammar|grammatical|sentence control/, "Grammar and Sentence Control"],
    [/academic tone|report tone/, "Academic Tone"],
    [/concision|wordy/, "Concision"],
    [/lexical|vocabulary|word choice|precision/, "Lexical Precision"]
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || "Lexical Precision";
}

function correctIssueCategoryForRole(category, sentenceRole, card) {
  if (sentenceRole === "example" && ["Link Back Control", "Conclusion Closure", "Body Route Alignment"].includes(category)) {
    const text = normalizeText([card.issueType, card.framework, card.whyItLimitsBand, card.kruPomDiagnosis].flat().filter(Boolean).join(" "));
    return /\bsar\b|situation|action|result|specific/.test(text) ? "SAR Example Quality" : "Example Development";
  }
  if (["introduction_background", "introduction_paraphrase", "thesis"].includes(sentenceRole) && ["Link Back Control", "Conclusion Closure", "Paragraph Unity"].includes(category)) {
    const task1 = normalizeText([card.criteria, card.framework].flat().filter(Boolean).join(" ")).includes("task achievement");
    return task1 ? "Prompt Coverage" : "Thesis Route Clarity";
  }
  if (["introduction_background", "introduction_paraphrase", "thesis"].includes(sentenceRole) && category === "Body Route Alignment") {
    const text = normalizeText([card.issueType, card.whyItLimitsBand, card.kruPomDiagnosis].filter(Boolean).join(" "));
    return /lexical|vocabulary|word|collocation|precision|grammar/.test(text)
      ? (/grammar/.test(text) ? "Grammar and Sentence Control" : "Lexical Precision")
      : "Thesis Route Clarity";
  }
  if (sentenceRole === "body_topic_sentence" && ["Link Back Control", "Conclusion Closure", "Paragraph Unity"].includes(category)) {
    const text = normalizeText([card.issueType, card.whyItLimitsBand, card.kruPomDiagnosis].filter(Boolean).join(" "));
    return /lexical|vague|word|policy|collocation|precision/.test(text) ? "Lexical Precision" : "Body Route Alignment";
  }
  if (["body_topic_sentence", "explanation", "comparison", "data_sentence", "map_change_sentence", "process_stage", "paragraph_closing_sentence"].includes(sentenceRole) && ["Overview Quality", "Overview Accuracy"].includes(category)) {
    const text = normalizeText([card.issueType, card.whyItLimitsBand, card.kruPomDiagnosis].filter(Boolean).join(" "));
    if (/unsupported purpose|objective reporting|purpose phrase/.test(text)) return "Objective Reporting";
    if (/map|replaced|converted|demolished|constructed/.test(text)) return "Map Change Accuracy";
    if (/lexical|collocation|word|precision/.test(text)) return "Lexical Precision";
    return "Data Selection";
  }
  if (["conclusion_position", "conclusion_summary"].includes(sentenceRole) && category === "Conclusion Closure") {
    const text = normalizeText([card.whyItLimitsBand, card.kruPomDiagnosis].filter(Boolean).join(" "));
    if (/lexical|collocation|word choice|reference|clause|grammar|precision/.test(text) && !/missing|contradict|new idea|unfinished|fails? to answer/.test(text)) {
      return /grammar|clause/.test(text) ? "Grammar and Sentence Control" : "Lexical Precision";
    }
  }
  return category;
}

function validatePunctuationClaim(card, evidence) {
  const text = [card.issueType, card.diagnosis, card.whyItLimitsBand, card.kruPomDiagnosis].filter(Boolean).join(" ");
  const ending = String(evidence || "").trim().match(/([,;:.!?])["')\]]*$/u)?.[1] || "";
  if (/ends? (?:with|in) (?:a )?comma/i.test(text)) return ending === ",";
  if (/ends? (?:with|in) (?:a )?(?:full stop|period)/i.test(text)) return ending === ".";
  if (/ends? (?:with|in) (?:a )?semicolon/i.test(text)) return ending === ";";
  return true;
}

function sanitizePunctuationClaims(value, evidence) {
  const text = String(value || "");
  const ending = String(evidence || "").trim().match(/([,;:.!?])["')\]]*$/u)?.[1] || "";
  if (ending === "." && /ends? (?:with|in) (?:a )?comma/i.test(text)) {
    return text.replace(/(?:\s*(?:and|but)\s+)?(?:(?:this|the) sentence|it)?\s*ends? (?:with|in) (?:a )?comma\.?/gi, "").replace(/\s+\./g, ".").trim();
  }
  if (ending === "," && /ends? (?:with|in) (?:a )?(?:full stop|period)/i.test(text)) {
    return text.replace(/(?:\s*(?:and|but)\s+)?(?:(?:this|the) sentence|it)?\s*ends? (?:with|in) (?:a )?(?:full stop|period)\.?/gi, "").replace(/\s+\./g, ".").trim();
  }
  return text;
}

function sanitizeRoleConflictClaims(value, sentenceRole, issueCategory) {
  let text = String(value || "");
  if (sentenceRole === "body_topic_sentence" && !["Link Back Control", "Conclusion Closure"].includes(issueCategory)) {
    text = text
      .replace(/(?:the )?paragraph (?:does not|doesn't|fails? to) close cleanly/gi, "the topic sentence needs more precise wording")
      .replace(/(?:weak|unclear|unfinished) (?:paragraph )?closure/gi, "imprecise topic-sentence wording")
      .replace(/(?:weak|missing) link[- ]?back/gi, "imprecise topic-sentence wording");
  }
  return text;
}

function sanitizeLocationClaims(value, canonicalLocation) {
  const text = String(value || "");
  const location = String(canonicalLocation || "").trim();
  if (!text || !location) return text;
  return text
    .replace(/\b(?:Introduction|Overview|Conclusion|Task 1 Conclusion|Body Paragraph\s+\d+)\s*,?\s*Sentence\s+\d+\b/gi, location)
    .replace(/\bBody Paragraph\s+\d+\s*,\s*\d+\b/gi, location);
}

function alignIssueCategoryClaims(value, card, issueCategory) {
  let text = String(value || "");
  for (const candidate of [card.issueCategory, card.issueType]) {
    const original = String(candidate || "").trim();
    if (!original || normalizeText(original) === normalizeText(issueCategory)) continue;
    text = text.replace(new RegExp(escapeRegExp(original), "gi"), issueCategory);
  }
  return text;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sentenceRoleDescription(role) {
  const labels = {
    introduction_background: "Introduces background context for the task.",
    introduction_paraphrase: "Paraphrases the task in the introduction.",
    thesis: "States the response position or controlling route.",
    overview: "Summarises the dominant visual features.",
    body_topic_sentence: "Opens the body paragraph with its controlling claim.",
    explanation: "Explains or develops the paragraph's controlling claim.",
    example: "Provides an example supporting the paragraph's claim.",
    comparison: "Compares relevant visual categories or values.",
    data_sentence: "Reports selected visual data.",
    process_stage: "Describes a stage in the process sequence.",
    map_change_sentence: "Describes a change in the map or plan.",
    link_back: "Returns the developed evidence to the paragraph's controlling claim.",
    paragraph_closing_sentence: "Closes the paragraph without opening a new route.",
    conclusion_position: "Restates the writer's position in the conclusion.",
    conclusion_summary: "Summarises and closes the established route.",
    conclusion_new_idea: "Introduces a new idea in the conclusion.",
    fragment: "Attempts a sentence function but is grammatically incomplete.",
    unknown: "The sentence function could not be determined safely."
  };
  return labels[role] || labels.unknown;
}

function paragraphFunction(role, taskType) {
  if (role === "Introduction") return taskType === "Task 1" ? "Introduce and accurately paraphrase the visual task." : "Introduce the topic and establish the required response route.";
  if (role === "Overview") return "Summarise the dominant visual features without unsupported detail.";
  if (role === "Conclusion") return "Restate the established answer route and close without a new idea.";
  if (role === "Task 1 Conclusion") return "Unnecessary Task 1 conclusion; check whether it duplicates the overview or adds inference.";
  return taskType === "Task 1" ? "Group, select and compare the relevant visual evidence." : "Develop one controlling reason with explanation and evidence.";
}

function strongParagraphDiagnosis(role, taskType, legacy) {
  const legacyText = String(legacy?.diagnosis || "");
  if (/\b(?:clear|strong|controlled|accurate|complete)\b/i.test(legacyText) && !/\b(?:but|however|weak|missing|needs?|problem|issue)\b/i.test(legacyText)) return legacyText;
  if (role === "Introduction") return taskType === "Task 1" ? "The introduction was checked and no priority accuracy or paraphrase repair was identified." : "The introduction was checked and establishes a traceable response route. No priority structural repair was identified.";
  if (role === "Overview") return "The overview was checked and no priority overview repair was identified.";
  if (role === "Conclusion") return "The conclusion was checked and functionally closes the established route. No priority structural repair was identified.";
  return "This paragraph was checked and no priority repair was identified.";
}

function paragraphStatus(severity = "") {
  if (severity === "Critical") return "Critical";
  if (["Major", "Serious"].includes(severity)) return "Needs Work";
  if (severity === "Moderate") return "Moderate";
  if (["Minor Repair", "High-Band Refinement"].includes(severity)) return "Mostly Controlled";
  return "Strong";
}

function introducesConclusionNewIdea(text) {
  return /^(?:moreover|furthermore|in addition|another|a further)\b/i.test(String(text || "")) || /\b(?:a new reason|another argument|should also)\b/i.test(String(text || ""));
}

function refersBackToParagraph(text) {
  return RESULT_MARKER.test(text) || /\b(?:this|these|such)\b/i.test(text);
}

function introducesNewRoute(text) {
  return /^(?:moreover|furthermore|in addition|another)\b/i.test(String(text || ""));
}

function stableIssueId(category, location, evidence) {
  const value = `${category}|${location}|${normalizeText(evidence)}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `issue-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function severityRank(value) {
  return { "Pass / Strong": 0, Strong: 0, "High-Band Refinement": 1, "Minor Repair": 2, "Mostly Controlled": 2, Moderate: 3, "Needs Work": 4, Serious: 4, Major: 4, Critical: 5 }[value] ?? 3;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
  if (String(value || "").trim()) return [String(value).trim()];
  return [];
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}

function wordCount(value) {
  return String(value || "").match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.length || 0;
}
