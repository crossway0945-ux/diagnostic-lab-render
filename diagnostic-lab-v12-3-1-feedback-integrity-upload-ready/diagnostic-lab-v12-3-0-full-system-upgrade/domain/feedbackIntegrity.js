import { segmentStudentResponse } from "./paragraphEvidence.js";
import { checkRevisionTypeFidelity, validateRevisionQuality } from "./revisionQuality.js";

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
  "Topic Sentence Strength", "Topic Sentence Precision", "Policy Mechanism Accuracy",
  "Explanation Depth", "Causal Mechanism", "Example Development",
  "SAR Example Quality", "Link Back Control", "Paragraph Closure",
  "Paragraph Unity", "Conclusion Closure", "Meaning Control", "Visual Understanding",
  "Introduction Precision", "Mixed-Visual Coverage",
  "Overview Quality", "Overview Accuracy", "Data Selection", "Data Accuracy", "Grouping Logic",
  "Comparison Precision", "Objective Reporting", "Process Sequence", "Process Endpoint",
  "Map Change Accuracy", "Magnitude Precision", "Lexical Precision", "Word Choice", "Collocation", "Word Form",
  "Reference Control", "Pronoun Control", "Countability", "Article Control", "Preposition Control",
  "Tense Control", "Subject–Verb Agreement", "Modal + Base Verb",
  "Grammar and Sentence Control", "Punctuation", "Sentence Completion", "Academic Tone", "Concision"
]);

// Logic categories are task-specific. A Task 1 data/spatial category must never head a Task 2 card,
// and a Task 2 argument category must never head a Task 1 card.
export const TASK1_ONLY_CATEGORIES = Object.freeze([
  "Visual Understanding", "Introduction Precision", "Mixed-Visual Coverage", "Overview Quality",
  "Overview Accuracy", "Data Selection", "Data Accuracy", "Grouping Logic", "Comparison Precision",
  "Objective Reporting", "Process Sequence", "Process Endpoint", "Map Change Accuracy", "Magnitude Precision"
]);

export const TASK2_ONLY_CATEGORIES = Object.freeze([
  "Position Clarity", "Thesis Route Clarity", "Body Route Alignment", "Topic Sentence Strength",
  "Topic Sentence Precision", "Policy Mechanism Accuracy", "Explanation Depth", "Causal Mechanism",
  "Example Development", "SAR Example Quality", "Link Back Control", "Paragraph Closure",
  "Paragraph Unity", "Conclusion Closure"
]);

export const DEVELOPMENT_ISSUE_CATEGORIES = Object.freeze([
  "Explanation Depth", "Causal Mechanism", "Example Development", "SAR Example Quality"
]);

export const LANGUAGE_ISSUE_CATEGORIES = Object.freeze([
  "Lexical Precision", "Word Choice", "Collocation", "Word Form", "Reference Control", "Pronoun Control",
  "Countability", "Article Control", "Preposition Control", "Tense Control", "Subject–Verb Agreement",
  "Modal + Base Verb", "Grammar and Sentence Control", "Punctuation", "Sentence Completion",
  "Academic Tone", "Concision"
]);

export const ROUTE_ALIGNMENT_SCOPE_NOTE = "This rating assesses route alignment only. It does not mean that explanation, examples or language are strong.";
export const ROUTE_ALIGNMENT_SCOPE_NOTE_TH = "สถานะนี้ประเมินเฉพาะความสอดคล้องของเส้นทางเหตุผลกับ thesis เท่านั้น ไม่ได้หมายความว่าคำอธิบาย ตัวอย่าง หรือภาษาอยู่ในระดับแข็งแรง";

export function projectRouteAlignmentDisplay({ status = "", diagnosis = "", thai = false } = {}) {
  const aligned = /^(?:strong|controlled|aligned)$/i.test(String(status || "").trim());
  const note = thai ? ROUTE_ALIGNMENT_SCOPE_NOTE_TH : ROUTE_ALIGNMENT_SCOPE_NOTE;
  const base = String(diagnosis || "").trim();
  if (!base) return { status: aligned ? "Aligned" : String(status || ""), diagnosis: note };
  if (base.includes(note)) return { status: aligned ? "Aligned" : String(status || ""), diagnosis: base };
  // The route summary is a pipe-joined list with no terminal punctuation, so close it before the
  // scope note or the two sentences run together ("...disagreement This rating assesses...").
  const closed = /[.!?]["')\]]*$/u.test(base) ? base : `${base}.`;
  return {
    status: aligned ? "Aligned" : String(status || ""),
    diagnosis: `${closed} ${note}`
  };
}

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
// Causation expressed either by a connective or by a participial clause ("leaving them tired",
// "forcing parents to adjust"), which is how natural academic English usually carries a mechanism.
const CAUSAL_LINK_MARKER = /\b(?:because|since|as a result of|due to|thereby|through|when|if|whenever)\b|\b(?:leading|leaving|forcing|causing|making|putting|creating|pushing|driving|preventing|allowing|enabling)\b|\b(?:so|therefore|thus|hence|consequently|resulting in|leads? to|results? in|which (?:means|causes|leads|forces))\b/i;
const GROUP_MARKER = /\b(?:people|families|parents|students|residents|workers|commuters|shoppers|drivers|households|communities|citizens|customers|passengers|employees|businesses|neighbourhoods|neighborhoods|districts|countries|cities|the public|a wider)\b/i;
const CONSEQUENCE_MARKER = /\b(?:so|therefore|thus|hence|as a result|consequently|resulting in|leads? to|results? in|leaving|forcing|causing|creating|putting)\b|\b(?:increase|reduce|worsen|delay|pressure|congestion|overload|shortage|spend|lose|loss|tired|harder|difficult|unable)\w*/i;
const STOP_WORDS = new Set("a an the and or but of to in on at for with by from is are was were be been being it its this that these those their his her they them he she we you i as into over under more most very much many some any".split(" "));

export function buildFeedbackIntegrityModel({
  writing = "",
  taskType = "Task 2",
  visualType = "",
  reportLanguage = "",
  prompt = "",
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
    .map((card, index) => canonicalizeIssue(card, index, { writing, taskType, visualType, reportLanguage, prompt, paragraphs, records }))
    .filter(Boolean);
  ensureExecutiveDevelopmentCoverage(canonicalIssues, `${mainScoreLimitingFactor} ${mostUrgentRepair}`, taskType);
  const topIssueIds = selectCanonicalTopIssueIds(topIssues, canonicalIssues, taskType, `${mainScoreLimitingFactor} ${mostUrgentRepair}`);
  const canonicalTopIssues = topIssueIds
    .map((issueId) => canonicalIssues.find((issue) => issue.issueId === issueId))
    .filter(Boolean)
    .map((issue) => projectTopIssue(issue));
  const conclusionFunction = assessConclusionFunction(paragraphs, taskType);
  const paragraphCoverage = buildParagraphCoverage({ paragraphs, canonicalIssues, paragraphFeedback, taskType, conclusionFunction });
  const majorIds = canonicalIssues
    .filter((issue) => ["Critical", "Major", "Serious", "Moderate"].includes(issue.severity))
    .map((issue) => issue.issueId);
  const summaryIssueIds = (majorIds.length ? majorIds : topIssueIds).slice(0, 3);
  const urgentRepairIssueIds = (majorIds.length ? majorIds : topIssueIds).slice(0, 2);
  return {
    issues: canonicalIssues,
    topIssues: canonicalTopIssues,
    paragraphCoverage,
    conclusionFunction,
    repairs: canonicalIssues.flatMap((issue) => (issue.integrityRepairs || []).map((repair) => ({ ...repair, issueId: issue.issueId }))),
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
  const category = normalizeIssueCategory(issue.issueCategory || issue.issueType, issue, issue.taskType);
  const text = normalizeText([
    issue.issueType, issue.issueSubtype, issue.diagnosis, issue.whyItLimitsBand,
    issue.kruPomDiagnosis, issue.studentAction
  ].filter(Boolean).join(" "));
  const targets = new Set();
  const add = (...values) => values.forEach((value) => targets.add(value));
  if (["Grammar and Sentence Control", "Tense Control", "Subject–Verb Agreement", "Modal + Base Verb"].includes(category)) add("grammar");
  if (category === "Punctuation") add("punctuation");
  if (["Collocation", "Word Choice"].includes(category)) add("collocation");
  if (category === "Word Form") add("word form");
  if (["Reference Control", "Pronoun Control"].includes(category)) add("reference");
  if (category === "Countability") add("countability");
  if (category === "Article Control") add("article");
  if (category === "Preposition Control") add("preposition");
  if (category === "Sentence Completion") add("sentence completeness");
  if (["Body Route Alignment", "Topic Sentence Strength"].includes(category)) add("topic-sentence clarity");
  if (category === "Data Accuracy") add("data accuracy");
  if (category === "Comparison Precision") add("comparison accuracy");
  if (["Overview Quality", "Overview Accuracy"].includes(category)) add("overview accuracy");
  if (["Link Back Control", "Paragraph Closure"].includes(category)) add("link-back");
  if (category === "Conclusion Closure") add("conclusion closure");
  if (category === "Paragraph Unity") add("paragraph unity");
  if (category === "Prompt Coverage") add("prompt coverage");
  const strippedText = stripCategoryEchoes(text, issue);
  const developmentSignal = issue.taskType === "Task 1" ? "" : detectDevelopmentSignal(strippedText);
  if ([
    "Grammar and Sentence Control", "Punctuation", "Collocation", "Word Form", "Word Choice",
    "Reference Control", "Pronoun Control", "Countability", "Article Control", "Preposition Control",
    "Tense Control", "Subject–Verb Agreement", "Modal + Base Verb",
    "Sentence Completion"
  ].includes(category) && !developmentSignal) return [...targets].filter((target) => REPAIR_TARGETS.includes(target));
  if (developmentSignal === "Causal Mechanism") add("mechanism");
  if (developmentSignal === "Explanation Depth") add("explanation depth");
  if (developmentSignal === "SAR Example Quality") add("SAR completeness");
  if (developmentSignal === "Example Development") add("example specificity");
  const developmentCategory = ["Explanation Depth", "Causal Mechanism", "SAR Example Quality", "Example Development"].includes(category);
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
  // Development repair is judged from the content the revision actually introduces, never from net
  // length growth: replacing a narrow example with a broader one of the same length is still a repair.
  const originalContent = new Set(contentWords(original));
  const introducedContent = contentWords(revision).filter((word) => !originalContent.has(word));
  const contentAdded = new Set(introducedContent).size >= 3;
  const addsGroup = GROUP_MARKER.test(revision) && (contentAdded || !GROUP_MARKER.test(original));
  const addsCause = CAUSAL_LINK_MARKER.test(revision) && (contentAdded || !CAUSAL_LINK_MARKER.test(original));
  const addsConsequence = CONSEQUENCE_MARKER.test(revision) && (contentAdded || !CONSEQUENCE_MARKER.test(original));
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
    mechanism: changed && addsCause && contentAdded,
    "explanation depth": changed && addsCause && contentAdded,
    "example specificity": changed && contentAdded && (EXAMPLE_MARKER.test(revision) || addsGroup || addsConsequence),
    "SAR completeness": changed && contentAdded && addsCause && (addsGroup || addsConsequence),
    scope: changed && addsGroup,
    "affected group": changed && addsGroup,
    consequence: changed && addsConsequence,
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
  const revisionTypeAligned = !revisionType || !materialExpansion || ["Teacher-Guided Expansion", "Model Paragraph"].includes(revisionType) || (revisionType === "Route-Preserving Revision" && unresolvedTargets.length === 0 && addedWords < 6);
  return {
    repairTargets,
    repairedTargets,
    unresolvedTargets,
    contentAdded,
    revisionAlignmentStatus: !revision ? "missing-revision" : unresolvedTargets.length ? "requires-regeneration" : revisionTypeAligned ? "aligned" : "revision-type-mismatch",
    revisionTypeAligned,
    pass: Boolean(revision && unresolvedTargets.length === 0 && revisionTypeAligned)
  };
}

export function auditFeedbackIntegrity(model = {}, writing = "") {
  const findings = [];
  const source = normalizeText(writing);
  const detailedById = new Map((model.issues || []).map((issue) => [issue.issueId, issue]));
  const add = (severity, code, message) => findings.push({ severity, code, message });
  for (const [index, issue] of (model.issues || []).entries()) {
    // Fatal: the report would mislead the student about their own writing or break the schema contract.
    if (!source.includes(normalizeText(issue.exactEvidence))) add("fatal", "EVIDENCE_NOT_IN_WRITING", `Issue ${index + 1} exact evidence is not present in the writing.`);
    if (!SENTENCE_ROLES.includes(issue.sentenceRole)) add("fatal", "INVALID_SENTENCE_ROLE", `Issue ${index + 1} uses an invalid sentence role.`);
    if (!ISSUE_TAXONOMY.includes(issue.issueCategory)) add("fatal", "INVALID_ISSUE_CATEGORY", `Issue ${index + 1} uses an invalid issue category.`);

    // Repairable: internal presentation defects that the canonical builder repairs in place.
    if (issue.evidenceCount !== issue.evidenceLocations.length) add("repairable", "EVIDENCE_COUNT_METADATA", `Issue ${index + 1} evidence count does not match its evidence locations.`);
    if (issue.evidenceScope === "single-location" && issue.evidenceCount !== 1) add("repairable", "EVIDENCE_SCOPE_METADATA", `Issue ${index + 1} single-location evidence is not count 1.`);
    if (issue.evidenceScope === "multi-location" && issue.evidenceCount < 2) add("repairable", "EVIDENCE_SCOPE_METADATA", `Issue ${index + 1} multi-location evidence has fewer than two locations.`);
    if (issue.sentenceRole === "body_topic_sentence" && ["Link Back Control", "Conclusion Closure"].includes(issue.issueCategory)) {
      add("repairable", "ROLE_CATEGORY_CONFLICT", `Issue ${index + 1} describes a body opening as a closure issue.`);
    }
    if (!issue.punctuationClaimValid) add("repairable", "PUNCTUATION_CLAIM", `Issue ${index + 1} contains a punctuation claim that conflicts with the quoted evidence.`);
    // "partial-repair" is the disclosed form of "requires-regeneration": the canonical builder has
    // already told the student which diagnosed point the revision does not reach. Both stay visible
    // to QA so the rate can be monitored, and neither blocks the report.
    if (["requires-regeneration", "partial-repair"].includes(issue.revisionAlignmentStatus)) {
      add("repairable", "REVISION_TARGETS_UNRESOLVED", `Issue ${index + 1} (${issue.issueCategory} at ${issue.paragraphLocation}) targeted revision leaves diagnosed repair targets unresolved: ${(issue.unresolvedTargets || []).join(", ")}.`);
    }
    if (issue.revisionAlignmentStatus === "revision-type-mismatch") {
      add("repairable", "REVISION_TYPE_MISMATCH", `Issue ${index + 1} (${issue.issueCategory} at ${issue.paragraphLocation}) revision type does not match the scale of its targeted revision.`);
    }
    const contractCorpus = stripCategoryEchoes(normalizeText([issue.diagnosis, issue.whyItLimitsBand].filter(Boolean).join(" ")), issue);
    const contractDevelopmentSignal = detectDevelopmentSignal(contractCorpus);
    if (contractDevelopmentSignal && LANGUAGE_ISSUE_CATEGORIES.includes(issue.issueCategory)) {
      add("repairable", "CATEGORY_DIAGNOSIS_CONFLICT", `Issue ${index + 1} uses the language category ${issue.issueCategory} while its diagnosis describes a development problem (${contractDevelopmentSignal}).`);
    }
    if (Array.isArray(issue.secondaryIssueCategories) && issue.secondaryIssueCategories.includes(issue.issueCategory)) {
      add("repairable", "PRIMARY_SECONDARY_DUPLICATE", `Issue ${index + 1} lists its primary category as a secondary issue.`);
    }
  }
  for (const topIssue of model.topIssues || []) {
    const detailed = detailedById.get(topIssue.issueId);
    if (!detailed) {
      add("repairable", "TOP_ISSUE_UNLINKED", `Top issue ${topIssue.issueId} has no detailed canonical issue.`);
      continue;
    }
    for (const key of ["issueCategory", "severity", "paragraphLocation", "exactEvidence", "diagnosis", "targetedRevision"]) {
      if (normalizeText(topIssue[key]) !== normalizeText(detailed[key])) {
        add("repairable", "TOP_ISSUE_FIELD_MISMATCH", `Top issue ${topIssue.issueId} does not match detailed feedback field ${key}.`);
      }
    }
  }
  for (const issueId of [
    ...(model.linkage?.summaryIssueIds || []),
    ...(model.linkage?.urgentRepairIssueIds || []),
    ...(model.linkage?.topIssueIds || [])
  ]) {
    if (!detailedById.has(issueId)) add("repairable", "LINKED_ISSUE_MISSING", `Linked issue ${issueId} is missing from detailed feedback.`);
  }
  const seen = new Set();
  return findings.filter((finding) => {
    if (seen.has(finding.message)) return false;
    seen.add(finding.message);
    return true;
  });
}

export function validateFeedbackIntegrity(model = {}, writing = "") {
  return auditFeedbackIntegrity(model, writing)
    .filter((finding) => finding.severity === "fatal")
    .map((finding) => finding.message);
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
  const repairs = [];
  const originalIssueCategory = normalizeIssueCategory(card.issueCategory || card.issueType, card, context.taskType);
  let issueCategory = correctIssueCategoryForRole(originalIssueCategory, sentenceRole, card);
  const originalPunctuationClaimValid = validatePunctuationClaim(card, canonicalEvidence);
  const roleConflictCorrected = originalIssueCategory !== issueCategory;
  const roleSafeDiagnosis = roleConflictCorrected
    ? String(card.whyItLimitsBand || card.diagnosis || card.kruPomDiagnosis || "")
    : String(card.diagnosis || card.kruPomDiagnosis || card.whyItLimitsBand || "");
  const buildSecondary = (category) => DEVELOPMENT_ISSUE_CATEGORIES.includes(category)
    ? [...new Set([
        String(card.issueCategory || "").trim(),
        String(card.issueType || "").trim(),
        detectDiagnosedLanguageCategory(card)
      ].filter((label) => LANGUAGE_ISSUE_CATEGORIES.includes(label) && label !== category))]
    : [];
  const renderIssueTexts = (category, secondary) => ({
    diagnosis: sanitizeLocationClaims(
      alignIssueCategoryClaims(sanitizeRoleConflictClaims(sanitizePunctuationClaims(roleSafeDiagnosis, canonicalEvidence), sentenceRole, category), card, category, secondary),
      record.location
    ),
    whyItLimitsBand: sanitizeLocationClaims(
      alignIssueCategoryClaims(sanitizeRoleConflictClaims(sanitizePunctuationClaims(String(card.whyItLimitsBand || roleSafeDiagnosis), canonicalEvidence), sentenceRole, category), card, category, secondary),
      record.location
    ),
    studentAction: sanitizeLocationClaims(alignIssueCategoryClaims(String(card.studentAction || ""), card, category, secondary), record.location)
  });
  let secondaryIssueCategories = buildSecondary(issueCategory);
  let texts = renderIssueTexts(issueCategory, secondaryIssueCategories);
  // Self-repair: the rendered diagnosis is the text the student reads, so the category must match it.
  const renderedDevelopmentSignal = detectDevelopmentSignal(
    stripCategoryEchoes(normalizeText([texts.diagnosis, texts.whyItLimitsBand].filter(Boolean).join(" ")), { issueCategory, issueType: card.issueType })
  );
  if (renderedDevelopmentSignal && LANGUAGE_ISSUE_CATEGORIES.includes(issueCategory)) {
    repairs.push({ code: "CATEGORY_DIAGNOSIS_CONFLICT", from: issueCategory, to: renderedDevelopmentSignal, paragraphLocation: record.location });
    const demoted = issueCategory;
    issueCategory = renderedDevelopmentSignal;
    secondaryIssueCategories = [...new Set([demoted, ...buildSecondary(issueCategory)])].filter((label) => label !== issueCategory);
    texts = renderIssueTexts(issueCategory, secondaryIssueCategories);
  }
  secondaryIssueCategories = secondaryIssueCategories.filter((label) => label !== issueCategory);
  const { diagnosis, whyItLimitsBand, studentAction } = texts;
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
  let severity = deterministicallySupportedRefinement ? "High-Band Refinement" : card.severity;
  // A development, mechanism or SAR gap is never an optional high-band refinement: it is the kind of
  // problem the Executive Summary names as a score limiter, so it must stay rankable as a Top Issue.
  if (DEVELOPMENT_ISSUE_CATEGORIES.includes(issueCategory) && ["High-Band Refinement", "Pass / Strong", "Minor Repair"].includes(String(severity))) {
    repairs.push({ code: "DEVELOPMENT_SEVERITY_FLOOR", from: String(severity), to: "Moderate", paragraphLocation: record.location });
    severity = "Moderate";
  }
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
  // Label by what the revision actually did, not by whether validation happened to pass.
  // The same discriminator is used everywhere: a revision is teacher guidance only when it supplies
  // an analytical element (an affected group, a condition or timing) the original never had.
  // A rewording that merely swaps synonyms stays a Minimal Correction.
  // Scope: only cards whose PRIMARY category is a development category get the automatic label
  // escalation. A Meaning Control correction may legitimately rebuild a sentence without becoming
  // "teacher-guided development"; its labelling is governed by the meaning-repair path.
  const developmentRepair = DEVELOPMENT_ISSUE_CATEGORIES.includes(issueCategory) && repairTargets.some((target) =>
    ["mechanism", "explanation depth", "example specificity", "SAR completeness", "scope", "affected group", "consequence"].includes(target));
  const expansionCheck = checkRevisionTypeFidelity({
    original: canonicalEvidence,
    revision: card.targetedRevision,
    revisionType
  });
  if (expansionCheck.substantialAddition && developmentRepair && revisionType !== "Model Paragraph") {
    revisionType = "Teacher-Guided Expansion";
  }
  let alignment = evaluateRevisionAlignment({
    exactSentence: canonicalEvidence,
    targetedRevision: card.targetedRevision,
    revisionType,
    repairTargets,
    taskType: context.taskType,
    visualType: context.visualType,
    sentenceRole
  });
  // Self-repair: a revision that carries analytical expansion must be labelled as teacher guidance,
  // never rejected. Relabelling is metadata-only and never rewrites the student-facing revision.
  if (alignment.revisionAlignmentStatus === "revision-type-mismatch") {
    repairs.push({ code: "REVISION_TYPE_MISMATCH", from: revisionType || "(unset)", to: "Teacher-Guided Expansion", paragraphLocation: record.location });
    revisionType = "Teacher-Guided Expansion";
    alignment = evaluateRevisionAlignment({
      exactSentence: canonicalEvidence,
      targetedRevision: card.targetedRevision,
      revisionType,
      repairTargets,
      taskType: context.taskType,
      visualType: context.visualType,
      sentenceRole
    });
  }
  // Self-repair: when the revision does not reach every diagnosed repair target we disclose the gap
  // honestly instead of discarding the report or claiming a repair that did not happen.
  // A Targeted Revision is the one thing a student may copy, so it is validated on its own terms.
  // Every finding is repairable: the diagnosis, evidence and score are preserved regardless.
  const revisionQuality = validateRevisionQuality({
    original: canonicalEvidence,
    revision: card.targetedRevision,
    prompt: context.prompt,
    writing: context.writing,
    revisionType,
    taskType: context.taskType
  });
  if (revisionQuality.revisionTypeValidationStatus === "fail" && revisionQuality.substantialAddition && revisionType !== "Model Paragraph") {
    repairs.push({ code: "REVISION_TYPE_FIDELITY", from: revisionType || "(unset)", to: "Teacher-Guided Expansion", paragraphLocation: record.location });
    revisionType = "Teacher-Guided Expansion";
  }
  for (const problem of revisionQuality.problems) {
    if (problem.code === "REVISION_TYPE_FIDELITY") continue;
    repairs.push({ code: problem.code, message: problem.message, paragraphLocation: record.location });
  }
  // Release blocker: a revision that fails grammar, reference coherence, task fidelity or language
  // safety is never shown to a student. The diagnosis, evidence and score are all preserved; only
  // the unsafe model sentence is withheld and replaced by a controlled instruction. Showing broken
  // or meaning-shifted language as a study model is worse than showing no model sentence.
  const revisionWithheld = ["fail"].some((status) => [
    revisionQuality.grammarValidationStatus,
    revisionQuality.semanticValidationStatus,
    revisionQuality.taskFidelityStatus,
    revisionQuality.languageSafetyStatus
  ].includes(status));
  let displayedRevision = String(card.targetedRevision || "");
  let displayedRevisionType = revisionType;
  if (revisionWithheld) {
    if (process.env.DIAGNOSTIC_DEBUG_WITHHOLD) {
      console.error("[withhold]", record.location, JSON.stringify(revisionQuality.problems));
    }
    repairs.push({
      code: "REVISION_WITHHELD",
      reasons: revisionQuality.problems.map((problem) => problem.code),
      paragraphLocation: record.location,
      disclosed: true
    });
    displayedRevision = String(context.reportLanguage || "").toLowerCase() === "th"
      ? "ระบบยังไม่สามารถยืนยันประโยคตัวอย่างที่ปลอดภัยสำหรับจุดนี้ได้ จึงไม่แสดงประโยคตัวอย่าง ให้แก้ตาม Student Action ด้านล่างด้วยตนเอง แล้วส่งงานเข้ามาตรวจอีกครั้ง"
      : "A safe corrected sentence could not be verified for this point, so no model sentence is shown. Rewrite it yourself following the Student Action below, then resubmit for checking.";
    displayedRevisionType = "Revision Unavailable";
  }

  let revisionAlignmentStatus = alignment.revisionAlignmentStatus;
  let revisionLimitationNote = "";
  if (revisionAlignmentStatus === "requires-regeneration") {
    revisionAlignmentStatus = "partial-repair";
    // The disclosure is only truthful for a correction that deliberately stayed inside the quoted
    // sentence. A Teacher-Guided Expansion or Model Paragraph already adds analytical content, so
    // attaching it there would contradict the revision the student is reading.
    const expansionRevision = ["Teacher-Guided Expansion", "Model Paragraph"].includes(revisionType);
    revisionLimitationNote = expansionRevision ? "" : buildRevisionLimitationNote(alignment.unresolvedTargets, context.reportLanguage);
    repairs.push({
      code: "REVISION_TARGETS_UNRESOLVED",
      unresolvedTargets: alignment.unresolvedTargets,
      paragraphLocation: record.location,
      revisionType,
      disclosed: Boolean(revisionLimitationNote)
    });
  }
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
    secondaryIssueCategories,
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
    targetedRevision: displayedRevision,
    revisionType: displayedRevisionType,
    revisionWithheld,
    repairTargets,
    repairedTargets: alignment.repairedTargets,
    unresolvedTargets: alignment.unresolvedTargets,
    revisionAlignmentStatus: revisionWithheld ? "withheld" : revisionAlignmentStatus,
    revisionAlignmentPass: alignment.pass,
    grammarValidationStatus: revisionQuality.grammarValidationStatus,
    semanticValidationStatus: revisionQuality.semanticValidationStatus,
    taskFidelityStatus: revisionQuality.taskFidelityStatus,
    languageSafetyStatus: revisionQuality.languageSafetyStatus,
    revisionTypeValidationStatus: revisionQuality.revisionTypeValidationStatus,
    revisionQualityProblems: revisionQuality.problems,
    revisionLimitationNote,
    whyRevisionIsStronger: revisionWithheld
      ? (String(context.reportLanguage || "").toLowerCase() === "th"
        ? "ระบบไม่แสดงประโยคตัวอย่างสำหรับจุดนี้ เพราะยังยืนยันความปลอดภัยของประโยคไม่ได้ครบทุกด้าน การเขียนแก้ด้วยตนเองตาม Student Action จะปลอดภัยกว่าการจำประโยคที่อาจมีข้อผิดพลาด"
        : "No model sentence is shown for this point because a fully safe version could not be verified. Rewriting it yourself from the Student Action is safer than memorising a sentence that may contain an error.")
      : revisionLimitationNote
        ? appendLimitationNote(card.whyRevisionIsStronger, revisionLimitationNote)
        : card.whyRevisionIsStronger,
    integrityRepairs: repairs,
    feedbackCardId: `card-${index + 1}`
  };
}

function buildRevisionLimitationNote(unresolvedTargets = [], reportLanguage = "") {
  const targets = [...new Set((unresolvedTargets || []).map((target) => String(target || "").trim()).filter(Boolean))];
  if (!targets.length) return "";
  const thai = String(reportLanguage || "").toLowerCase() === "th";
  const list = targets.join(", ");
  return thai
    ? `ฉบับแก้ไขนี้ซ่อมเฉพาะจุดที่แก้ได้อย่างปลอดภัยในประโยคที่ยกมา ส่วนประเด็นที่วินิจฉัยไว้ (${list}) ยังต้องให้นักเรียนเขียนขยายเอง ระบบจะไม่เขียนเนื้อหาส่วนนี้แทน`
    : `This revision repairs only what can be corrected safely inside the quoted sentence. The diagnosed point(s) (${list}) still require your own rewrite; the system does not write that content for you.`;
}

function appendLimitationNote(value, note) {
  const text = String(value || "").trim();
  if (!note) return text;
  if (text.includes(note)) return text;
  return text ? `${text} ${note}` : note;
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

function selectCanonicalTopIssueIds(topIssues, canonicalIssues, taskType, executiveText = "") {
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

  // Coverage guarantee: a paragraph the Executive Summary names as a score limiter must appear in
  // Top Issues. When the list is already full, the lowest-severity entry gives up its slot rather
  // than a minor repair displacing the paragraph the summary told the student to fix.
  const requiredLabels = executiveParagraphLabels(executiveText);
  const issueById = new Map(canonicalIssues.map((issue) => [issue.issueId, issue]));
  const covered = () => new Set(selected.map((id) => normalizeText(issueById.get(id)?.paragraphLabel)));
  for (const label of requiredLabels) {
    if (covered().has(normalizeText(label))) continue;
    const candidate = ranked.find((issue) => !selected.includes(issue.issueId) && normalizeText(issue.paragraphLabel) === normalizeText(label));
    if (!candidate) continue;
    if (selected.length < limit) {
      selected.push(candidate.issueId);
      continue;
    }
    let weakestIndex = -1;
    let weakestRank = Infinity;
    for (const [index, id] of selected.entries()) {
      const issue = issueById.get(id);
      const label2 = normalizeText(issue?.paragraphLabel);
      // Never evict an entry that is itself the only representative of a required paragraph.
      const soleCoverage = requiredLabels.some((required) =>
        normalizeText(required) === label2 &&
        selected.filter((other) => normalizeText(issueById.get(other)?.paragraphLabel) === label2).length === 1
      );
      if (soleCoverage) continue;
      const rank = severityRank(issue?.severity);
      if (rank < weakestRank) {
        weakestRank = rank;
        weakestIndex = index;
      }
    }
    if (weakestIndex >= 0 && weakestRank <= severityRank(candidate.severity)) selected[weakestIndex] = candidate.issueId;
  }
  return selected;
}

// When the Executive Summary names a development weakness (causal mechanism, example development,
// SAR) as a score limiter, at least one canonical issue must carry that weakness as its PRIMARY
// category — otherwise the student is told the main problem and then shown only language cards.
// The reclassification reuses the same detectors that classify ordinary diagnoses, applied to the
// executive text, so nothing here is tied to any topic or fixture.
function ensureExecutiveDevelopmentCoverage(issues, executiveText, taskType) {
  if (String(taskType || "") === "Task 1") return;
  const signal = detectDevelopmentSignal(normalizeText(executiveText));
  if (!signal) return;
  if (issues.some((issue) => DEVELOPMENT_ISSUE_CATEGORIES.includes(issue.issueCategory))) return;
  const labels = executiveParagraphLabels(executiveText);
  const candidates = issues.filter((issue) =>
    ["example", "explanation", "body_topic_sentence"].includes(issue.sentenceRole) &&
    (!labels.length || labels.some((label) => normalizeText(issue.paragraphLabel) === normalizeText(label))));
  const target = [...candidates].sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0];
  if (!target) return;
  const demoted = target.issueCategory;
  target.secondaryIssueCategories = [...new Set([
    ...(target.secondaryIssueCategories || []),
    ...(LANGUAGE_ISSUE_CATEGORIES.includes(demoted) ? [demoted] : [])
  ])].filter((label) => label !== signal);
  target.issueCategory = signal;
  if (["High-Band Refinement", "Pass / Strong", "Minor Repair"].includes(String(target.severity))) {
    target.severity = "Moderate";
  }
  target.integrityRepairs = [
    ...(target.integrityRepairs || []),
    { code: "EXECUTIVE_DEVELOPMENT_COVERAGE", from: demoted, to: signal, paragraphLocation: target.paragraphLocation }
  ];
}

export function executiveParagraphLabels(text) {
  const value = String(text || "");
  const labels = [];
  const bodyMatches = value.match(/Body Paragraph\s*(\d+)/gi) || [];
  for (const match of bodyMatches) {
    const index = match.match(/(\d+)/)?.[1];
    if (index) labels.push(`Body Paragraph ${index}`);
  }
  for (const [pattern, label] of [[/\bintroduction\b/i, "Introduction"], [/\boverview\b/i, "Overview"], [/\bconclusion\b/i, "Conclusion"]]) {
    if (pattern.test(value)) labels.push(label);
  }
  return [...new Set(labels)];
}

function buildParagraphCoverage({ paragraphs, canonicalIssues, paragraphFeedback, taskType, conclusionFunction = null }) {
  const guidance = Array.isArray(paragraphFeedback) ? paragraphFeedback : [];
  return paragraphs.map((paragraph) => {
    const issues = canonicalIssues.filter((issue) => issue.paragraphLabel === paragraph.role);
    const primary = [...issues].sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0];
    const legacy = guidance.find((item) => normalizeText(item.paragraphLocation).startsWith(normalizeText(paragraph.role)));
    // Status must reflect the weakest dimension in the paragraph. A paragraph carrying an unrepaired
    // development gap cannot be presented as "Mostly Controlled" while the summary calls it vague.
    const developmentGap = issues.some((issue) =>
      DEVELOPMENT_ISSUE_CATEGORIES.includes(issue.issueCategory) ||
      (Array.isArray(issue.unresolvedTargets) && issue.unresolvedTargets.length > 0)
    );
    const languageOnly = issues.length > 0 && issues.every((issue) => LANGUAGE_ISSUE_CATEGORIES.includes(issue.issueCategory));
    const routeIssue = issues.some((issue) => ["Body Route Alignment", "Thesis Route Clarity", "Position Clarity"].includes(issue.issueCategory));
    const base = capParagraphStatus(paragraphStatus(primary?.severity), developmentGap);
    const status = dimensionAwareParagraphStatus({ role: paragraph.role, base, languageOnly, developmentGap, routeIssue, conclusionFunction });
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

// Ordered highest-precedence first. Patterns are written against the way real diagnostic prose is
// phrased ("it ends with a comma", "needs grammatical closure", "needs precise ... language"),
// not against category names, because a provider rarely names the category it is describing.
const LANGUAGE_SIGNAL_RULES = [
  // A sentence that stops mid-clause is a completion defect, never a collocation defect.
  // Written every way real feedback phrases it, including "the comma ending makes the sentence
  // incomplete" where the noun and the adjective are separated.
  [/ends? (?:with|in) (?:a )?comma|comma ending|ending comma|unfinished|incomplete sentence|sentence[^.]{0,30}\bincomplete\b|\bincomplete\b[^.]{0,20}sentence|not a complete sentence|does not form a complete|sentence fragment|\bfragment\b|needs? (?:a )?(?:grammatical|proper|full|complete) closure|does not (?:close|finish|complete)|missing (?:a )?(?:full stop|period)|feels unfinished|no full stop/, "Sentence Completion"],
  [/\b(?:progressive|continuous)\b|\b(?:past|present|future) (?:simple|perfect|continuous|tense)\b|\bverb tense\b|\btenses?\b|\bverb form\b/, "Tense Control"],
  [/subject verb agreement|\bagreement\b.{0,30}\b(?:subject|verb)\b|\b(?:subject|verb)\b.{0,30}\bagreement\b/, "Subject–Verb Agreement"],
  [/\bmodal\b.{0,30}\bbase\b|\bafter a modal\b/, "Modal + Base Verb"],
  // "the combination is unnatural" describes a collocation, even when it names the parts of speech
  // involved, so it must outrank the bare word-class patterns below it.
  [/collocat|combination is unnatural|unnatural combination|unnatural pairing|does not collocate/, "Collocation"],
  [/word form|word formation|derivation|derived form|wrong form of the word/, "Word Form"],
  // Article outranks countability: "the article is missing before the singular countable noun"
  // is an article defect that merely mentions a countable noun.
  [/\barticles?\b|\bdefinite article\b|\bindefinite article\b/, "Article Control"],
  [/countab|uncountable|plural form|singular form/, "Countability"],
  [/\bprepositions?\b/, "Preposition Control"],
  [/\bpronouns?\b|\breferents?\b|reference (?:control|chain|word)|unclear reference/, "Reference Control"],
  [/punctuation|comma splice|run on sentence/, "Punctuation"],
  // Broadest language bucket last: imprecise, invented, vague or unnatural wording and terminology.
  [/word choice|invented word|non standard word|imprecise|unclear for|unnatural|vague (?:noun|phrase|wording|term)|vague|lexical precision|needs? (?:more )?(?:precise|cleaner|accurate)\b|cleaner terminology|terminology|examiner has to infer|distort/, "Lexical Precision"]
];

const CATEGORY_KEYWORDS = {
  "Tense Control": /\btenses?\b|progressive|continuous|past simple|present perfect|verb form/,
  "Subject–Verb Agreement": /agreement/,
  "Modal + Base Verb": /\bmodal\b/,
  "Article Control": /\barticles?\b/,
  "Preposition Control": /\bprepositions?\b/,
  "Countability": /countab|uncountable/,
  "Word Form": /word form|word formation|derivation/,
  "Collocation": /collocat/,
  "Reference Control": /\bpronouns?\b|\breferents?\b|\breference\b/,
  "Pronoun Control": /\bpronouns?\b/,
  "Punctuation": /punctuation|\bcomma\b|full stop/,
  "Lexical Precision": /lexical|word choice|precision|vocabulary|vague|imprecise/,
  "Word Choice": /word choice/,
  "Grammar and Sentence Control": /grammar|grammatical|sentence/,
  "Sentence Completion": /fragment|unfinished|incomplete/,
  "Academic Tone": /\btone\b|informal/,
  "Concision": /concis|wordy|redundan/,
  "Meaning Control": /meaning/
};

export function detectDevelopmentSignal(text) {
  const value = String(text || "");
  // An explicit SAR reference that asks for more always outranks the language wording around it.
  if (/\bsar\b|situation action result/.test(value) &&
    /incomplete|missing|weak|partial|undeveloped|underdeveloped|not (?:complete|shown|clear|full)|does not|should (?:specify|show|move|include)|needs? to (?:move|show|specify|include)|more accurately/.test(value)) return "SAR Example Quality";
  if (/weak bridge|bridge to the (?:policy|claim|argument|thesis) is (?:weak|missing|unclear)|does not (?:connect|link|bridge) (?:back )?to the (?:policy|thesis|claim|argument)/.test(value)) return "SAR Example Quality";
  // "the mechanism is not expressed naturally" is a wording problem, not a missing mechanism.
  // Only treat it as a development defect when the mechanism itself is absent or incomplete.
  const mechanismWordingOnly = /mechanism (?:is |was )?not (?:expressed|worded|phrased|stated|described|written|conveyed)/.test(value);
  if (!mechanismWordingOnly && (/(?:missing|incomplete|unclear|weak|vague|broken|absent|no|without) (?:causal )?(?:mechanism|chain)|mechanism.{0,60}(?:missing|incomplete|unclear|weak|vague|absent|broken|not (?:complete|shown|explained|developed))|causal (?:chain|link).{0,40}(?:incomplete|missing|unclear|broken)|does not (?:show|explain|complete).{0,40}(?:mechanism|chain|how )/.test(value))) return "Causal Mechanism";
  // Scope escalation: the result stays on one case and must reach a wider group or wider consequence.
  if (/(?:result|example|case|evidence).{0,80}(?:needs? to move|should move|move from|stays? (?:mostly )?(?:at|on)|does not fully connect|only one|single|one student|one person|one family|personal result).{0,80}(?:wider|broader|many|more|general|city|urban|pattern)|(?:wider|broader) (?:pattern|consequence|impact|group|urban)/.test(value)) return "Example Development";
  if (/example.{0,70}(?:too narrow|narrow|vague|generic|undeveloped|underdeveloped|not (?:fully )?developed|does not (?:prove|support|fully connect)|incomplete|needs? (?:a )?wider)|(?:narrow|vague|generic|undeveloped|underdeveloped) example|(?:affected group|consequence|wider impact).{0,50}(?:unclear|missing|vague|not (?:clear|shown|stated|identified))|does not (?:show|state|identify).{0,30}(?:affected group|consequence|wider impact)/.test(value)) return "Example Development";
  if (/explanation.{0,60}(?:missing|thin|shallow|insufficient|not (?:fully )?developed|too general|underdeveloped)|underdeveloped (?:reason|idea|argument)|reason is not (?:fully )?developed/.test(value)) return "Explanation Depth";
  return "";
}

export function detectLanguageSignal(text) {
  const value = String(text || "");
  return LANGUAGE_SIGNAL_RULES.find(([pattern]) => pattern.test(value))?.[1] || "";
}

// Task 2 argument-structure defects that are neither development gaps nor pure language slips:
// the controlling sentence misstates the policy, or states it too vaguely to control the paragraph.
export function detectTask2StructureSignal(text) {
  const value = String(text || "");
  if (/(?:does not|doesn t|fails? to) accurately describe the (?:prompt|policy|proposal|task)|policy (?:mechanism|action|description) (?:is )?(?:inaccurate|not accurate|misstated|described inaccurately)|misdescribes the (?:policy|prompt|proposal)|keep the (?:original )?policy mechanism accurate|not (?:the )?(?:policy|proposal) (?:in|from) the prompt/.test(value)) {
    return "Policy Mechanism Accuracy";
  }
  if (/(?:topic|controlling) sentence.{0,80}(?:needs?|requires?|lacks?|is)\s*(?:more )?(?:precise|precision|accurate|clearer|clarity|specific|vague|imprecise|unclear|natural)|needs? (?:more )?precise (?:cause |policy |facility |zoning )?wording|policy mechanism is not expressed (?:naturally|clearly)/.test(value)) {
    return "Topic Sentence Precision";
  }
  return "";
}

// A category may only head a card whose task type owns it.
export function categoryAllowedForTask(category, taskType) {
  const name = String(category || "");
  if (!name) return false;
  if (String(taskType || "") === "Task 1") return !TASK2_ONLY_CATEGORIES.includes(name);
  return !TASK1_ONLY_CATEGORIES.includes(name);
}

function stripCategoryEchoes(text, card = {}) {
  let value = String(text || "");
  for (const label of [card.issueCategory, card.issueType]) {
    const clean = normalizeText(label);
    if (!clean) continue;
    value = value.split(clean).join(" ");
  }
  return value.replace(/\s+/g, " ").trim();
}

function detectDiagnosedLanguageCategory(card = {}) {
  const diagnosedCategories = normalizeText([
    ...(Array.isArray(card.revisionIntegrity?.diagnosedCategories) ? card.revisionIntegrity.diagnosedCategories : []),
    ...(Array.isArray(card.revisionIntegrity?.originalIssueCategories) ? card.revisionIntegrity.originalIssueCategories : [])
  ].join(" "));
  const diagnosedCategoryRules = [
    [/countability|countable/, "Countability"],
    [/preposition/, "Preposition Control"],
    [/article/, "Article Control"],
    [/tense|progressive|continuous/, "Tense Control"],
    [/reference|pronoun/, "Reference Control"],
    [/word form|derivation/, "Word Form"],
    [/collocation/, "Collocation"],
    [/punctuation/, "Punctuation"],
    [/grammar|sentence control/, "Grammar and Sentence Control"]
  ];
  return diagnosedCategoryRules.find(([pattern]) => pattern.test(diagnosedCategories))?.[1] || "";
}

function diagnosisSignals(card = {}) {
  const corpus = normalizeText([
    card.diagnosis, card.kruPomDiagnosis, card.whyItLimitsBand, card.issueSubtype
  ].filter(Boolean).join(" "));
  const stripped = stripCategoryEchoes(corpus, card);
  return {
    stripped,
    developmentSignal: detectDevelopmentSignal(stripped),
    languageSignal: detectLanguageSignal(stripped),
    structureSignal: detectTask2StructureSignal(stripped)
  };
}

function normalizeIssueCategory(value, card = {}, taskType = "") {
  const { stripped, developmentSignal, languageSignal, structureSignal } = diagnosisSignals(card);
  const task2 = String(taskType || "") !== "Task 1";
  const usableStructureSignal = task2 ? structureSignal : "";
  const diagnosedLanguageCategory = detectDiagnosedLanguageCategory(card);
  if (diagnosedLanguageCategory && !developmentSignal) {
    if (languageSignal && languageSignal !== diagnosedLanguageCategory && !(CATEGORY_KEYWORDS[diagnosedLanguageCategory]?.test(stripped))) {
      return languageSignal;
    }
    return diagnosedLanguageCategory;
  }
  const explicitCategory = String(value || "").trim();
  if (ISSUE_TAXONOMY.includes(explicitCategory)) {
    // A category owned by the other task type can never be right for this card.
    if (taskType && !categoryAllowedForTask(explicitCategory, taskType)) {
      return usableStructureSignal || developmentSignal || languageSignal || (task2 ? "Topic Sentence Precision" : "Data Selection");
    }
    if (LANGUAGE_ISSUE_CATEGORIES.includes(explicitCategory)) {
      if (developmentSignal) return developmentSignal;
      if (usableStructureSignal) return usableStructureSignal;
      if (languageSignal && languageSignal !== explicitCategory && !(CATEGORY_KEYWORDS[explicitCategory]?.test(stripped))) {
        return languageSignal;
      }
    }
    return explicitCategory;
  }
  if (developmentSignal) return developmentSignal;
  if (usableStructureSignal) return usableStructureSignal;
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
    [/causal mechanism|causal chain|missing mechanism|incomplete mechanism/, "Causal Mechanism"],
    [/explanation|mechanism|development/, "Explanation Depth"],
    [/body route|topic sentence|route alignment/, "Body Route Alignment"],
    [/thesis route|thesis/, "Thesis Route Clarity"],
    [/position|stance/, "Position Clarity"],
    [/prompt coverage|missing prompt/, "Prompt Coverage"],
    [/sentence completion|fragment|unfinished sentence/, "Sentence Completion"],
    [/punctuation|comma|full stop|period/, "Punctuation"],
    [/\btenses?\b|progressive|continuous/, "Tense Control"],
    [/subject verb agreement/, "Subject–Verb Agreement"],
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

function alignIssueCategoryClaims(value, card, issueCategory, preservedLabels = []) {
  let text = String(value || "");
  const preserved = new Set(preservedLabels.map((label) => normalizeText(label)));
  for (const candidate of [card.issueCategory, card.issueType]) {
    const original = String(candidate || "").trim();
    if (!original || normalizeText(original) === normalizeText(issueCategory) || preserved.has(normalizeText(original))) continue;
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

function capParagraphStatus(status, developmentGap) {
  if (!developmentGap) return status;
  return ["Strong", "Mostly Controlled"].includes(status) ? "Moderate" : status;
}

// One combined word ("Moderate") hides which dimension is weak. Kru Pom's standard separates the
// paragraph's function/route, its development, and its language: a conclusion whose function is
// complete but whose wording needs repair must not read the same as a conclusion that fails to
// close the essay. Serious statuses (Critical / Needs Work) always pass through unchanged.
function dimensionAwareParagraphStatus({ role, base, languageOnly, developmentGap, routeIssue, conclusionFunction }) {
  if (["Critical", "Needs Work"].includes(base)) return base;
  if (routeIssue) return base;
  const body = /^Body Paragraph/.test(String(role));
  if (String(role) === "Conclusion" && languageOnly && conclusionFunction?.status === "Strong") {
    return "Functionally Strong — Language Repair Needed";
  }
  if (body && developmentGap) return "Route Aligned — Development Moderate";
  if (String(role) === "Introduction" && languageOnly) return "Structurally Strong — Language Repair Needed";
  if (body && languageOnly) return "Function Controlled — Language Repair Needed";
  if (String(role) === "Overview" && languageOnly) return "Functionally Controlled — Language Repair Needed";
  return base;
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

function contentWords(value) {
  return (normalizeText(value).match(/[\p{L}\p{N}]+/gu) || []).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}
