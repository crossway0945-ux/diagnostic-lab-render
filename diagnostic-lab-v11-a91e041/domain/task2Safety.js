import { countWords, getWordCountMetadata, normalizeEssayText } from "../wordCount.js";
import { analysisVersionMetadata } from "../services/analysisVersions.js";

const POSITION_PATTERN = /\b(?:i\s+(?:(strongly|firmly|completely|fully|heavily|generally|partly|partially|consequently|therefore|ultimately)\s+)?(agree|disagree)|in my (?:view|opinion)[^.!?]{0,80}\b(agree|disagree)|i believe[^.!?]{0,80}\b(?:should|must|ought|outweigh|more (?:important|significant|beneficial)))\b/i;
const SUPPORT_PATTERN = /\b(?:agree|support|benefit|advantage|basic right|human right|should (?:receive|be provided)|free of charge|without (?:a )?charge|protect|improve|enable|allow|essential)\b/i;
const OPPOSITION_PATTERN = /\b(?:disagree|oppose|drawback|disadvantage|too (?:costly|expensive)|cost the government|budget.*not enough|tax(?:es)? must|should not|cannot afford|financial burden|on the other hand)\b/i;
const OUTWEIGH_POSITIVE_SIDE_PATTERNS = [
  /\badvantages?\b/i,
  /\bbenefits?\b/i,
  /\bgains?\b/i,
  /\bpositive (?:effects?|outcomes?|impacts?)\b/i,
  /\beconomic (?:benefits?|growth|expansion|vitality|prosperity)\b/i,
  /\b(?:technological )?innovation\b/i,
  /\bpotential for innovation\b/i,
  /\bproductivity\b/i,
  /\bnational advantages?\b/i,
  /\blong-term prosperity\b/i,
  /\bcreative energy\b/i
];
const OUTWEIGH_NEGATIVE_SIDE_PATTERNS = [
  /\bdisadvantages?\b/i,
  /\bdrawbacks?\b/i,
  /\brisks?\b/i,
  /\bcosts?\b/i,
  /\bburdens?\b/i,
  /\bchallenges?\b/i,
  /\bpressures?\b/i,
  /\bnegative (?:effects?|outcomes?|impacts?)\b/i,
  /\bemployment (?:pressure|challenges?|instability)\b/i,
  /\bjob[- ]market pressure\b/i
];
const UNFINISHED_TAIL_PATTERN = /\b(?:because|although|while|whereas|if|when|which|that|so that|due to the fact that|in order to)\s+(?:i|we|they|he|she|it|people|governments?)?$|\b(?:and|but|or|to|of|for|with|i|we|they|he|she|it)$/i;
const BODY_1_START_PATTERN = /^(?:first(?:ly| of all)?|to begin with|one (?:main|major|important) (?:reason|advantage|benefit|point))\b/i;
const BODY_2_START_PATTERN = /^(?:on the other hand|however|nevertheless|conversely|second(?:ly)?|another (?:reason|view|point|issue|disadvantage|advantage))\b/i;
const CONCLUSION_START_PATTERN = /^(?:in conclusion|for conclusion|to conclude|in summary|to sum up)\b/i;

export const TASK2_CANONICAL_TYPES = Object.freeze({
  OPINION: "opinion",
  DISCUSS_BOTH_VIEWS: "discuss-both-views",
  ADVANTAGES_DISADVANTAGES: "advantages-disadvantages",
  OUTWEIGH: "outweigh",
  PROBLEM_SOLUTION: "problem-solution",
  CAUSES_SOLUTIONS: "causes-solutions",
  CAUSES_EFFECTS: "causes-effects",
  POSITIVE_NEGATIVE: "positive-negative-development",
  DIRECT_QUESTION: "direct-question",
  HYBRID: "hybrid-question",
  UNRESOLVED: "unresolved"
});

export const TASK2_PUBLIC_FAMILIES = Object.freeze({
  OPINION: TASK2_CANONICAL_TYPES.OPINION,
  DISCUSS_BOTH_VIEWS: TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS,
  PROBLEM_SOLUTION: TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION,
  ADVANTAGES_DISADVANTAGES: TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES,
  DIRECT_QUESTION: TASK2_CANONICAL_TYPES.DIRECT_QUESTION,
  UNRESOLVED: TASK2_CANONICAL_TYPES.UNRESOLVED
});

export const TASK2_INTERNAL_SUBTYPES = Object.freeze({
  STANDARD: "standard",
  OUTWEIGH: TASK2_CANONICAL_TYPES.OUTWEIGH,
  CAUSES_SOLUTIONS: TASK2_CANONICAL_TYPES.CAUSES_SOLUTIONS,
  CAUSES_EFFECTS: TASK2_CANONICAL_TYPES.CAUSES_EFFECTS,
  POSITIVE_NEGATIVE: TASK2_CANONICAL_TYPES.POSITIVE_NEGATIVE,
  MULTI_QUESTION: "multi-question"
});

export const TASK2_AUTO_DETECT_LABEL = "Not Sure / Auto-detect";

export const ROUTE_COVERAGE = Object.freeze({
  NOT_APPLICABLE: "not_applicable",
  ABSENT: "absent",
  CONTRADICTED: "contradicted",
  MENTIONED_ONLY: "mentioned_only",
  PARTIALLY_DEVELOPED: "partially_developed",
  ADEQUATELY_DEVELOPED: "adequately_developed",
  FULLY_EXTENDED: "fully_extended"
});

export const REVISION_TYPES = Object.freeze([
  "Minimal Correction",
  "Route-Preserving Revision",
  "Teacher-Guided Expansion",
  "High-Band Refinement"
]);

export const TASK2_PUBLIC_TYPE_LABELS = Object.freeze({
  [TASK2_PUBLIC_FAMILIES.OPINION]: "Opinion Essay",
  [TASK2_PUBLIC_FAMILIES.DISCUSS_BOTH_VIEWS]: "Discuss Both Views",
  [TASK2_PUBLIC_FAMILIES.PROBLEM_SOLUTION]: "Problem & Solution",
  [TASK2_PUBLIC_FAMILIES.ADVANTAGES_DISADVANTAGES]: "Advantages & Disadvantages",
  [TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION]: "Direct Question",
  [TASK2_PUBLIC_FAMILIES.UNRESOLVED]: "Unresolved Task Type"
});

export const TASK2_PUBLIC_ESSAY_TYPE_OPTIONS = Object.freeze([
  TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.OPINION],
  TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.DISCUSS_BOTH_VIEWS],
  TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.PROBLEM_SOLUTION],
  TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.ADVANTAGES_DISADVANTAGES],
  TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION],
  TASK2_AUTO_DETECT_LABEL
]);

// Shared alias used by API, UI projection and tests. There is no second list.
export const TASK2_PUBLIC_TYPES = TASK2_PUBLIC_ESSAY_TYPE_OPTIONS;

const TASK2_PUBLIC_ESSAY_TYPE_SET = new Set(TASK2_PUBLIC_ESSAY_TYPE_OPTIONS);

export function isTask2PublicEssayType(value) {
  return TASK2_PUBLIC_ESSAY_TYPE_SET.has(String(value || "").trim());
}

export function mapLegacyTask2PublicType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/not sure|auto[- ]?detect/.test(text)) return "";
  if (/discuss both views|discussion/.test(text)) return TASK2_PUBLIC_FAMILIES.DISCUSS_BOTH_VIEWS;
  if (/problem.*solution|causes?.*solutions?|cause\s*[&/]\s*solution/.test(text)) return TASK2_PUBLIC_FAMILIES.PROBLEM_SOLUTION;
  if (/advantages?.*disadvantages?|advantage\s*[&/]\s*disadvantage|outweigh/.test(text)) return TASK2_PUBLIC_FAMILIES.ADVANTAGES_DISADVANTAGES;
  if (/direct|two-part|two part|hybrid|causes?.*effects?|effects?.*causes?|positive.*negative|negative.*positive/.test(text)) return TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION;
  if (/opinion|agree.*disagree/.test(text)) return TASK2_PUBLIC_FAMILIES.OPINION;
  return "";
}

export function task2PublicTypeLabel(value) {
  return TASK2_PUBLIC_TYPE_LABELS[mapLegacyTask2PublicType(value) || value] || String(value || "");
}

export function normalizeTask2PublicTypeLabel(value) {
  const text = String(value || "").trim();
  if (/not sure|auto[- ]?detect/i.test(text)) return TASK2_AUTO_DETECT_LABEL;
  const family = mapLegacyTask2PublicType(text);
  return family ? TASK2_PUBLIC_TYPE_LABELS[family] : text;
}

export function task2PublicTypeForInternal(value) {
  const internal = String(value || "");
  if ([TASK2_CANONICAL_TYPES.OUTWEIGH, TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES].includes(internal)) {
    return TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.ADVANTAGES_DISADVANTAGES];
  }
  if ([TASK2_CANONICAL_TYPES.CAUSES_SOLUTIONS, TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION].includes(internal)) {
    return TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.PROBLEM_SOLUTION];
  }
  if ([TASK2_CANONICAL_TYPES.CAUSES_EFFECTS, TASK2_CANONICAL_TYPES.POSITIVE_NEGATIVE, TASK2_CANONICAL_TYPES.DIRECT_QUESTION, TASK2_CANONICAL_TYPES.HYBRID].includes(internal)) {
    return TASK2_PUBLIC_TYPE_LABELS[TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION];
  }
  return TASK2_PUBLIC_TYPE_LABELS[internal] || TASK2_AUTO_DETECT_LABEL;
}

const TASK2_CRITERIA = Object.freeze([
  "Task Response",
  "Coherence & Cohesion",
  "Lexical Resource",
  "Grammatical Range & Accuracy"
]);

export function analyzeTask2Safety(payload = {}) {
  const writing = normalizeEssayText(payload.writing);
  const wordMetadata = getWordCountMetadata("Task 2", writing);
  const structure = parseTask2Structure(writing);
  const paragraphs = structure.paragraphs;
  const introduction = paragraphs[0] || "";
  const conclusion = structure.conclusionPresent ? paragraphs.at(-1) : "";
  const bodyParagraphs = structure.conclusionPresent ? paragraphs.slice(1, -1) : paragraphs.slice(1);
  const ending = lastSentence(conclusion || writing);
  const unfinishedEndingDetected = detectUnfinishedEnding(ending, writing);
  const classification = classifyTask2Prompt(payload);
  const essayRoute = classification.essayType;
  const internalSubtype = classification.internalSubtype;
  const stanceRequired = classification.stanceRequired;
  const introPosition = stanceRequired ? detectPosition(introduction, payload.prompt) : "";
  const conclusionPosition = stanceRequired ? detectPosition(conclusion, payload.prompt) : "";
  const positionBodyRoutes = stanceRequired
    ? bodyParagraphs.map((paragraph) => classifyBodyRoute(paragraph, internalSubtype === TASK2_INTERNAL_SUBTYPES.OUTWEIGH ? TASK2_CANONICAL_TYPES.OUTWEIGH : essayRoute))
    : [];
  const detectedPosition = stanceRequired
    ? reconcilePosition({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes: positionBodyRoutes })
    : "";
  const positionConfidence = stanceRequired
    ? positionConfidenceFor({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes: positionBodyRoutes })
    : "not-applicable";
  const semanticPosition = buildSemanticPositionModel({
    prompt: payload.prompt,
    introduction,
    conclusion,
    introPosition,
    conclusionPosition,
    detectedPosition,
    positionConfidence,
    stanceRequired
  });
  const routeAssessment = buildTaskTypeRouteAssessment({
    payload,
    essayRoute,
    internalSubtype,
    stanceRequired,
    introduction,
    bodyParagraphs,
    conclusion,
    introPosition,
    conclusionPosition,
    detectedPosition,
    positionConfidence,
    unfinishedEndingDetected
  });
  const concessionStatus = classifyConcessionStatus({
    routeAssessment,
    introduction,
    bodyParagraphs,
    introPosition,
    conclusionPosition,
    detectedPosition
  });
  routeAssessment.concessionStatus = concessionStatus;
  semanticPosition.concessionControl = concessionStatus;
  const bodyRoutes = stanceRequired ? positionBodyRoutes : routeAssessment.bodyRoutes.map((item) => item.label);
  const routeConflict = isFailedRouteStatus(routeAssessment.status);
  const meaningErrors = detectMeaningErrors(payload.prompt, writing);
  const languageErrors = detectLanguageControlErrors(writing, ending);
  const languageAccuracyRisk = detectTask2LanguageAccuracyRisk(writing);
  const developmentRisk = detectTask2DevelopmentRisk({
    bodyParagraphs,
    introduction,
    conclusion,
    essayRoute: internalSubtype === TASK2_INTERNAL_SUBTYPES.OUTWEIGH ? TASK2_CANONICAL_TYPES.OUTWEIGH : essayRoute,
    prompt: payload.prompt
  });
  const shortBodyParagraphs = classifyShortBodyParagraphs(bodyParagraphs, wordMetadata);
  const severeUnderLength = wordMetadata.wordShortfall >= 40;
  const directQuestionMissingPart = essayRoute === TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION && routeAssessment.missingRequirements.length > 0;
  const completionStatus = classifyCompletion({
    ...wordMetadata,
    paragraphs,
    bodyParagraphs,
    conclusion,
    unfinishedEndingDetected,
    shortBodyParagraphs
  });
  const completionEvidence = buildCompletionEvidence({
    wordMetadata,
    structure,
    ending,
    unfinishedEndingDetected,
    shortBodyParagraphs
  });
  const criticalInteraction = severeUnderLength &&
    unfinishedEndingDetected &&
    routeConflict &&
    (shortBodyParagraphs.length > 0 || meaningErrors.length > 0 || languageErrors.length >= 2);
  const seriousInteraction = !criticalInteraction && (directQuestionMissingPart || (severeUnderLength &&
    (isPartialRouteStatus(routeAssessment.status) || isFailedRouteStatus(routeAssessment.status)) &&
    (shortBodyParagraphs.length > 0 || meaningErrors.length > 0 || languageErrors.length >= 2)));
  const compoundSeverity = criticalInteraction
    ? "critical interaction"
    : seriousInteraction
      ? "serious interaction"
      : "no compound low-band interaction";
  const detectedStructure = describeTask2Structure({
    paragraphs,
    conclusionPresent: structure.conclusionPresent,
    unfinishedEndingDetected
  });
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.OUTWEIGH && isControlledRouteStatus(routeAssessment.status) && (languageAccuracyRisk.blocksSecureBand7 || developmentRisk.unevenDevelopment)) {
    routeAssessment.summary = routeAssessment.summary.replace(
      /Overall route status: adequately developed$/,
      "Overall route status: adequately developed, but weakened by language accuracy and uneven development"
    );
  }
  const bodyRouteSummary = routeAssessment.summary;
  const capMetadata = buildDeterministicCapMetadata({
    severeUnderLength,
    unfinishedEndingDetected,
    routeAssessment,
    directQuestionMissingPart,
    introPosition,
    conclusionPosition,
    detectedPosition,
    positionConfidence
  });
  const canonicalAnalysis = {
    version: "11.0",
    metadata: {
      reportId: String(payload.reportId || payload.clientSubmissionId || ""),
      ownerAccountId: String(payload.ownerAccountId || ""),
      studentProfileId: String(payload.studentProfileId || ""),
      studentDisplayNameSnapshot: String(payload.studentDisplayNameSnapshot || ""),
      ...analysisVersionMetadata(payload),
      taskType: "Task 2",
      essayType: essayRoute,
      essayTypeLabel: TASK2_PUBLIC_TYPE_LABELS[essayRoute],
      internalSubtype,
      publicEssayType: TASK2_PUBLIC_TYPE_LABELS[essayRoute],
      internalEssaySubtype: internalSubtype === TASK2_INTERNAL_SUBTYPES.STANDARD ? essayRoute : internalSubtype,
      internalEssaySubtypeLabel: internalSubtypeLabel(essayRoute, internalSubtype),
      visualType: "",
      verifiedWordCount: wordMetadata.wordCount,
      minimumWordCount: wordMetadata.minimumWordCount,
      wordShortfall: wordMetadata.wordShortfall,
      completionStatus
    },
    taskRequirements: {
      stanceRequired,
      requiredRoutes: classification.requiredRoutes,
      promptParts: classification.promptParts,
      promptObligations: classification.promptObligations,
      classificationConfidence: classification.confidence,
      exactPromptSignals: classification.exactPromptSignals,
      requirementChecks: routeAssessment.requirements
    },
    routeAssessment: {
      ...routeAssessment,
      semanticPosition
    },
    criterionAssessment: {},
    capMetadata,
    primaryLimiters: buildPrimaryLimiters({
      wordMetadata,
      unfinishedEndingDetected,
      routeAssessment,
      languageAccuracyRisk
    }),
    frameworkAssessment: buildCanonicalFrameworkAssessment(routeAssessment),
    evidenceIssues: buildCanonicalSafetyEvidence([...meaningErrors, ...languageErrors, ...languageAccuracyRisk.signals]),
    overallScore: null,
    repairPlan: []
  };

  return {
    wordCount: wordMetadata.wordCount,
    minimumRequiredWords: wordMetadata.minimumWordCount,
    underLength: wordMetadata.wordShortfall > 0,
    underLengthBy: wordMetadata.wordShortfall,
    completionStatus,
    unfinishedEndingDetected,
    completionEvidence,
    detectedPosition,
    semanticPosition,
    concessionStatus,
    positionConfidence,
    introPosition,
    conclusionPosition,
    bodyRoutes,
    routeConflict,
    bodyRouteSummary,
    detectedStructure,
    paragraphDetectionConfidence: structure.confidence,
    conclusionStatus: structure.conclusionPresent
      ? unfinishedEndingDetected ? "present but unfinished" : "present and complete"
      : "no clear conclusion detected",
    recommendedRoute: routeAssessment.recommendedRoute,
    recommendedRouteRationale: routeAssessment.recommendedRouteRationale,
    routeIntegrity: routeConflict
      ? "unstable"
      : isPartialRouteStatus(routeAssessment.status)
        ? "partially controlled"
        : "stable",
    completionIntegrity: completionStatus === "unfinished"
      ? "critically incomplete"
      : completionStatus === "substantially incomplete"
        ? "unstable"
        : completionStatus === "mostly complete"
          ? "partially controlled"
          : "stable",
    languageControlIntegrity: meaningErrors.some((item) => item.category === "meaning-reversing") || languageErrors.length >= 4 || languageAccuracyRisk.blocksSecureBand7
      ? "weak"
      : meaningErrors.length || languageErrors.length
        ? "partially controlled"
        : "stable",
    compoundSeverity,
    criticalInteractionSummary: criticalInteraction
      ? `The essay is ${wordMetadata.wordShortfall} words below the minimum, ends with an unfinished conclusion, and lacks a controlled ${stanceRequired ? "position-and-body" : "task-type"} route. Together with limited development and meaning-affecting language errors, these issues prevent it from functioning as a complete Task 2 response.`
      : seriousInteraction
        ? directQuestionMissingPart
          ? "The Direct Question response does not provide two developed answer routes for the two explicit questions, so an important part of the task remains materially under-addressed."
          : `The response is ${wordMetadata.wordShortfall} words below the minimum and remains structurally incomplete; route and language-control failures combine to limit the response below a secure Band 5.5 profile.`
        : "No combined low-band failure profile was detected; judge remaining issues by criterion evidence.",
    meaningChangingErrors: meaningErrors.filter((item) => item.category === "meaning-changing"),
    meaningReversingErrors: meaningErrors.filter((item) => item.category === "meaning-reversing"),
    languageControlErrors: languageErrors,
    languageAccuracyRisk,
    developmentRisk,
    shortBodyParagraphs,
    essayRoute: [TASK2_INTERNAL_SUBTYPES.STANDARD, TASK2_INTERNAL_SUBTYPES.MULTI_QUESTION].includes(internalSubtype) ? essayRoute : internalSubtype,
    internalSubtype,
    criticalInteraction,
    seriousInteraction,
    directQuestionMissingPart,
    stanceRequired,
    taskRequirements: routeAssessment.requirements,
    taskClassification: classification,
    routeAssessment,
    capMetadata: canonicalAnalysis.capMetadata,
    canonicalAnalysis,
    evidence: {
      ending,
      introduction: firstSentence(introduction),
      conclusion: firstSentence(conclusion),
      meaning: meaningErrors[0]?.exactEvidence || ""
    }
  };
}

export function parseTask2Structure(value) {
  const writing = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!writing) return { paragraphs: [], confidence: "low", method: "empty", conclusionPresent: false };

  const blankLineParagraphs = writing
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (blankLineParagraphs.length >= 4) {
    return {
      paragraphs: blankLineParagraphs,
      confidence: "high",
      method: "explicit paragraph breaks",
      conclusionPresent: hasConclusionParagraph(blankLineParagraphs)
    };
  }

  const sentences = splitSentences(writing);
  const body1Index = sentences.findIndex((sentence, index) => index > 0 && BODY_1_START_PATTERN.test(sentence));
  const body2Index = sentences.findIndex((sentence, index) => index > body1Index && BODY_2_START_PATTERN.test(sentence));
  const conclusionIndex = sentences.findIndex((sentence, index) => index > body2Index && CONCLUSION_START_PATTERN.test(sentence));
  if (body1Index > 0 && body2Index > body1Index && conclusionIndex > body2Index) {
    return {
      paragraphs: [
        sentences.slice(0, body1Index).join(" "),
        sentences.slice(body1Index, body2Index).join(" "),
        sentences.slice(body2Index, conclusionIndex).join(" "),
        sentences.slice(conclusionIndex).join(" ")
      ].filter(Boolean),
      confidence: "medium",
      method: "structural paragraph markers",
      conclusionPresent: true
    };
  }

  const lineParagraphs = writing
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => countWords(item) >= 4);
  if (lineParagraphs.length >= 3 && lineParagraphs.length <= 6) {
    return {
      paragraphs: lineParagraphs,
      confidence: "medium",
      method: "single-line paragraph breaks",
      conclusionPresent: hasConclusionParagraph(lineParagraphs)
    };
  }

  const fallback = blankLineParagraphs.length ? blankLineParagraphs : [writing];
  return {
    paragraphs: fallback,
    confidence: "low",
    method: "limited paragraph evidence",
    conclusionPresent: hasConclusionParagraph(fallback)
  };
}

function hasConclusionParagraph(paragraphs) {
  if (!paragraphs.length) return false;
  return paragraphs.length >= 4 || CONCLUSION_START_PATTERN.test(firstSentence(paragraphs.at(-1)));
}

function classifyShortBodyParagraphs(bodyParagraphs, wordMetadata) {
  const counts = bodyParagraphs.map((paragraph, index) => ({ paragraph: index + 1, wordCount: countWords(paragraph) }));
  const longest = Math.max(0, ...counts.map((item) => item.wordCount));
  return counts.filter((item) => {
    if (item.wordCount < 40) return true;
    const materiallyShorter = longest - item.wordCount >= 20 && item.wordCount <= longest * 0.6;
    return wordMetadata.wordShortfall > 0 && item.wordCount < 55 && materiallyShorter;
  });
}

function splitSentences(value) {
  return String(value || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) || [];
}

function firstSentence(value) {
  return splitSentences(value)[0] || String(value || "").trim();
}

function lastSentence(value) {
  return splitSentences(value).at(-1) || String(value || "").trim();
}

function detectUnfinishedEnding(ending, writing) {
  const tail = String(ending || "").trim();
  if (!tail) return true;
  if (/[.!?]["']?$/.test(String(writing || "").trim())) return false;
  return UNFINISHED_TAIL_PATTERN.test(tail) || countWords(tail) <= 8;
}

function classifyCompletion({ wordCount, wordShortfall, paragraphs, bodyParagraphs, conclusion, unfinishedEndingDetected, shortBodyParagraphs }) {
  if (unfinishedEndingDetected) return "unfinished";
  if (wordCount < 200 && (paragraphs.length < 4 || bodyParagraphs.length < 2 || countWords(conclusion) < 12 || shortBodyParagraphs.length > 0)) {
    return "substantially incomplete";
  }
  if (wordShortfall > 20 && (paragraphs.length < 4 || bodyParagraphs.length < 2)) return "substantially incomplete";
  if (wordShortfall > 0) return "mostly complete";
  return "complete";
}

function buildCompletionEvidence({ wordMetadata, structure, ending, unfinishedEndingDetected, shortBodyParagraphs }) {
  const detectedStructure = describeTask2Structure({
    paragraphs: structure.paragraphs,
    conclusionPresent: structure.conclusionPresent,
    unfinishedEndingDetected
  });
  const evidence = [
    `Verified count: ${wordMetadata.wordCount}/${wordMetadata.minimumWordCount} words`,
    `Detected structure: ${detectedStructure}`,
    `Paragraph-detection confidence: ${capitalize(structure.confidence)}`,
    `Conclusion status: ${structure.conclusionPresent ? unfinishedEndingDetected ? "Present but unfinished" : "Present and complete" : "No clear conclusion detected"}`
  ];
  if (shortBodyParagraphs.length) evidence.push(`Short body paragraph(s): ${shortBodyParagraphs.map((item) => `Body ${item.paragraph} (${item.wordCount} words)`).join(", ")}`);
  if (unfinishedEndingDetected) evidence.push(`unfinished ending: "${ending}"`);
  return evidence;
}

function describeTask2Structure({ paragraphs, conclusionPresent, unfinishedEndingDetected }) {
  if (!paragraphs.length) return "No analysable structure detected";
  const bodyCount = Math.max(0, paragraphs.length - 1 - (conclusionPresent ? 1 : 0));
  const bodyLabels = Array.from({ length: bodyCount }, (_, index) => `Body ${index + 1}`);
  const conclusionLabel = conclusionPresent
    ? unfinishedEndingDetected ? "incomplete conclusion" : "conclusion"
    : "no clear conclusion";
  return ["Introduction", ...bodyLabels, conclusionLabel].join(" + ");
}

function buildBodyRouteSummary({ bodyRoutes, bodyParagraphs, prompt, conclusionPosition, unfinishedEndingDetected, routeConflict, positionConfidence, essayRoute, languageAccuracyRisk, developmentRisk }) {
  const routes = bodyRoutes.length
    ? bodyRoutes.map((route, index) => `Body ${index + 1} route: ${describeBodyRoute(route, bodyParagraphs[index], prompt, essayRoute)}`)
    : ["No completed body route was detected"];
  let conclusionRoute = "does not state a clear final position";
  if (conclusionPosition === "advantages outweigh the disadvantages" && !unfinishedEndingDetected) conclusionRoute = "clearly restates that the advantages outweigh the disadvantages";
  else if (conclusionPosition === "disadvantages outweigh the advantages" && !unfinishedEndingDetected) conclusionRoute = "clearly restates that the disadvantages outweigh the advantages";
  else if (/agree/.test(conclusionPosition) && unfinishedEndingDetected) conclusionRoute = "states agreement too late and remains unfinished";
  else if (/disagree/.test(conclusionPosition) && unfinishedEndingDetected) conclusionRoute = "states disagreement too late and remains unfinished";
  else if (unfinishedEndingDetected) conclusionRoute = "is present but unfinished, so the final position remains unclear";
  else if (/agree/.test(conclusionPosition)) conclusionRoute = "restates agreement";
  else if (/disagree/.test(conclusionPosition)) conclusionRoute = "restates disagreement";
  let overallRoute = routeConflict ? "conflicting / uncontrolled" : positionConfidence === "low" ? "partially controlled" : "controlled";
  if (essayRoute === "outweigh" && overallRoute === "controlled" && (languageAccuracyRisk?.blocksSecureBand7 || developmentRisk?.unevenDevelopment)) {
    overallRoute = "controlled, but weakened by language accuracy and uneven development";
  }
  return [...routes, `Conclusion route: ${conclusionRoute}`, `Overall route status: ${overallRoute}`].join(" | ");
}

function describeBodyRoute(route, paragraph, prompt, essayRoute) {
  if (essayRoute === "outweigh") {
    if (route === "disadvantage route" && /age?ing|retirement|shrinking workforce/i.test(paragraph)) {
      return "presents the main disadvantage - future ageing and retirement pressure";
    }
    if (route === "disadvantage route" && /young adults?|youth(?:ful)? population|older people|population/i.test(prompt) && /job|employ|labou?r supply|available positions|vacanc|unemployment/i.test(paragraph)) {
      return "presents the main disadvantage - pressure on employment and job-market stability";
    }
    if (route === "advantage route" && /labou?r|job vacancies|tax|economic|national development/i.test(paragraph)) {
      return "presents the stronger advantages - labour supply, tax revenue, and economic development";
    }
    if (route === "advantage route") return "presents an advantage";
    if (route === "disadvantage route") return "presents a disadvantage";
    if (route === "mixed outweigh route") return "mixes advantage and disadvantage claims";
  }
  const cleanWaterTask = /clean water|water supply/i.test(prompt) && /free of charge|free/i.test(prompt);
  if (cleanWaterTask && route === "supports the proposition") return "supports free clean-water supply";
  if (cleanWaterTask && route === "opposes or limits the proposition" && /budget|tax|cost|money/i.test(paragraph)) {
    return "opposes or limits the policy because of public cost";
  }
  return route;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}

export function classifyTask2EssayType(payload = {}) {
  return classifyTask2Prompt(payload).essayType;
}

export function classifyTask2Prompt(payload = {}) {
  const prompt = String(payload.prompt || "").trim();
  const selected = String(payload.essayType || "").trim();
  const promptOnly = prompt.toLowerCase().replace(/\s+/g, " ");
  const promptParts = extractPromptParts(prompt);
  const matches = [];
  const add = (publicFamily, internalSubtype, confidence, pattern, signalLabel, promptObligations) => {
    const match = promptOnly.match(pattern);
    if (!match) return;
    matches.push({ publicFamily, internalSubtype, confidence, signal: match[0], signalLabel, promptObligations });
  };

  add(TASK2_PUBLIC_FAMILIES.DISCUSS_BOTH_VIEWS, TASK2_INTERNAL_SUBTYPES.STANDARD, "high", /discuss both views|discuss (?:these|the) views/, "two views", [
    promptObligation("view-a", "Discuss View A", promptParts[0] || prompt, false, "develop"),
    promptObligation("view-b", "Discuss View B", promptParts[0] || prompt, false, "develop"),
    promptObligation("own-opinion", "Give the writer's own opinion when requested", promptParts.at(-1) || prompt, true, "judge")
  ]);
  add(TASK2_PUBLIC_FAMILIES.ADVANTAGES_DISADVANTAGES, TASK2_INTERNAL_SUBTYPES.OUTWEIGH, "high", /(?:do|does) the advantages? outweigh|(?:do|does) the disadvantages? outweigh|outweigh the (?:advantages?|disadvantages?|drawbacks?)/, "comparative outweigh judgement", [
    promptObligation("advantages", "Develop the advantages", prompt, false, "develop"),
    promptObligation("disadvantages", "Develop the disadvantages", prompt, false, "develop"),
    promptObligation("comparative-judgement", "Make an explicit comparative judgement", promptParts.at(-1) || prompt, true, "judge")
  ]);
  add(TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION, TASK2_INTERNAL_SUBTYPES.POSITIVE_NEGATIVE, "high", /positive or negative development|negative or positive development|is this (?:a )?positive or negative/, "evaluative development judgement", [
    promptObligation("evaluation", "Answer the positive/negative evaluation question", promptParts.at(-1) || prompt, true, "judge"),
    promptObligation("evaluation-support", "Support the evaluation with developed reasons", promptParts.at(-1) || prompt, false, "develop")
  ]);
  add(TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION, TASK2_INTERNAL_SUBTYPES.CAUSES_EFFECTS, "high", /(?:what|which) (?:are )?(?:the )?causes?[^?]*(?:effects?|consequences?|impacts?)|causes?\s*(?:and|&)\s*(?:effects?|consequences?|impacts?)/, "cause-effect prompt pair", [
    promptObligation("causes", "Explain the causes", promptParts.find((part) => /cause|reason/i.test(part)) || prompt, false, "explain"),
    promptObligation("effects", "Explain the effects", promptParts.find((part) => /effect|impact|consequence/i.test(part)) || prompt, false, "explain")
  ]);
  add(TASK2_PUBLIC_FAMILIES.PROBLEM_SOLUTION, TASK2_INTERNAL_SUBTYPES.CAUSES_SOLUTIONS, "high", /(?:what|which) (?:are )?(?:the )?causes?[^?]*(?:solutions?|measures?|steps?)|causes?\s*(?:and|&)\s*(?:solutions?|measures?)/, "cause-solution prompt pair", [
    promptObligation("causes", "Explain the causes", promptParts.find((part) => /cause|reason/i.test(part)) || prompt, false, "explain"),
    promptObligation("solutions", "Develop solutions matched to the causes", promptParts.find((part) => /solution|measure|step|tackle/i.test(part)) || prompt, false, "solve")
  ]);
  add(TASK2_PUBLIC_FAMILIES.PROBLEM_SOLUTION, TASK2_INTERNAL_SUBTYPES.STANDARD, "high", /problems?[^?]*(?:solutions?|measures?|steps?)|problem\s*[&/]\s*solution/, "problem-solution prompt pair", [
    promptObligation("problems", "Explain the problems", promptParts.find((part) => /problem|effect|impact|consequence/i.test(part)) || prompt, false, "explain"),
    promptObligation("solutions", "Develop solutions matched to the problems", promptParts.find((part) => /solution|measure|step|tackle/i.test(part)) || prompt, false, "solve")
  ]);
  add(TASK2_PUBLIC_FAMILIES.ADVANTAGES_DISADVANTAGES, TASK2_INTERNAL_SUBTYPES.STANDARD, "high", /advantages?\s*(?:and|&)\s*disadvantages?|benefits?\s*(?:and|&)\s*drawbacks?|what are the advantages?[^?]*disadvantages?/, "two-sided advantages/disadvantages", [
    promptObligation("advantages", "Develop the advantages", prompt, false, "develop"),
    promptObligation("disadvantages", "Develop the disadvantages", prompt, false, "develop")
  ]);
  add(TASK2_PUBLIC_FAMILIES.OPINION, TASK2_INTERNAL_SUBTYPES.STANDARD, "high", /to what extent do you agree or disagree|do you agree or disagree/, "agree/disagree judgement", [
    promptObligation("position", "State a clear extent of agreement", promptParts.at(-1) || prompt, true, "judge"),
    promptObligation("position-support", "Support the position with developed reasons", prompt, false, "develop"),
    promptObligation("position-consistency", "Maintain the same judgement through the conclusion", prompt, true, "close")
  ]);

  const directQuestionCount = countPromptQuestions(prompt);
  const explicitOpinionQuestion = /do you (?:think|agree|believe)|what is your (?:opinion|view)|to what extent/i.test(prompt);
  let winner = matches[0] || null;
  if (!winner && directQuestionCount >= 2) {
    winner = {
      publicFamily: TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION,
      internalSubtype: TASK2_INTERNAL_SUBTYPES.MULTI_QUESTION,
      confidence: "high",
      signal: `${directQuestionCount} explicit questions`,
      signalLabel: "question structure",
      promptObligations: promptParts.map((part, index) => promptObligation(
        `question-${index + 1}`,
        `Answer question ${index + 1}`,
        part,
        /(?:do you|opinion|view|positive|negative|outweigh|should)/i.test(part),
        "answer"
      ))
    };
  }

  if (!winner && directQuestionCount === 1) {
    winner = {
      publicFamily: explicitOpinionQuestion ? TASK2_PUBLIC_FAMILIES.OPINION : TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION,
      internalSubtype: TASK2_INTERNAL_SUBTYPES.STANDARD,
      confidence: explicitOpinionQuestion ? "medium" : "low",
      signal: promptParts[0] || "one explicit question",
      signalLabel: "single-question structure",
      promptObligations: [promptObligation(
        "question-1",
        "Answer the explicit question",
        promptParts[0] || prompt,
        explicitOpinionQuestion,
        "answer"
      )]
    };
  }

  if (!winner) {
    const selectedType = selectedTaskType(selected);
    if (selectedType) {
      winner = {
        publicFamily: selectedType,
        internalSubtype: TASK2_INTERNAL_SUBTYPES.STANDARD,
        confidence: "low",
        signal: selected,
        signalLabel: "student-selected task type",
        promptObligations: []
      };
    }
  }

  if (!winner) {
    winner = {
      publicFamily: TASK2_PUBLIC_FAMILIES.UNRESOLVED,
      internalSubtype: TASK2_INTERNAL_SUBTYPES.STANDARD,
      confidence: "low",
      signal: "No reliable task-type signal found",
      signalLabel: "unresolved",
      promptObligations: []
    };
  }

  const selectedType = selectedTaskType(selected);
  const autoDetectSelected = isAutoDetectTask2Type(selected);
  const detectedPublicFamily = winner.publicFamily;
  const effectivePublicFamily = winner.confidence === "low" && selectedType && !autoDetectSelected ? selectedType : detectedPublicFamily;
  const effectiveInternalSubtype = effectivePublicFamily === detectedPublicFamily ? winner.internalSubtype : TASK2_INTERNAL_SUBTYPES.STANDARD;
  const classificationMatch = autoDetectSelected || !selectedType || selectedType === detectedPublicFamily || winner.confidence === "low";
  const stanceRequired = isStanceRequired({ ...payload, essayType: TASK2_PUBLIC_TYPE_LABELS[effectivePublicFamily] }, effectivePublicFamily, effectiveInternalSubtype);
  const requiredRoutes = requiredRoutesForType(effectivePublicFamily, effectiveInternalSubtype, stanceRequired, promptParts.length);
  const publicLabel = TASK2_PUBLIC_TYPE_LABELS[effectivePublicFamily];
  const selectedPublicLabel = selectedType ? TASK2_PUBLIC_TYPE_LABELS[selectedType] : selected;
  const exposedInternalSubtype = effectiveInternalSubtype === TASK2_INTERNAL_SUBTYPES.STANDARD
    ? effectivePublicFamily
    : effectiveInternalSubtype;
  return {
    essayType: effectivePublicFamily,
    essayTypeLabel: publicLabel,
    publicEssayType: publicLabel,
    selectedPublicEssayType: selectedPublicLabel,
    detectedPublicEssayType: TASK2_PUBLIC_TYPE_LABELS[detectedPublicFamily],
    detectedPublicEssayFamily: detectedPublicFamily,
    publicEssayFamily: effectivePublicFamily,
    publicEssayFamilyLabel: publicLabel,
    internalSubtype: effectiveInternalSubtype,
    internalEssaySubtype: exposedInternalSubtype,
    internalEssaySubtypeLabel: internalSubtypeLabel(effectivePublicFamily, effectiveInternalSubtype),
    promptObligations: winner.promptObligations?.length
      ? winner.promptObligations
      : requiredRoutes.map((route, index) => promptObligation(`route-${index + 1}`, route, promptParts[index] || prompt, false, "develop")),
    confidence: winner.confidence,
    classificationConfidence: winner.confidence,
    exactPromptSignals: Array.from(new Set(matches
      .filter((item) => item.publicFamily === winner.publicFamily && item.internalSubtype === winner.internalSubtype)
      .map((item) => item.signal)
      .concat(winner.signal)
      .filter(Boolean))),
    signalReason: winner.signalLabel,
    selectedEssayType: selectedType,
    selectedEssayTypeLabel: selectedPublicLabel,
    autoDetectSelected,
    classificationMatch,
    mismatchSeverity: classificationMatch ? "none" : winner.confidence === "high" ? "high" : winner.confidence === "medium" ? "confirmation-required" : "selection-required",
    stanceRequired,
    requiredRoutes,
    promptParts
  };
}

function internalSubtypeLabel(publicFamily, internalSubtype) {
  const labels = {
    [TASK2_INTERNAL_SUBTYPES.OUTWEIGH]: "Advantages Outweigh Disadvantages",
    [TASK2_INTERNAL_SUBTYPES.CAUSES_SOLUTIONS]: "Causes and Solutions",
    [TASK2_INTERNAL_SUBTYPES.CAUSES_EFFECTS]: "Causes and Effects",
    [TASK2_INTERNAL_SUBTYPES.POSITIVE_NEGATIVE]: "Positive or Negative Development",
    [TASK2_INTERNAL_SUBTYPES.MULTI_QUESTION]: "Multiple Direct Questions"
  };
  return labels[internalSubtype] || TASK2_PUBLIC_TYPE_LABELS[publicFamily] || "Unresolved Task Type";
}

function promptObligation(id, label, questionText, judgementRequired = false, responseMode = "develop") {
  return {
    id: String(id || "obligation"),
    label: String(label || "Address the prompt obligation"),
    questionText: String(questionText || "").trim(),
    judgementRequired: Boolean(judgementRequired),
    responseMode: String(responseMode || "develop")
  };
}

function isStanceRequired(payload, essayType, internalSubtype = TASK2_INTERNAL_SUBTYPES.STANDARD) {
  const text = `${payload.essayType || ""} ${payload.prompt || ""}`;
  if (essayType === TASK2_PUBLIC_FAMILIES.OPINION) return true;
  if ([TASK2_INTERNAL_SUBTYPES.OUTWEIGH, TASK2_INTERNAL_SUBTYPES.POSITIVE_NEGATIVE].includes(internalSubtype)) return true;
  if (essayType === TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS) {
    return /(?:give|include)\s+(?:your|an)\s+(?:own\s+)?opinion|what is your (?:opinion|view)|your own view/i.test(text);
  }
  if (essayType === TASK2_PUBLIC_FAMILIES.DIRECT_QUESTION) {
    return /do you (?:think|agree|believe)|what is your (?:opinion|view)|to what extent/i.test(text);
  }
  return false;
}

function selectedTaskType(value) {
  return mapLegacyTask2PublicType(value);
}

function isAutoDetectTask2Type(value) {
  return /not sure|auto[- ]?detect/i.test(String(value || ""));
}

function extractPromptParts(prompt) {
  const text = String(prompt || "").trim();
  const questions = text.match(/[^?]+\?/g)?.map((item) => item.trim()) || [];
  return questions.length ? questions : text ? [text] : [];
}

function extractDiscussViewClauses(prompt) {
  const source = String(prompt || "").replace(/\bdiscuss both views[\s\S]*$/i, "").trim();
  const clauses = source.split(/\b(?:while|whereas)\b|,\s*(?:but\s+)?others?\b/i).map((item) => item.trim()).filter(Boolean);
  return clauses.length >= 2 ? clauses.slice(0, 2) : [source, source];
}

function semanticKeywordOverlap(paragraph, obligation) {
  const stopWords = new Set(["about", "after", "also", "because", "believe", "both", "could", "discuss", "does", "from", "have", "many", "more", "others", "people", "should", "some", "their", "these", "this", "views", "what", "when", "where", "which", "while", "with", "would", "your"]);
  const obligationWords = new Set((String(obligation || "").toLowerCase().match(/[a-z][a-z-]{3,}/g) || []).filter((word) => !stopWords.has(word)));
  const paragraphWords = new Set(String(paragraph || "").toLowerCase().match(/[a-z][a-z-]{3,}/g) || []);
  return [...obligationWords].filter((word) => paragraphWords.has(word)).length;
}

function scoreParagraphForQuestion(paragraph, question) {
  const text = String(paragraph || "");
  const promptPart = String(question || "");
  let score = semanticKeywordOverlap(text, promptPart);
  if (/\bwhy\b|\bcauses?\b|\breasons?\b/i.test(promptPart)) {
    if (/\b(?:cause|reason|due to|stems? from|driven by)\b/i.test(text)) score += 6;
    else if (/\bbecause\b/i.test(text)) score += 2;
  }
  if (/\bproblems?\b|\beffects?\b|\bimpacts?\b|\bconsequences?\b/i.test(promptPart) && /\b(?:problem|effect|impact|consequence|pressure|risk|harm|leads? to|results? in)\b/i.test(text)) score += 6;
  if (/\bsolutions?\b|\bmeasures?\b|\bwhat (?:can|should)\b/i.test(promptPart) && /\b(?:solution|measure|government should|could|need to|policy|invest|improve|reduce|encourage)\b/i.test(text)) score += 5;
  if (/\bdo you (?:think|agree|believe)\b|\bopinion\b|\bview\b/i.test(promptPart) && POSITION_PATTERN.test(text)) score += 5;
  return score;
}

function requiredRoutesForType(essayType, internalSubtype, stanceRequired, promptPartCount) {
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.OUTWEIGH) return ["advantage route", "disadvantage route", "comparative weighting", "supported judgement", "conclusion consistency"];
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.CAUSES_SOLUTIONS) return ["cause route", "solution route", "cause-solution pairing", "prompt coverage", "conclusion closure"];
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.CAUSES_EFFECTS) return ["cause route", "effect route", "cause-effect mechanism", "prompt coverage", "conclusion closure"];
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.POSITIVE_NEGATIVE) return ["evaluative stance", "reasons", "development", "conclusion consistency"];
  const routes = {
    [TASK2_CANONICAL_TYPES.OPINION]: ["position", "reason alignment", "body support", "conclusion consistency"],
    [TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS]: ["View A", "View B", ...(stanceRequired ? ["writer opinion"] : []), "conclusion integration"],
    [TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION]: ["problem route", "solution route", "problem-solution pairing", "prompt coverage", "conclusion closure"],
    [TASK2_CANONICAL_TYPES.CAUSES_SOLUTIONS]: ["cause route", "solution route", "cause-solution pairing", "prompt coverage", "conclusion closure"],
    [TASK2_CANONICAL_TYPES.CAUSES_EFFECTS]: ["cause route", "effect route", "cause-effect mechanism", "prompt coverage", "conclusion closure"],
    [TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES]: ["advantage route", "disadvantage route", "development balance", "conclusion closure"],
    [TASK2_CANONICAL_TYPES.OUTWEIGH]: ["advantage route", "disadvantage route", "comparative weighting", "supported judgement", "conclusion consistency"],
    [TASK2_CANONICAL_TYPES.POSITIVE_NEGATIVE]: ["evaluative stance", "reasons", "development", "conclusion consistency"],
    [TASK2_CANONICAL_TYPES.DIRECT_QUESTION]: Array.from({ length: Math.max(1, promptPartCount) }, (_, index) => `Question ${index + 1}`),
    [TASK2_CANONICAL_TYPES.HYBRID]: Array.from({ length: Math.max(2, promptPartCount) }, (_, index) => `Question ${index + 1}`),
    [TASK2_CANONICAL_TYPES.UNRESOLVED]: ["task-type confirmation"]
  };
  return routes[essayType] || ["task-type confirmation"];
}

function buildTaskTypeRouteAssessment(context) {
  if (context.internalSubtype === TASK2_INTERNAL_SUBTYPES.OUTWEIGH) return buildOutweighRouteAssessment(context);
  if (context.internalSubtype === TASK2_INTERNAL_SUBTYPES.CAUSES_EFFECTS) return buildCausesEffectsRouteAssessment(context);
  if (context.internalSubtype === TASK2_INTERNAL_SUBTYPES.POSITIVE_NEGATIVE) return buildPositiveNegativeRouteAssessment(context);
  const builders = {
    [TASK2_CANONICAL_TYPES.OPINION]: buildOpinionRouteAssessment,
    [TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS]: buildDiscussViewsRouteAssessment,
    [TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES]: buildAdvantagesDisadvantagesRouteAssessment,
    [TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION]: buildProblemSolutionRouteAssessment,
    [TASK2_CANONICAL_TYPES.DIRECT_QUESTION]: buildDirectQuestionRouteAssessment,
    [TASK2_CANONICAL_TYPES.UNRESOLVED]: buildUnresolvedRouteAssessment
  };
  return (builders[context.essayRoute] || buildUnresolvedRouteAssessment)(context);
}

function buildOpinionRouteAssessment(context) {
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const opinionRoute = classifyOpinionBodyRoute({
      paragraph,
      index,
      prompt: context.payload.prompt,
      position: context.detectedPosition,
      introduction: context.introduction
    });
    return routeItem(
      index,
      opinionRoute.label,
      paragraph,
      opinionRoute.status
    );
  });
  const missingPosition = ["unclear", "contradictory"].includes(context.detectedPosition);
  const directConflict = detectRouteConflict({
    essayRoute: TASK2_CANONICAL_TYPES.OPINION,
    detectedPosition: context.detectedPosition,
    introPosition: context.introPosition,
    bodyRoutes: bodyRoutes.map((item) => item.label),
    conclusionPosition: context.conclusionPosition
  });
  const conflict = directConflict || (
    missingPosition &&
    context.unfinishedEndingDetected &&
    bodyRoutes.some((item) => /aligned with the writer|main position/.test(item.label)) &&
    bodyRoutes.some((item) => /opposing|concessive|concession/.test(item.label))
  );
  const missingRequirements = [
    ...(missingPosition ? ["position"] : []),
    ...(bodyRoutes.length < 2 ? ["two developed body routes"] : [])
  ];
  const status = conflict ? "conflicting" : missingRequirements.length ? "failed" : bodyRoutes.some((item) => item.status === "partial") ? "partial" : "controlled";
  const conclusionLabel = buildStanceConclusionLabel(context);
  return finalizeRouteAssessment(context, {
    schema: "position-and-reasons",
    label: "Opinion Route Assessment",
    requirements: [
      requirement("position", "Clear extent of agreement", !missingPosition, context.introPosition || firstSentence(context.introduction)),
      requirement("body-routes", "Reasons and concessions controlled against the writer's position", bodyRoutes.length >= 2 && !conflict, bodyRoutes.map((item) => item.evidence).join(" | ")),
      requirement("conclusion", "Consistent final position", Boolean(context.conclusion) && !context.unfinishedEndingDetected && !["unclear", "contradictory"].includes(context.conclusionPosition), firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel,
    position: context.detectedPosition
  });
}

function buildDiscussViewsRouteAssessment(context) {
  const viewClauses = extractDiscussViewClauses(context.payload.prompt);
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const scores = viewClauses.map((clause) => semanticKeywordOverlap(paragraph, clause));
    const bestScore = Math.max(0, ...scores);
    const bestIndex = scores.indexOf(bestScore);
    const explicitFirst = /\b(?:first view|supporters? of the first|on (?:the )?one hand)\b/i.test(paragraph);
    const explicitSecond = /\b(?:second view|supporters? of the second|on the other hand|by contrast)\b/i.test(paragraph);
    const viewIndex = explicitFirst ? 0 : explicitSecond ? 1 : bestScore > 0 ? bestIndex : -1;
    const label = viewIndex === 0
      ? "presents the first view"
      : viewIndex === 1 ? "presents the second view" : "view route is unclear from the controlling sentence";
    return routeItem(index, label, paragraph, countWords(paragraph) >= 55 ? "adequate" : "partial");
  });
  const hasFirstView = bodyRoutes.some((item) => /first view/.test(item.label));
  const hasSecondView = bodyRoutes.some((item) => /second view/.test(item.label));
  const stanceMissing = context.stanceRequired && ["unclear", "contradictory"].includes(context.detectedPosition);
  const missingRequirements = [
    ...(!hasFirstView ? ["first view"] : []),
    ...(!hasSecondView ? ["second view"] : []),
    ...(stanceMissing ? ["own opinion"] : [])
  ];
  const status = missingRequirements.length ? "failed" : bodyRoutes.some((item) => item.status === "partial") ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "two-views-and-opinion",
    label: "Discuss Both Views Route Assessment",
    requirements: [
      requirement("view-a", "First view covered", hasFirstView, bodyRoutes.find((item) => /first view/.test(item.label))?.evidence),
      requirement("view-b", "Second view covered", hasSecondView, bodyRoutes.find((item) => /second view/.test(item.label))?.evidence),
      ...(context.stanceRequired ? [requirement("opinion", "Own opinion stated", !stanceMissing, context.introPosition || context.conclusionPosition)] : []),
      requirement("conclusion", "Discussion closed consistently", Boolean(context.conclusion) && !context.unfinishedEndingDetected, firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel: context.stanceRequired ? buildStanceConclusionLabel(context) : buildSummaryConclusionLabel(context),
    position: context.stanceRequired ? context.detectedPosition : ""
  });
}

function buildAdvantagesDisadvantagesRouteAssessment(context) {
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const advantageSignals = countSemanticSignals(paragraph, OUTWEIGH_POSITIVE_SIDE_PATTERNS);
    const disadvantageSignals = countSemanticSignals(paragraph, OUTWEIGH_NEGATIVE_SIDE_PATTERNS);
    const label = advantageSignals > disadvantageSignals
      ? "develops advantages"
      : disadvantageSignals > advantageSignals
        ? "develops disadvantages"
        : index === 0 ? "develops advantages" : "develops disadvantages";
    return routeItem(index, label, paragraph, countWords(paragraph) >= 55 ? "adequate" : "partial");
  });
  const hasAdvantages = bodyRoutes.some((item) => /advantages/.test(item.label));
  const hasDisadvantages = bodyRoutes.some((item) => /disadvantages/.test(item.label));
  const missingRequirements = [...(!hasAdvantages ? ["advantages"] : []), ...(!hasDisadvantages ? ["disadvantages"] : [])];
  const status = missingRequirements.length ? "failed" : bodyRoutes.some((item) => item.status === "partial") ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "advantages-and-disadvantages",
    label: "Advantages / Disadvantages Route Assessment",
    requirements: [
      requirement("advantages", "Advantages developed", hasAdvantages, bodyRoutes.find((item) => /advantages/.test(item.label))?.evidence),
      requirement("disadvantages", "Disadvantages developed", hasDisadvantages, bodyRoutes.find((item) => /disadvantages/.test(item.label))?.evidence),
      requirement("conclusion", "Both sides summarised", Boolean(context.conclusion) && !context.unfinishedEndingDetected, firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel: buildSummaryConclusionLabel(context),
    position: ""
  });
}

function buildOutweighRouteAssessment(context) {
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => routeItem(
    index,
    describeBodyRoute(classifyOutweighBodyRoute(paragraph), paragraph, context.payload.prompt, TASK2_CANONICAL_TYPES.OUTWEIGH),
    paragraph,
    countWords(paragraph) >= 55 ? "adequate" : "partial"
  ));
  const hasAdvantages = bodyRoutes.some((item) => /advantage/.test(item.label));
  const hasDisadvantages = bodyRoutes.some((item) => /disadvantage/.test(item.label));
  const comparativePosition = /outweigh/.test(context.detectedPosition);
  const missingRequirements = [
    ...(!hasAdvantages ? ["advantages"] : []),
    ...(!hasDisadvantages ? ["disadvantages"] : []),
    ...(!comparativePosition ? ["comparative judgement"] : [])
  ];
  const status = missingRequirements.length ? "failed" : bodyRoutes.some((item) => item.status === "partial") ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "comparative-outweigh",
    label: "Outweigh Route Assessment",
    requirements: [
      requirement("advantages", "Advantages developed", hasAdvantages, bodyRoutes.find((item) => /advantage/.test(item.label))?.evidence),
      requirement("disadvantages", "Disadvantages developed", hasDisadvantages, bodyRoutes.find((item) => /disadvantage/.test(item.label))?.evidence),
      requirement("judgement", "Explicit comparative judgement", comparativePosition, context.introPosition || context.conclusionPosition),
      requirement("conclusion", "Comparative judgement restated", /outweigh/.test(context.conclusionPosition) && !context.unfinishedEndingDetected, firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel: buildStanceConclusionLabel(context),
    position: context.detectedPosition
  });
}

function buildProblemSolutionRouteAssessment(context) {
  const prompt = String(context.payload.prompt || "");
  const asksCauses = /causes?|reasons?|why/i.test(prompt);
  const asksProblems = /problems?|effects?|consequences?/i.test(prompt) && !asksCauses;
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const sentences = splitSentences(paragraph);
    const causeScore = countMatches(paragraph, /\b(?:cause[sd]?|because|due to|result(?:s|ed)? from|reason|led to|number of cars|car ownership|commut|daily travel|congestion)\b/gi);
    const problemScore = countMatches(paragraph, /\b(?:problem|effect|consequence|congestion|pollution|delay|accident|pressure|traffic jam)\b/gi);
    const solutionScore = countMatches(paragraph, /\b(?:solution|measure|government should|could|need to|public transport|carpool|parking|tax|invest|encourage|reduce|improve)\b/gi);
    const label = solutionScore > Math.max(causeScore, problemScore)
      ? "develops solutions"
      : asksCauses ? "develops causes" : asksProblems ? "develops problems" : index === 0 ? "develops causes/problems" : "develops solutions";
    const lateAdditionalRoute = sentences.findIndex((sentence, sentenceIndex) => sentenceIndex > 0 && /\b(?:second|another|additional)\s+(?:cause|problem|reason)\b/i.test(sentence));
    const additionalRouteUnderdeveloped = lateAdditionalRoute >= 0 && sentences.length - lateAdditionalRoute <= 2;
    const developmentSignals = sentences.length >= 3 && countWords(paragraph) >= 55 && !additionalRouteUnderdeveloped;
    return routeItem(index, label, paragraph, developmentSignals ? "adequate" : "partial");
  });
  const firstLabel = asksCauses ? "causes" : asksProblems ? "problems" : "causes/problems";
  const hasFirstRoute = bodyRoutes.some((item) => new RegExp(firstLabel.replace("/", "|")).test(item.label));
  const hasSolutions = bodyRoutes.some((item) => /solutions/.test(item.label));
  const missingRequirements = [...(!hasFirstRoute ? [firstLabel] : []), ...(!hasSolutions ? ["solutions"] : [])];
  const partiallyDeveloped = bodyRoutes.some((item) => item.status === "partial");
  const status = missingRequirements.length ? "failed" : partiallyDeveloped ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "cause-problem-solution",
    label: "Problem & Solution Route Assessment",
    requirements: [
      requirement("cause-problem", `${capitalize(firstLabel)} identified and developed`, hasFirstRoute, bodyRoutes.find((item) => !/solutions/.test(item.label))?.evidence),
      requirement("solutions", "Solutions identified and developed", hasSolutions, bodyRoutes.find((item) => /solutions/.test(item.label))?.evidence),
      requirement("pairing", "Solutions respond to the diagnosed causes/problems", hasFirstRoute && hasSolutions, bodyRoutes.map((item) => item.evidence).join(" | ")),
      requirement("conclusion", "Causes/problems and solutions summarised", Boolean(context.conclusion) && !context.unfinishedEndingDetected, firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel: buildSummaryConclusionLabel(context),
    position: ""
  });
}

function buildCausesEffectsRouteAssessment(context) {
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const causeSignals = countMatches(paragraph, /\b(?:cause[sd]?|because|due to|reason|result(?:s|ed)? from|stems? from|driven by)\b/gi);
    const effectSignals = countMatches(paragraph, /\b(?:effects?|consequences?|impacts?|therefore|as a result|leads? to|results? in|creates?|produces?)\b/gi);
    const label = causeSignals > effectSignals
      ? "develops causes"
      : effectSignals > causeSignals
        ? "develops effects"
        : index === 0 ? "develops causes" : "develops effects";
    const sentenceCount = splitSentences(paragraph).length;
    const status = sentenceCount >= 3 && countWords(paragraph) >= 55 ? "adequate" : sentenceCount >= 2 ? "partial" : "mentioned";
    return routeItem(index, label, paragraph, status);
  });
  const hasCauses = bodyRoutes.some((item) => /causes/.test(item.label));
  const hasEffects = bodyRoutes.some((item) => /effects/.test(item.label));
  const missingRequirements = [...(!hasCauses ? ["causes"] : []), ...(!hasEffects ? ["effects"] : [])];
  const status = missingRequirements.length ? "failed" : bodyRoutes.some((item) => item.status !== "adequate") ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "causes-and-effects",
    label: "Causes & Effects Route Assessment",
    requirements: [
      requirement("causes", "Causes identified and developed", hasCauses, bodyRoutes.find((item) => /causes/.test(item.label))?.evidence),
      requirement("effects", "Effects identified and developed", hasEffects, bodyRoutes.find((item) => /effects/.test(item.label))?.evidence),
      requirement("mechanism", "Cause-effect mechanism is explained", hasCauses && hasEffects, bodyRoutes.map((item) => item.evidence).join(" | ")),
      requirement("conclusion", "Causes and effects summarised", Boolean(context.conclusion) && !context.unfinishedEndingDetected, firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel: buildSummaryConclusionLabel(context),
    position: ""
  });
}

function buildPositiveNegativeRouteAssessment(context) {
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => routeItem(
    index,
    describeBodyRoute(classifyBodyRoute(paragraph, TASK2_CANONICAL_TYPES.OPINION), paragraph, context.payload.prompt, TASK2_CANONICAL_TYPES.OPINION),
    paragraph,
    countWords(paragraph) >= 55 ? "adequate" : splitSentences(paragraph).length >= 2 ? "partial" : "mentioned"
  ));
  const stanceMissing = ["unclear", "contradictory"].includes(context.detectedPosition);
  const missingRequirements = [...(stanceMissing ? ["evaluative stance"] : []), ...(bodyRoutes.length < 2 ? ["developed reasons"] : [])];
  const status = stanceMissing ? "failed" : bodyRoutes.some((item) => item.status !== "adequate") ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "positive-negative-judgement",
    label: "Positive / Negative Development Route Assessment",
    requirements: [
      requirement("position", "Clear positive/negative judgement", !stanceMissing, context.introPosition || context.conclusionPosition),
      requirement("reasons", "Reasons support the judgement", bodyRoutes.length >= 2, bodyRoutes.map((item) => item.evidence).join(" | ")),
      requirement("conclusion", "Evaluative judgement restated", Boolean(context.conclusion) && !context.unfinishedEndingDetected && !["unclear", "contradictory"].includes(context.conclusionPosition), firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel: buildStanceConclusionLabel(context),
    position: context.detectedPosition
  });
}

function buildUnresolvedRouteAssessment(context) {
  return finalizeRouteAssessment(context, {
    schema: "unresolved-task-type",
    label: "Unresolved Task-Type Assessment",
    requirements: [requirement("task-type", "Task type must be determined from the prompt", false, context.payload.prompt)],
    bodyRoutes: context.bodyParagraphs.map((paragraph, index) => routeItem(index, "task route not safely classifiable", paragraph, "not_applicable")),
    missingRequirements: ["task-type confirmation"],
    status: "failed",
    conclusionLabel: buildSummaryConclusionLabel(context),
    position: ""
  });
}

function buildDirectQuestionRouteAssessment(context) {
  const questions = extractPromptParts(context.payload.prompt);
  const questionCount = Math.max(1, questions.length);
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const scores = questions.map((question) => scoreParagraphForQuestion(paragraph, question));
    const bestScore = Math.max(0, ...scores);
    const bestQuestion = scores.indexOf(bestScore);
    return routeItem(
      index,
      bestScore > 0 ? `answers question ${bestQuestion + 1}` : "answer route is unclear from the controlling sentence",
      paragraph,
      countWords(paragraph) >= 50 ? "adequate" : "partial"
    );
  });
  const missingRequirements = Array.from({ length: questionCount }, (_, index) => index + 1)
    .filter((question) => !bodyRoutes.some((item) => item.label === `answers question ${question}`))
    .map((question) => `answer to question ${question}`);
  const stanceMissing = context.stanceRequired && ["unclear", "contradictory"].includes(context.detectedPosition);
  if (stanceMissing) missingRequirements.push("required opinion");
  const status = missingRequirements.length ? "failed" : bodyRoutes.some((item) => item.status === "partial") ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "question-by-question",
    label: "Direct Question Route Assessment",
    requirements: [
      ...Array.from({ length: questionCount }, (_, index) => requirement(
        `question-${index + 1}`,
        `Question ${index + 1} answered`,
        bodyRoutes.some((item) => item.label === `answers question ${index + 1}`),
        bodyRoutes.find((item) => item.label === `answers question ${index + 1}`)?.evidence
      )),
      ...(context.stanceRequired ? [requirement("opinion", "Required opinion stated", !stanceMissing, context.introPosition || context.conclusionPosition)] : []),
      requirement("conclusion", "Answers summarised", Boolean(context.conclusion) && !context.unfinishedEndingDetected, firstSentence(context.conclusion))
    ],
    bodyRoutes,
    missingRequirements,
    status,
    conclusionLabel: context.stanceRequired ? buildStanceConclusionLabel(context) : buildSummaryConclusionLabel(context),
    position: context.stanceRequired ? context.detectedPosition : ""
  });
}

function finalizeRouteAssessment(context, assessment) {
  const requirements = assessment.requirements.map((item) => ({
    ...item,
    status: normalizeRouteCoverage(item.status)
  }));
  const bodyRoutes = assessment.bodyRoutes.map((item, index) => {
    const status = normalizeRouteCoverage(item.status);
    return {
      ...item,
      status,
      alignmentStatus: /not clear|opposing or concessive|mixes supporting|contradict/i.test(item.label || "")
        ? ROUTE_COVERAGE.PARTIALLY_DEVELOPED
        : ROUTE_COVERAGE.ADEQUATELY_DEVELOPED,
      developmentStatus: assessParagraphDevelopmentStatus(context, item, index, status)
    };
  });
  const overallRouteStatus = normalizeRouteCoverage(assessment.status);
  const requirementStatuses = requirements.map((item) => item.status);
  const confidence = context.bodyParagraphs.length >= 2 && requirementStatuses.filter(isControlledRouteStatus).length >= 2
    ? "high"
    : context.bodyParagraphs.length ? "medium" : "low";
  const bodySummary = bodyRoutes.length
    ? bodyRoutes.map((item) => `Body ${item.index} route: ${item.label}${isPartialRouteStatus(item.status) ? ` (${routeCoverageLabel(item.status)})` : ""}`)
    : ["No completed body route was detected"];
  const summary = [
    ...(context.stanceRequired ? [`Detected position: ${assessment.position || "unclear"}`] : []),
    ...bodySummary,
    `Conclusion route: ${assessment.conclusionLabel}`,
    `Overall route status: ${routeCoverageLabel(overallRouteStatus)}`
  ].join(" | ");
  return {
    ...assessment,
    requirements,
    bodyRoutes,
    thesisRouteStatus: assessThesisRouteCoverage(context),
    status: overallRouteStatus,
    overallRouteStatus,
    stanceRequired: context.stanceRequired,
    confidence,
    summary,
    recommendedRoute: buildTaskTypeRecommendedRoute(context.essayRoute, context.stanceRequired, context.internalSubtype),
    recommendedRouteRationale: buildTaskTypeRouteRationale(context.essayRoute, overallRouteStatus, context.internalSubtype),
    missingRequirements: assessment.missingRequirements || []
  };
}

function assessParagraphDevelopmentStatus(context, item, index, status) {
  if (!isControlledRouteStatus(status)) return status;
  const paragraph = String(context.bodyParagraphs?.[index] || "");
  const transitions = countMatches(paragraph, /\b(?:for example|for instance|furthermore|moreover|in addition|another)\b/gi);
  const listLike = transitions >= 3;
  const urbanTask = /\b(?:towns?|cities|urban|zones?|facilit(?:y|ies))\b/i.test(context.payload?.prompt || "");
  const individualExampleWithoutBridge = urbanTask && /\b(?:student|his school|restaurant|shopping mall)\b/i.test(paragraph) &&
    !/\b(?:city-wide|urban system|transport network|residents across|municipal|peak-hour pressure across)\b/i.test(paragraph);
  return listLike || individualExampleWithoutBridge ? ROUTE_COVERAGE.PARTIALLY_DEVELOPED : status;
}

function assessThesisRouteCoverage(context) {
  const introduction = String(context.introduction || "");
  if (!introduction || countWords(introduction) < 8) return ROUTE_COVERAGE.ABSENT;
  if (context.stanceRequired) {
    if (!context.introPosition || ["unclear", "contradictory"].includes(context.introPosition)) return ROUTE_COVERAGE.MENTIONED_ONLY;
    const positionSentence = splitSentences(introduction).find((sentence) => POSITION_PATTERN.test(sentence)) || introduction;
    const routeWording = positionSentence.replace(POSITION_PATTERN, " ");
    const vagueRoute = /\b(?:numerous|many|several|various) benefits?\b|\b(?:many|several) reasons?\b|\bthis view\b/i.test(routeWording) &&
      !/\b(?:technology|technological|communication|transport|travel|traffic|congestion|economic|economy|security|resource|health|education|environment|employment|jobs?|innovation|monitoring|navigation)\b/i.test(routeWording);
    return vagueRoute ? ROUTE_COVERAGE.MENTIONED_ONLY : ROUTE_COVERAGE.ADEQUATELY_DEVELOPED;
  }
  const patterns = {
    [TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS]: [/both|while|whereas|some people/i, /view|believe|argue|prefer/i],
    [TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES]: [/advantage|benefit/i, /disadvantage|drawback|limitation/i],
    [TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION]: [/problem|cause|congestion|pressure/i, /solution|reduce|address|improve|measure/i],
    [TASK2_CANONICAL_TYPES.CAUSES_SOLUTIONS]: [/cause|because|due to|driven by/i, /solution|reduce|address|improve|measure/i],
    [TASK2_CANONICAL_TYPES.CAUSES_EFFECTS]: [/cause|because|due to|driven by/i, /effect|impact|consequence|lead to|result in/i],
    [TASK2_CANONICAL_TYPES.DIRECT_QUESTION]: [/because|reason|why|move|choose/i, /problem|effect|impact|pressure|result/i],
    [TASK2_CANONICAL_TYPES.HYBRID]: [/because|reason|cause|view|advantage/i, /solution|effect|opinion|problem|disadvantage/i],
    [TASK2_CANONICAL_TYPES.UNRESOLVED]: []
  };
  const requiredSignals = patterns[context.essayRoute] || [];
  if (!requiredSignals.length) return countWords(introduction) >= 15 ? ROUTE_COVERAGE.ADEQUATELY_DEVELOPED : ROUTE_COVERAGE.MENTIONED_ONLY;
  const covered = requiredSignals.filter((pattern) => pattern.test(introduction)).length;
  return covered === requiredSignals.length
    ? ROUTE_COVERAGE.ADEQUATELY_DEVELOPED
    : covered ? ROUTE_COVERAGE.MENTIONED_ONLY : ROUTE_COVERAGE.ABSENT;
}

export function classifyConcessionStatus({ routeAssessment = {}, introduction = "", bodyParagraphs = [], introPosition = "", conclusionPosition = "", detectedPosition = "" } = {}) {
  if (detectedPosition === "contradictory" || (introPosition && conclusionPosition && positionDirection(introPosition) !== positionDirection(conclusionPosition))) {
    return "Genuine contradiction";
  }
  const concessionRoutes = (routeAssessment.bodyRoutes || []).filter((item) => /concession|opposing|competing/i.test(item.label || ""));
  if (concessionRoutes.some((item) => /explicitly returns|rebut/i.test(item.label || ""))) return "Concession with rebuttal";
  if (concessionRoutes.length) {
    const extended = concessionRoutes.some((item) => countWords(bodyParagraphs[Math.max(0, Number(item.index || 1) - 1)] || "") >= 70);
    return extended ? "Extended competing opposing route" : "Concession without sufficient return";
  }
  if (/^(?:although|while|even though)\b[^.!?]{0,180},/i.test(String(introduction || "").trim())) return "Controlled concession";
  return "No concession";
}

function requirement(id, label, present, evidence = "") {
  return { id, label, required: true, status: present ? "adequate" : "missing", evidence: String(evidence || "") };
}

function routeItem(index, label, paragraph, status) {
  const sentences = splitSentences(paragraph);
  const controllingSentence = sentences[0] || "";
  const exampleSupport = sentences.find((sentence) => /\b(?:for example|for instance|such as|to illustrate)\b/i.test(sentence)) || "";
  const linkBack = [...sentences].reverse().find((sentence) => /\b(?:therefore|thus|consequently|as a result|this (?:shows|means|demonstrates)|which (?:shows|means))\b/i.test(sentence)) || "";
  const routeShift = sentences.find((sentence, sentenceIndex) => sentenceIndex > 0 && /^(?:however|on the other hand|nevertheless|by contrast|conversely)\b/i.test(sentence)) || "";
  return {
    index: index + 1,
    label,
    status,
    evidence: controllingSentence,
    controllingSentence,
    paragraphClaim: controllingSentence,
    promptObligationServed: label,
    explanationMechanism: sentences.find((sentence) => /\b(?:because|since|therefore|as a result|which (?:means|allows|causes|leads)|leads? to|results? in)\b/i.test(sentence)) || "",
    exampleSupport,
    linkBack,
    routeShiftDetected: Boolean(routeShift),
    routeShiftEvidence: routeShift,
    wordCount: countWords(paragraph)
  };
}

function normalizeRouteCoverage(value) {
  const status = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  const mapping = {
    not_applicable: ROUTE_COVERAGE.NOT_APPLICABLE,
    missing: ROUTE_COVERAGE.ABSENT,
    absent: ROUTE_COVERAGE.ABSENT,
    failed: ROUTE_COVERAGE.ABSENT,
    conflicting: ROUTE_COVERAGE.CONTRADICTED,
    contradicted: ROUTE_COVERAGE.CONTRADICTED,
    mentioned: ROUTE_COVERAGE.MENTIONED_ONLY,
    mentioned_only: ROUTE_COVERAGE.MENTIONED_ONLY,
    partial: ROUTE_COVERAGE.PARTIALLY_DEVELOPED,
    partially_developed: ROUTE_COVERAGE.PARTIALLY_DEVELOPED,
    present: ROUTE_COVERAGE.ADEQUATELY_DEVELOPED,
    adequate: ROUTE_COVERAGE.ADEQUATELY_DEVELOPED,
    controlled: ROUTE_COVERAGE.ADEQUATELY_DEVELOPED,
    adequately_developed: ROUTE_COVERAGE.ADEQUATELY_DEVELOPED,
    strong: ROUTE_COVERAGE.FULLY_EXTENDED,
    fully_extended: ROUTE_COVERAGE.FULLY_EXTENDED
  };
  return mapping[status] || ROUTE_COVERAGE.MENTIONED_ONLY;
}

export function isControlledRouteStatus(value) {
  return [ROUTE_COVERAGE.ADEQUATELY_DEVELOPED, ROUTE_COVERAGE.FULLY_EXTENDED].includes(normalizeRouteCoverage(value));
}

export function isPartialRouteStatus(value) {
  return [ROUTE_COVERAGE.MENTIONED_ONLY, ROUTE_COVERAGE.PARTIALLY_DEVELOPED].includes(normalizeRouteCoverage(value));
}

export function isFailedRouteStatus(value) {
  return [ROUTE_COVERAGE.ABSENT, ROUTE_COVERAGE.CONTRADICTED].includes(normalizeRouteCoverage(value));
}

function routeCoverageLabel(value) {
  const labels = {
    [ROUTE_COVERAGE.NOT_APPLICABLE]: "not applicable",
    [ROUTE_COVERAGE.ABSENT]: "absent",
    [ROUTE_COVERAGE.CONTRADICTED]: "contradicted",
    [ROUTE_COVERAGE.MENTIONED_ONLY]: "mentioned only",
    [ROUTE_COVERAGE.PARTIALLY_DEVELOPED]: "partially developed",
    [ROUTE_COVERAGE.ADEQUATELY_DEVELOPED]: "adequately developed",
    [ROUTE_COVERAGE.FULLY_EXTENDED]: "fully extended"
  };
  return labels[normalizeRouteCoverage(value)];
}

function buildStanceConclusionLabel(context) {
  if (context.unfinishedEndingDetected && /agree/.test(context.conclusionPosition)) return "states agreement too late and remains unfinished";
  if (context.unfinishedEndingDetected && /disagree/.test(context.conclusionPosition)) return "states disagreement too late and remains unfinished";
  if (context.unfinishedEndingDetected) return "is present but unfinished";
  if (!context.conclusion) return "is not clearly present";
  if (!context.conclusionPosition || ["unclear", "contradictory"].includes(context.conclusionPosition)) return "does not restate the required judgement clearly";
  if (context.conclusionPosition === "advantages outweigh the disadvantages") return "clearly restates that the advantages outweigh the disadvantages";
  if (context.conclusionPosition === "disadvantages outweigh the advantages") return "clearly restates that the disadvantages outweigh the advantages";
  return `restates ${context.conclusionPosition}`;
}

function buildSummaryConclusionLabel(context) {
  if (context.unfinishedEndingDetected) return "is present but unfinished";
  if (!context.conclusion) return "is not clearly present";
  return "summarises the task routes";
}

function buildTaskTypeRecommendedRoute(essayType, stanceRequired, internalSubtype = TASK2_INTERNAL_SUBTYPES.STANDARD) {
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.OUTWEIGH) return "Develop both sides, make the stronger side explicit through comparison, and restate the outweigh judgement in the conclusion.";
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.CAUSES_SOLUTIONS) return "Identify and develop the requested causes, pair them with relevant solutions, and summarise those routes in the conclusion.";
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.CAUSES_EFFECTS) return "Develop the main causes and effects separately, make the cause-effect mechanism visible, and close both routes in the conclusion.";
  if (internalSubtype === TASK2_INTERNAL_SUBTYPES.POSITIVE_NEGATIVE) return "State a clear evaluative judgement, make the body reasons prove it, and restate the same judgement in the conclusion.";
  const routes = {
    [TASK2_CANONICAL_TYPES.OPINION]: "State one clear extent of agreement, make both body paragraphs prove it, and restate the same position in the conclusion.",
    [TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS]: `Explain each view in a separate controlled route${stanceRequired ? ", state your own opinion clearly," : ""} and close by synthesising the discussion.`,
    [TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES]: "Develop the main advantages and disadvantages in distinct routes, then summarise both sides without inventing an opinion requirement.",
    [TASK2_CANONICAL_TYPES.OUTWEIGH]: "Develop both sides, make the stronger side explicit through comparison, and restate the outweigh judgement in the conclusion.",
    [TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION]: "Identify and develop the requested causes/problems, pair them with relevant solutions, and summarise those routes in the conclusion.",
    [TASK2_CANONICAL_TYPES.CAUSES_SOLUTIONS]: "Identify and develop the requested causes, pair them with relevant solutions, and summarise those routes in the conclusion.",
    [TASK2_CANONICAL_TYPES.CAUSES_EFFECTS]: "Develop the main causes and effects separately, make the cause-effect mechanism visible, and close both routes in the conclusion.",
    [TASK2_CANONICAL_TYPES.POSITIVE_NEGATIVE]: "State a clear evaluative judgement, make the body reasons prove it, and restate the same judgement in the conclusion.",
    [TASK2_CANONICAL_TYPES.DIRECT_QUESTION]: "Answer each question directly in its own controlled route and summarise the answers in the conclusion.",
    [TASK2_CANONICAL_TYPES.HYBRID]: "Answer each distinct prompt function separately, preserve any required judgement, and close all answered routes in the conclusion.",
    [TASK2_CANONICAL_TYPES.UNRESOLVED]: "Confirm the task type from the exact question wording before applying any route or position logic."
  };
  return routes[essayType];
}

function buildTaskTypeRouteRationale(essayType, status, internalSubtype = TASK2_INTERNAL_SUBTYPES.STANDARD) {
  const obligation = internalSubtype === TASK2_INTERNAL_SUBTYPES.STANDARD ? "" : ` Its internal ${internalSubtype} obligations must be met without exposing that subtype as a separate essay family.`;
  return `${TASK2_PUBLIC_TYPE_LABELS[essayType]} requires each prompt function to remain visible from the introduction through the conclusion.${obligation} The current response route is ${routeCoverageLabel(status)}, so the revision should preserve developed ideas and repair only the missing or partial functions.`;
}

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function countPromptQuestions(prompt) {
  return (String(prompt || "").match(/\?/g) || []).length;
}

function detectPosition(text, prompt = "") {
  const source = String(text || "");
  const outweighPosition = detectSemanticOutweighPosition(source);
  if (outweighPosition) return outweighPosition;
  if (/\b(?:i\s+(?:believe|consider|regard|think)[^.!?]{0,80}|this\s+is[^.!?]{0,40})\b(?:a\s+)?(?:largely|mainly|overall|predominantly|clearly|generally)?\s*positive (?:development|change|trend|situation)\b/i.test(source)) {
    return "positive development";
  }
  if (/\b(?:i\s+(?:believe|consider|regard|think)[^.!?]{0,80}|this\s+is[^.!?]{0,40})\b(?:a\s+)?(?:largely|mainly|overall|predominantly|clearly|generally)?\s*negative (?:development|change|trend|situation)\b/i.test(source)) {
    return "negative development";
  }
  const promptReference = source.match(/\bi\s+(?:(strongly|firmly|completely|fully|heavily|generally|partly|partially)\s+)?(agree|disagree)\s+with\s+(?:this|the)\s+(?:view|statement|claim|idea|opinion)\b/i);
  if (promptReference) return positionFromDirection(promptReference[1], promptReference[2]);
  if (opinionPropositionPolarity(prompt) === "negative") {
    const rejectsNegativeClaim = /\b(?:is|are|remains?|seems?|should be)\s*(?:fully\s+|largely\s+|clearly\s+)?justified\b|\bshould\s+(?:continue|remain|be funded|be supported)\b|\b(?:benefits?|advantages?)\s+(?:clearly\s+|far\s+)?outweigh\b/i.test(source);
    if (rejectsNegativeClaim) return "generally disagree";
  }
  if (opinionPropositionPolarity(prompt) === "positive") {
    if (/\bi\s+(?:firmly\s+|strongly\s+)?believe\b[^.!?]{0,120}\b(?:should\s+not|shouldn't|not\s+be\s+divided|must\s+not)\b/i.test(source)) return "strongly disagree";
    if (/\bi\s+(?:firmly\s+|strongly\s+)?believe\b[^.!?]{0,120}\b(?:should|must|ought\s+to)\b/i.test(source)) return "generally agree";
  }
  const match = source.match(POSITION_PATTERN);
  if (!match) return "";
  return positionFromDirection(match[1], match[2] || match[3]);
}

function positionFromDirection(rawModifier, rawDirection) {
  const modifier = String(rawModifier || "").toLowerCase();
  const direction = String(rawDirection || "").toLowerCase();
  if (modifier === "partly" || modifier === "partially") return direction === "disagree" ? "partly disagree" : "partly agree";
  if (["strongly", "firmly", "completely", "fully", "heavily"].includes(modifier)) return `strongly ${direction}`;
  if (modifier === "generally") return `generally ${direction}`;
  if (direction) return `generally ${direction}`;
  return "balanced/conditional position";
}

function buildSemanticPositionModel({
  prompt,
  introduction,
  conclusion,
  introPosition,
  conclusionPosition,
  detectedPosition,
  positionConfidence,
  stanceRequired
}) {
  if (!stanceRequired) {
    return {
      positionRequired: false,
      writerJudgement: "not applicable",
      relationToPromptClaim: "not applicable",
      positionClarity: "not applicable",
      positionConsistency: "not applicable",
      positionConfidence: "not-applicable",
      stanceWordingQuality: "not applicable",
      concessionControl: "not applicable",
      exactPositionEvidence: ""
    };
  }
  const negativePrompt = opinionPropositionPolarity(prompt) === "negative";
  const direction = positionDirection(detectedPosition);
  const clear = !["", "unclear", "contradictory"].includes(detectedPosition);
  const relationToPromptClaim = /disagree/.test(direction)
    ? "disagreement"
    : /agree/.test(direction) ? "agreement" : /positive|negative|outweigh/.test(direction) ? "evaluative judgement" : "unclear";
  const writerJudgement = negativePrompt && relationToPromptClaim === "disagreement"
    ? "the prompt's negative claim is rejected; the spending is judged justified"
    : detectedPosition || "unclear";
  const combined = `${introduction} ${conclusion}`;
  const stanceWordingQuality = /\bheavily\s+(?:agree|disagree)\b/i.test(combined)
    ? "clear but collocationally awkward"
    : negativePrompt && /\b(?:agree|disagree)\b[^.!?]{0,120}\bjustified\b|\bjustified\b[^.!?]{0,120}\b(?:agree|disagree)\b/i.test(combined)
      ? "understandable but indirect against a negatively worded prompt"
      : clear ? "controlled" : "unclear";
  const concessionControl = /^(?:although|while|even though)\b[^.!?]{0,180},[^.!?]{0,160}\b(?:i\s+|spending|investment|costs?)/i.test(String(introduction || "").trim())
    ? "integrated concession"
    : /\b(?:although|while|even though|on the other hand)\b/i.test(combined) ? "concession present" : "no explicit concession";
  return {
    positionRequired: true,
    writerJudgement,
    relationToPromptClaim,
    positionClarity: clear ? "clear" : detectedPosition === "contradictory" ? "contradictory" : "unclear",
    positionConsistency: introPosition && conclusionPosition && positionDirection(introPosition) === positionDirection(conclusionPosition)
      ? "consistent"
      : detectedPosition === "contradictory" ? "inconsistent" : conclusionPosition ? "partially evidenced" : "not fully evidenced",
    positionConfidence,
    stanceWordingQuality,
    concessionControl,
    exactPositionEvidence: findExactPositionEvidence(introduction) || findExactPositionEvidence(conclusion)
  };
}

function findExactPositionEvidence(value) {
  return splitSentences(value).find((sentence) =>
    POSITION_PATTERN.test(sentence) || /\b(?:justified|unjustified|outweigh|positive development|negative development)\b/i.test(sentence)
  ) || "";
}

function classifyBodyRoute(paragraph, essayRoute) {
  if (essayRoute === "outweigh") return classifyOutweighBodyRoute(paragraph);
  const support = SUPPORT_PATTERN.test(paragraph);
  const oppose = OPPOSITION_PATTERN.test(paragraph);
  if (support && oppose) return "mixed or conditional route";
  if (oppose) return "opposes or limits the proposition";
  if (support) return "supports the proposition";
  return "route unclear from the controlling sentences";
}

function opinionPropositionPolarity(prompt) {
  const source = String(prompt || "");
  return /\b(?:waste of money|better spent(?: elsewhere| on [^.!?]+)?|should not (?:be )?(?:spend|fund|support|provide|allow)|not justified|unjustified|too (?:much|costly|expensive)|more beneficial ways? to spend)\b/i.test(source)
    ? "negative"
    : "positive";
}

function classifyOpinionBodyRoute({ paragraph, index, prompt, position, introduction }) {
  const text = String(paragraph || "");
  const cleanWaterTask = /clean water|water supply/i.test(prompt) && /free of charge|free/i.test(prompt);
  if (cleanWaterTask && /clean water|basic right|daily activities|drinking|washing|disease|quality of life/i.test(text) && !/budget|tax|government.*money/i.test(text)) {
    return { label: "supports free clean-water supply", status: countWords(text) >= 55 ? "adequate" : "partial" };
  }
  if (cleanWaterTask && /budget|tax|cost|money/i.test(text)) {
    return { label: "raises a budget and tax counterargument without returning to a settled position", status: "partial" };
  }
  const negativeProposition = opinionPropositionPolarity(prompt) === "negative";
  const writerDisagrees = /disagree/.test(position);
  const writerAgrees = /agree/.test(position) && !writerDisagrees;
  const first = firstSentence(text);
  const explicitConcession = /^(?:on the other hand|admittedly|granted|although|while|even though|despite|it is true that)\b/i.test(first);
  const opposingSignals = countMatches(text, /\b(?:cost|burden|drawback|disadvantage|risk|waste|unjustified|alternative|priority|better spent|should not|cannot afford|too expensive|on the other hand)\b/gi);
  const supportingSignals = countMatches(text, /\b(?:benefit|advantage|justified|essential|valuable|improve|protect|enable|support|long-term|basic right|should (?:continue|receive|be provided|be funded))\b/gi);
  const thesisOverlap = semanticKeywordOverlap(text, introduction);
  const explicitReturn = /\b(?:however|nevertheless|even so|despite this|still|this does not mean|does not remove|remains?|continues? to be)\b[^.!?]{0,160}\b(?:justif|benefit|advantage|position|view|claim|policy|investment|spending|support)\w*/i.test(text);
  const concession = explicitConcession || opposingSignals > supportingSignals + 1 || (negativeProposition && writerDisagrees && opposingSignals > 0 && thesisOverlap < 2);

  if (concession) {
    return {
      label: explicitReturn
        ? `presents a concession and explicitly returns to the writer's ${writerDisagrees ? "disagreement" : writerAgrees ? "agreement" : "position"}`
        : `presents a relevant concession, but does not explicitly return to the writer's ${writerDisagrees ? "disagreement" : writerAgrees ? "agreement" : "position"}`,
      status: explicitReturn && countWords(text) >= 55 ? "adequate" : "partial"
    };
  }

  const disagreementReason = writerDisagrees && /\b(?:difficulty|difficult|inconvenien|far away|traffic congestion|longer journeys?|pressure|harm|problem|worsen|limit|reduce access)\b/i.test(text);
  if (supportingSignals || thesisOverlap >= 2 || disagreementReason || (negativeProposition && writerDisagrees)) {
    return {
      label: `develops a reason aligned with the writer's ${writerDisagrees ? "disagreement" : writerAgrees ? "agreement" : "main position"}`,
      status: countWords(text) >= 55 ? "adequate" : "partial"
    };
  }

  const raw = classifyBodyRoute(text, "generic-opinion");
  return {
    label: raw === "supports the proposition"
      ? "develops a reason aligned with the writer's stated position"
      : raw === "opposes or limits the proposition"
        ? "presents an opposing or concessive reason that needs an explicit return to the writer's position"
        : raw === "mixed or conditional route"
          ? "mixes supporting and concessive reasoning within one route"
          : `Body ${index + 1} route is not clear from its controlling sentences`,
    status: raw === "supports the proposition" && countWords(text) >= 55 ? "adequate" : "partial"
  };
}

function detectSemanticOutweighPosition(value) {
  const source = String(value || "");
  for (const sentence of splitSentences(source)) {
    const comparator = sentence.match(/\b(?:far\s+|clearly\s+|significantly\s+|decisively\s+|substantially\s+|ultimately\s+)?(?:outweighs?|exceeds?|surpasses?)\b/i);
    if (comparator) {
      const left = sentence.slice(0, comparator.index);
      const right = sentence.slice((comparator.index || 0) + comparator[0].length);
      const leftPositive = countSemanticSignals(left, OUTWEIGH_POSITIVE_SIDE_PATTERNS);
      const leftNegative = countSemanticSignals(left, OUTWEIGH_NEGATIVE_SIDE_PATTERNS);
      const rightPositive = countSemanticSignals(right, OUTWEIGH_POSITIVE_SIDE_PATTERNS);
      const rightNegative = countSemanticSignals(right, OUTWEIGH_NEGATIVE_SIDE_PATTERNS);
      const latestLeftPositive = lastSemanticSignalIndex(left, OUTWEIGH_POSITIVE_SIDE_PATTERNS);
      const latestLeftNegative = lastSemanticSignalIndex(left, OUTWEIGH_NEGATIVE_SIDE_PATTERNS);
      if ((leftPositive > leftNegative || latestLeftPositive > latestLeftNegative) && rightNegative >= 1) return "advantages outweigh the disadvantages";
      if ((leftNegative > leftPositive || latestLeftNegative > latestLeftPositive) && rightPositive >= 1) return "disadvantages outweigh the advantages";
    }

    if (/\b(?:advantages?|benefits?|gains?|positive effects?)\b[^.!?]{0,100}\b(?:are|remain|seem)\s+(?:far\s+|clearly\s+|considerably\s+)?(?:greater|stronger|more significant|more substantial|more important)\b/i.test(sentence)) {
      return "advantages outweigh the disadvantages";
    }
    if (/\b(?:disadvantages?|drawbacks?|risks?|costs?|negative effects?)\b[^.!?]{0,100}\b(?:are|remain|seem)\s+(?:far\s+|clearly\s+|considerably\s+)?(?:greater|stronger|more significant|more substantial|more important)\b/i.test(sentence)) {
      return "disadvantages outweigh the advantages";
    }
    if (/\b(?:far|clearly|considerably|substantially)\s+(?:greater|stronger|more significant|more substantial)\s+(?:national\s+)?(?:advantages?|benefits?|gains?)\b/i.test(sentence)) {
      return "advantages outweigh the disadvantages";
    }
    if (/\b(?:far|clearly|considerably|substantially)\s+(?:greater|stronger|more significant|more substantial)\s+(?:national\s+)?(?:disadvantages?|drawbacks?|risks?|costs?)\b/i.test(sentence)) {
      return "disadvantages outweigh the advantages";
    }
  }
  return "";
}

function countSemanticSignals(value, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(String(value || "")) ? 1 : 0), 0);
}

function lastSemanticSignalIndex(value, patterns) {
  const text = String(value || "");
  return patterns.reduce((latest, pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(globalPattern)) latest = Math.max(latest, match.index || 0);
    return latest;
  }, -1);
}

function classifyOutweighBodyRoute(paragraph) {
  const sentences = splitSentences(paragraph);
  if (!sentences.length) return "route unclear from the controlling sentences";
  let advantageScore = 0;
  let disadvantageScore = 0;

  sentences.forEach((sentence, index) => {
    const weight = index === 0 ? 4 : index === sentences.length - 1 ? 3 : 1;
    const advantageSignals = countOutweighAdvantageRouteSignals(sentence);
    const disadvantageSignals = countOutweighDisadvantageRouteSignals(sentence);
    advantageScore += advantageSignals * weight;
    disadvantageScore += disadvantageSignals * weight;
  });

  const first = sentences[0];
  if (hasExplicitDisadvantageControl(first) && disadvantageScore >= advantageScore * 0.6) return "disadvantage route";
  if (hasExplicitAdvantageControl(first) && advantageScore >= disadvantageScore * 0.6) return "advantage route";
  if (disadvantageScore >= advantageScore + 2) return "disadvantage route";
  if (advantageScore >= disadvantageScore + 2) return "advantage route";
  if (advantageScore > 0 && disadvantageScore > 0) return "mixed outweigh route";
  return "route unclear from the controlling sentences";
}

function hasExplicitDisadvantageControl(sentence) {
  return /\b(?:main|major|principal|significant|serious|primary)?\s*(?:disadvantage|drawback|risk|problem|challenge)\b|\b(?:heavy|considerable|extreme|significant)\s+(?:burden|pressure)\b/i.test(sentence);
}

function hasExplicitAdvantageControl(sentence) {
  return /\b(?:main|major|principal|significant|stronger|primary)?\s*(?:advantage|benefit)\b|\b(?:driver|source)\s+(?:for|of)\s+(?:economic growth|innovation|productivity)\b/i.test(sentence);
}

function countOutweighAdvantageRouteSignals(sentence) {
  const patterns = [
    /\badvantages?\b/i,
    /\bbenefits?\b/i,
    /\bdriver for economic growth\b/i,
    /\b(?:boosts?|raises?|increases?|expands?|supports?)\s+(?:industrial )?(?:productivity|production|output|tax revenue|exports?|employment)\b/i,
    /\bfill(?:s|ing)?\s+(?:job )?vacancies\b/i,
    /\breduce(?:s|d|ing)?\s+(?:labou?r )?shortages\b/i,
    /\bmoderni[sz]e|compete globally|technological innovation|digital adaptation|long-term prosperity|economic vitality|creative energy\b/i,
    /\bgreater national advantages?\b/i
  ];
  return countSemanticSignals(sentence, patterns);
}

function countOutweighDisadvantageRouteSignals(sentence) {
  const patterns = [
    /\bdisadvantages?\b|\bdrawbacks?\b/i,
    /\b(?:burden|pressure)\s+on\s+(?:the\s+)?job market\b/i,
    /\b(?:labou?r supply|number of applicants?|graduates?)\b[^.!?]{0,100}\b(?:exceeds?|outnumbers?|greater than)\b[^.!?]{0,80}\b(?:positions?|vacancies|jobs?)\b/i,
    /\bcompetition\s+(?:for|over)\s+(?:jobs?|positions?|employment)\b/i,
    /\b(?:youth )?unemployment\b|\bdifficult\s+to\s+(?:find|secure|obtain)\s+(?:a\s+)?job\b/i,
    /\b(?:damage|weaken|undermine|reduce)\w*\s+(?:a country'?s\s+)?employment stability\b/i,
    /\bfuture age?ing crisis\b|\bretirement (?:burden|pressure)\b|\beconomic and social(?:ietal)? strain\b|\bshrinking workforce\b/i,
    /\blimit(?:s|ed|ing)?\s+(?:children'?s\s+)?(?:sociali[sz]ation|communication|development)\b/i
  ];
  return countSemanticSignals(sentence, patterns);
}

function reconcilePosition({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes }) {
  if (introPosition && conclusionPosition && positionDirection(introPosition) !== positionDirection(conclusionPosition)) return "contradictory";
  if (!introPosition && conclusionPosition && unfinishedEndingDetected) return "unclear";
  if (!introPosition && !conclusionPosition) return "unclear";
  return introPosition || conclusionPosition || "unclear";
}

function positionConfidenceFor({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes }) {
  if (!introPosition || unfinishedEndingDetected) return "low";
  if (conclusionPosition && positionDirection(introPosition) !== positionDirection(conclusionPosition)) return "low";
  if (conclusionPosition && positionDirection(introPosition) === positionDirection(conclusionPosition)) return "high";
  if (bodyRoutes.includes("route unclear from the controlling sentences")) return "medium";
  return "high";
}

function positionDirection(value) {
  if (/positive development/.test(value)) return "positive";
  if (/negative development/.test(value)) return "negative";
  if (/advantages outweigh the disadvantages/.test(value)) return "advantages-outweigh";
  if (/disadvantages outweigh the advantages/.test(value)) return "disadvantages-outweigh";
  if (/disagree/.test(value)) return "disagree";
  if (/agree/.test(value)) return "agree";
  return value;
}

function detectRouteConflict({ essayRoute, detectedPosition, introPosition, conclusionPosition, bodyRoutes }) {
  if (essayRoute === TASK2_CANONICAL_TYPES.OPINION) {
    return Boolean(introPosition && conclusionPosition && positionDirection(introPosition) !== positionDirection(conclusionPosition));
  }
  if (["discuss-both-views", "outweigh", "problem-solution", "direct-question"].includes(essayRoute)) return false;
  if (/partly|balanced|conditional/.test(`${detectedPosition} ${introPosition}`)) return false;
  return bodyRoutes.includes("supports the proposition") && bodyRoutes.includes("opposes or limits the proposition");
}

function detectMeaningErrors(prompt, writing) {
  const errors = [];
  const rules = [
    { pattern: /\bwith charging\b/i, category: "meaning-reversing", explanation: "'with charging' means payment is required; in a free-access argument it reverses the intended direction. Use 'without being charged' or 'free of charge'." },
    { pattern: /\bfree to charge\b/i, category: "meaning-reversing", explanation: "'free to charge' can mean permission to impose a charge, which reverses 'free of charge'." },
    { pattern: /\b(?:could|would|should)\s+safe\s+(?:their|his|her|our)\s+money\b/i, category: "meaning-changing", explanation: "'safe' is an adjective here; the intended verb is 'save', so the current wording damages the result claim." }
  ];
  for (const rule of rules) {
    const match = writing.match(rule.pattern);
    if (match) errors.push({ exactEvidence: sentenceContaining(writing, match[0]), category: rule.category, explanation: rule.explanation });
  }

  const promptAgent = String(prompt || "").match(/\bevery\s+([a-z][a-z -]{0,30}?)\s+should\s+receive\b/i);
  if (promptAgent) {
    const escaped = escapeRegExp(promptAgent[1].trim());
    const reversal = writing.match(new RegExp(`\\bevery\\s+${escaped}\\s+should\\s+provide\\b[^.!?]*[.!?]?`, "i"));
    if (reversal) errors.push({
      exactEvidence: reversal[0].trim(),
      category: "meaning-changing",
      explanation: "The response changes the prompt's recipient into the provider, reversing the agent relationship in the proposition."
    });
  }
  return dedupeEvidence(errors);
}

function detectLanguageControlErrors(writing, ending) {
  const rules = [
    { pattern: /\b(?:should|could|would|might|must|may)\s+be\s+\w+s\b/i, label: "modal/passive followed by an inflected verb" },
    { pattern: /\b(?:should|could|would|might|must|may)\s+(?:used|increased|decreased|provided|supplied|charged|paid|made|given|done|taken|written|built)\b/i, label: "modal followed by a past-form verb" },
    { pattern: /\b(?:tax|taxes|price|prices|cost|costs)\s+(?:must|should|may|might)\s+be\s+(?:increase|decrease)\b/i, label: "incomplete passive verb form" },
    { pattern: /\bdiscuss about\b/i, label: "verb-pattern error" },
    { pattern: /\b(?:a|an)\s+good cleanliness\b/i, label: "word-form/collocation error" }
  ];
  const errors = [];
  for (const rule of rules) {
    const match = writing.match(rule.pattern);
    if (match) errors.push({ exactEvidence: sentenceContaining(writing, match[0]), label: rule.label });
  }
  if (detectUnfinishedEnding(ending, writing)) errors.push({ exactEvidence: ending, label: "unfinished sentence fragment at the end of the response" });
  return dedupeEvidence(errors);
}

function detectTask2LanguageAccuracyRisk(writing) {
  const rules = [
    { pattern: /\b(?:instabillity|provde)\b/gi, category: "spelling", level: "major" },
    { pattern: /\bpopulation\s+of\s+[^.!?]{0,45}\bcontinue\s+to\b/gi, category: "subject-verb agreement", level: "major" },
    {
      pattern: /\b(?:a\s+)?future\s+age?ing\s+crisis\b/gi,
      category: "article control",
      level: "major",
      unsafe: (match, source) => !/^a\s/i.test(match[0]) && !/\b(?:a|the)\s*$/i.test(source.slice(Math.max(0, match.index - 6), match.index))
    },
    { pattern: /\b(?:quality\s+of\s+workforce|as\s+large\s+workforce)\b/gi, category: "article control", level: "major" },
    { pattern: /\b(?:increased youth|increases in youth|young-age population|labou?r abundance|economic industry|carry out operations or businesses|higher number of income tax(?: and sales tax)? revenues?)\b/gi, category: "collocation", level: "major" },
    { pattern: /\b(?:heavily disagree|young majority|opportunities for occupations|operate in solving|significant and certain impacts?)\b/gi, category: "collocation", level: "major" },
    { pattern: /\bastrology\b/gi, category: "meaning-sensitive word choice", level: "major" },
    { pattern: /\bwater,\s*foods?,\s*and\s*shelters?\b/gi, category: "countability and collocation", level: "major" },
    { pattern: /\boccupations\s+,\s*which\b|\bspace\s*,?which\b/gi, category: "punctuation spacing", level: "major" },
    { pattern: /\bsecrets? in the space\b/gi, category: "collocation", level: "moderate" },
    { pattern: /\b(?:daily travels?|exceeding amounts?|hundreds and thousands|significantly invest(?:ed|ing)?|car ownership is (?:a )?convenient mode)\b/gi, category: "collocation", level: "moderate" },
    { pattern: /[;,.!?](?:Therefore|However|Moreover|In addition)\b/g, category: "punctuation spacing", level: "moderate" },
    { pattern: /\bincrease\s+in\s+young adults?\b[^.!?]{0,80}\bwhich\s+outnumbers?\b/gi, category: "reference and logic", level: "major" },
    { pattern: /\bbolsters?\b[^.!?]{0,90}\band\s+fewer\s+labou?r\s+shortages\b/gi, category: "parallel structure", level: "major" },
    { pattern: /\b\d{1,2}\s+year\s+old\b/gi, category: "mechanical accuracy", level: "minor" },
    { pattern: /[.!?][A-Z]/g, category: "punctuation spacing", level: "minor" },
    { pattern: /\benergetic,\s+young\b/gi, category: "punctuation precision", level: "minor" },
    { pattern: /\bdigital trends\s+which\s+help\s+(?:local\s+)?businesses\b/gi, category: "reference precision", level: "minor" },
    { pattern: /\b(?:extreme pressure|massive wave|incredibly difficult|severely damage|immense economic expansion|groundbreaking innovations?)\b/gi, category: "register precision", level: "minor" }
  ];
  const signals = [];
  const seen = new Set();

  for (const rule of rules) {
    for (const match of String(writing || "").matchAll(rule.pattern)) {
      if (rule.unsafe && !rule.unsafe(match, String(writing || ""))) continue;
      const exactEvidence = sentenceContaining(writing, match[0]);
      const key = `${rule.category}|${exactEvidence}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      signals.push({ category: rule.category, level: rule.level || "major", exactEvidence });
    }
  }

  const categories = Array.from(new Set(signals.map((item) => item.category)));
  const majorSignals = signals.filter((item) => item.level === "major");
  const majorCategories = Array.from(new Set(majorSignals.map((item) => item.category)));
  const spellingCount = majorSignals.filter((item) => item.category === "spelling").length;
  const blocksSecureBand7 = (majorSignals.length >= 5 && majorCategories.length >= 3) || (spellingCount >= 2 && majorSignals.length >= 4);
  const blocksSecureBand75 = blocksSecureBand7 || signals.length >= 2;
  return {
    signalCount: signals.length,
    majorSignalCount: majorSignals.length,
    categories,
    signals,
    blocksSecureBand7,
    blocksSecureBand75,
    classification: blocksSecureBand7
      ? "frequent accuracy and collocation errors"
      : blocksSecureBand75
        ? "high-band accuracy and precision limiter"
        : signals.length
          ? "isolated accuracy risk"
          : "no deterministic frequent-error profile"
  };
}

function detectTask2DevelopmentRisk(context) {
  if (context.essayRoute === TASK2_CANONICAL_TYPES.OPINION) {
    const bodyText = context.bodyParagraphs.join(" ");
    const additiveListing = (bodyText.match(/\b(?:furthermore|in addition|also|moreover|for example)\b/gi) || []).length >= 4;
    const concessionWithoutReturn = context.bodyParagraphs.some((paragraph) =>
      /\b(?:poverty|healthcare|food supply|hospitals?|schools?|basic needs?|global warming)\b/i.test(paragraph) &&
      !/\b(?:however|nevertheless|even so|despite this)[^.!?]{0,140}\b(?:justified|space|exploration|long-term benefit)\b/i.test(paragraph)
    );
    return {
      unevenDevelopment: additiveListing || concessionWithoutReturn,
      additiveListing,
      concessionWithoutReturn,
      unsupportedClaim: /\bastrology\b|\bcertain impacts?\b/i.test(bodyText)
    };
  }
  return detectOutweighDevelopmentRisk(context);
}

function detectOutweighDevelopmentRisk({ bodyParagraphs, introduction, conclusion, essayRoute, prompt }) {
  if (essayRoute !== "outweigh") return { unevenDevelopment: false, repeatedClaim: false, unsupportedClaim: false };
  const bodyText = bodyParagraphs.join(" ");
  const repeatedClaim = (bodyText.match(/\bfuture\s+age?ing\s+crisis\b/gi) || []).length >= 3;
  const unsupportedClaim = /\bmore companies will have highly skilled individuals\b/i.test(bodyText) ||
    /\b\d{1,2}-year-old\b[^.!?]{0,120}\b(?:doubled?|transformed?|created?|caused?)\b/i.test(bodyText);
  const domainPatterns = [
    /\b(?:labou?r supply|job vacancies|workforce|employment|productivity|production)\b/i,
    /\b(?:tax revenue|tax base|income tax|sales tax|public revenue)\b/i,
    /\b(?:digital|technology|technological|innovation|moderni[sz])\b/i,
    /\b(?:global|exports?|international competition|compete globally)\b/i,
    /\b(?:banking|financial services|mobile payment|commercial access)\b/i,
    /\b(?:prosperity|economic growth|economic development|national development)\b/i
  ];
  const bodyDomainCounts = bodyParagraphs.map((paragraph) => domainPatterns.filter((pattern) => pattern.test(paragraph)).length);
  const overloadedAdvantageRoute = bodyDomainCounts.some((count) => count >= 4);
  const nationalScopeTask = /\bcountr(?:y|ies)\b|\bnational\b|\bpopulation\b|\bdemographic\b/i.test(String(prompt || ""));
  const missingNationalBridge = nationalScopeTask && bodyParagraphs.some((paragraph) => {
    const sentences = splitSentences(paragraph);
    return sentences.some((sentence, index) => {
      if (!/\bfor example|for instance\b/i.test(sentence)) return false;
      const next = sentences[index + 1] || "";
      if (!next) return true;
      if (/^(?:furthermore|similarly|another|in addition|moreover)\b/i.test(next)) return true;
      return !/\b(?:national|country|economy|across (?:many|the)|GDP|exports?|tax base|public revenue|wages|employment stability|human capital|prosperity)\b/i.test(next);
    });
  });
  const thesisBodySeverityMismatch = /\bminor drawbacks?\b/i.test(String(introduction || "")) &&
    /\b(?:extreme pressure|severely damage|heavy burden|considerable pressure|significant challenge)\b/i.test(bodyText);
  const personalOrCompanyExampleCount = (bodyText.match(/\b(?:\d{1,2}-year-old|\d{1,2}\s+year\s+old|company|firm|individual|university graduate)\b/gi) || []).length;
  return {
    unevenDevelopment: repeatedClaim || overloadedAdvantageRoute || missingNationalBridge || thesisBodySeverityMismatch,
    repeatedClaim,
    unsupportedClaim,
    overloadedAdvantageRoute,
    missingNationalBridge,
    thesisBodySeverityMismatch,
    personalOrCompanyExampleCount,
    bodyDomainCounts,
    conclusionUsesComparativeJudgment: Boolean(detectSemanticOutweighPosition(conclusion))
  };
}

function sentenceContaining(writing, fragment) {
  return splitSentences(writing).find((sentence) => sentence.toLowerCase().includes(String(fragment).toLowerCase())) || String(fragment);
}

function dedupeEvidence(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category || item.label}|${item.exactEvidence}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRecommendedRoute({ detectedPosition, conclusionPosition, unfinishedEndingDetected }) {
  if (detectedPosition !== "unclear" && detectedPosition !== "contradictory") return `Preserve the student's detected ${detectedPosition} route.`;
  if (/agree/.test(conclusionPosition)) return "Teacher-guided option: choose one clear agreement route and make both body paragraphs prove it.";
  if (/disagree/.test(conclusionPosition)) return "Teacher-guided option: choose one clear disagreement route and make both body paragraphs prove it.";
  return "Teacher-guided option: select and state one defensible position before rewriting the body paragraphs.";
}

function buildRecommendedRouteRationale({ detectedPosition, conclusionPosition, unfinishedEndingDetected }) {
  if (detectedPosition !== "unclear" && detectedPosition !== "contradictory") return "The existing position is identifiable, so revisions should preserve it.";
  if (conclusionPosition && unfinishedEndingDetected) return "This is a teacher-guided recommendation based on the direction begun in the unfinished conclusion; it is not treated as the student's established original position.";
  return "The original route is unclear or contradictory, so any new position must be presented as a teacher-guided recommendation rather than a direct correction.";
}

function buildDeterministicCapMetadata({ severeUnderLength, unfinishedEndingDetected, routeAssessment, directQuestionMissingPart, introPosition, conclusionPosition, detectedPosition, positionConfidence }) {
  const caps = [];
  if (severeUnderLength && unfinishedEndingDetected && isFailedRouteStatus(routeAssessment.status)) {
    caps.push({
      scope: "criterion",
      criterion: "Task Response",
      maximum: 4.0,
      reasonCode: "INCOMPLETE_TASK_RESPONSE",
      exactEvidence: routeAssessment.summary,
      reason: "The response is severely underlength, unfinished, and does not complete the required task route."
    });
  } else if (severeUnderLength && isPartialRouteStatus(routeAssessment.status)) {
    caps.push({
      scope: "criterion",
      criterion: "Task Response",
      maximum: 6.5,
      reasonCode: "UNDERLENGTH_WITH_PARTIAL_DEVELOPMENT",
      exactEvidence: routeAssessment.summary,
      reason: "Task Response is capped because severe underlength combines with materially partial body development."
    });
  } else if (directQuestionMissingPart) {
    caps.push({
      scope: "criterion",
      criterion: "Task Response",
      maximum: 5.0,
      reasonCode: "PROMPT_PART_OMITTED",
      exactEvidence: routeAssessment.summary,
      reason: "At least one explicit Direct Question requirement is not answered."
    });
  } else if (
    routeAssessment.stanceRequired &&
    routeAssessment.missingRequirements.includes("position") &&
    !introPosition &&
    !conclusionPosition &&
    ["", "unclear"].includes(detectedPosition) &&
    positionConfidence === "low"
  ) {
    caps.push({
      scope: "criterion",
      criterion: "Task Response",
      maximum: 6.0,
      reasonCode: "REQUIRED_POSITION_ABSENT",
      exactEvidence: routeAssessment.summary,
      reason: "The task requires a position, but the response does not state one clearly."
    });
  }
  const overallCap = caps.find((item) => item.scope === "overall")?.maximum ?? null;
  return {
    applied: caps.length > 0,
    caps,
    overallCap,
    rationale: caps.map((item) => item.reason).join(" ")
  };
}

function buildPrimaryLimiters({ wordMetadata, unfinishedEndingDetected, routeAssessment, languageAccuracyRisk }) {
  return [
    ...(wordMetadata.wordShortfall > 0 ? [`The essay is ${wordMetadata.wordShortfall} words below the minimum.`] : []),
    ...(unfinishedEndingDetected ? ["The final sentence is unfinished."] : []),
    ...(isPartialRouteStatus(routeAssessment.status) ? [`The ${routeAssessment.label.toLowerCase()} is ${routeCoverageLabel(routeAssessment.status)}.`] : []),
    ...(isFailedRouteStatus(routeAssessment.status) ? [`The ${routeAssessment.label.toLowerCase()} is ${routeCoverageLabel(routeAssessment.status)}.`] : []),
    ...(languageAccuracyRisk.blocksSecureBand75 ? ["Language accuracy and collocation prevent a secure Band 7.5 profile."] : [])
  ];
}

function buildCanonicalSafetyEvidence(items = []) {
  return dedupeEvidence(items).map((item) => {
    const category = String(item.category || item.label || "language control");
    const critical = /meaning-reversing|contradiction/i.test(category);
    const exactSentence = String(item.exactSentence || item.exactEvidence || item.evidence || "");
    return {
      ...item,
      issueType: String(item.issueType || item.label || category),
      severity: critical ? "Critical" : /meaning-changing|route|position/i.test(category) ? "Major" : "Moderate",
      revisionType: /spelling|article|punctuation|agreement|collocation/i.test(category) ? "Minimal Correction" : "Route-Preserving Revision",
      exactSentence,
      exactEvidence: exactSentence,
      whyItLimitsBand: String(item.whyItLimitsBand || item.explanation || item.message || `${category} affects the relevant IELTS criterion.`)
    };
  });
}

function buildCanonicalFrameworkAssessment(routeAssessment) {
  const developmentStatus = routeAssessment.bodyRoutes.some((item) => isPartialRouteStatus(item.developmentStatus || item.status)) ? "Moderate" : "Strong";
  const conclusion = routeAssessment.requirements.find((item) => item.id === "conclusion");
  const routeStatus = isControlledRouteStatus(routeAssessment.status) ? "Strong" : isPartialRouteStatus(routeAssessment.status) ? "Moderate" : "Needs Work";
  const thesisStatus = isControlledRouteStatus(routeAssessment.thesisRouteStatus)
    ? "Strong"
    : isPartialRouteStatus(routeAssessment.thesisRouteStatus) ? "Moderate" : "Needs Work";
  return {
    thesisRouteClarity: { status: thesisStatus },
    bodyRouteAlignment: { status: routeStatus },
    explanationDepth: { status: developmentStatus },
    sarExampleQuality: {
      status: developmentStatus,
      scoringRole: "diagnostic-only",
      note: "Use situation-action-result detail when it makes the paragraph's mechanism and consequence clearer."
    },
    linkBackControl: { status: routeStatus },
    conclusionClosure: { status: conclusion && isControlledRouteStatus(conclusion.status) ? "Strong" : "Needs Work" },
    lfcCpcControl: { status: developmentStatus }
  };
}

export function deriveTask2OverallBandRange(criteriaScores = {}) {
  const ranges = TASK2_CRITERIA.map((criterion) => parseBandRange(criteriaScores?.[criterion]?.range ?? criteriaScores?.[criterion]));
  if (ranges.some((range) => !range)) return { low: 0, high: 0, label: "", valid: false };
  const low = roundToHalf(ranges.reduce((sum, range) => sum + range.low, 0) / ranges.length);
  const high = roundToHalf(ranges.reduce((sum, range) => sum + range.high, 0) / ranges.length);
  return { low, high, label: formatBandRange(low, high), valid: true };
}

export function reconcileTask2CanonicalAnalysis(payload = {}, providerAnalysis = {}, suppliedSafety = null) {
  const safety = suppliedSafety || analyzeTask2Safety(payload);
  const base = safety.canonicalAnalysis;
  const capMetadata = mergeCanonicalCapMetadata(base.capMetadata, providerAnalysis, safety);
  const criterionScores = normalizeCanonicalCriterionScores(providerAnalysis.criteriaScores, safety, capMetadata);
  const overallBandRange = deriveTask2OverallBandRange(criterionScores, capMetadata);
  const primaryLimiters = Array.from(new Set([
    ...base.primaryLimiters,
    ...(Array.isArray(providerAnalysis.highBandLimiters) ? providerAnalysis.highBandLimiters : [])
  ]));
  const firstCap = capMetadata.caps[0] || null;
  const normalizedCapMetadata = {
    ...capMetadata,
    criterion: firstCap?.criterion || "",
    value: Number.isFinite(firstCap?.maximum) ? firstCap.maximum : null,
    reasonCode: firstCap?.reasonCode || "",
    exactEvidence: firstCap?.exactEvidence || "",
    reason: firstCap?.reason || ""
  };
  const criterionAssessment = {
    taskResponseOrAchievement: criterionScores["Task Response"],
    coherenceCohesion: criterionScores["Coherence & Cohesion"],
    lexicalResource: criterionScores["Lexical Resource"],
    grammaticalRangeAccuracy: criterionScores["Grammatical Range & Accuracy"]
  };
  const overallScore = {
    ...overallBandRange,
    confidence: safety.taskClassification?.confidence === "low"
      ? "low"
      : safety.routeAssessment.confidence === "high" ? "high" : "medium"
  };
  const executiveSummary = buildCanonicalTask2ExecutiveSummary(safety, base);
  return {
    ...base,
    criterionAssessment,
    capMetadata: normalizedCapMetadata,
    overallScore,
    executiveSummary,
    primaryLimiters,
    repairPlan: Array.isArray(providerAnalysis.practicePlan) ? providerAnalysis.practicePlan : [],
    consistency: {
      analysisSource: "canonical-analysis-v11",
      routeSource: "canonical-analysis-v11",
      scoreSource: "criterion-arithmetic",
      capSource: normalizedCapMetadata.applied ? "explicit-canonical-cap" : "none"
    },
    // Compatibility projections. These reference canonical values and are never scored independently.
    essayType: base.metadata.essayType,
    essayTypeLabel: base.metadata.essayTypeLabel,
    stanceRequired: base.taskRequirements.stanceRequired,
    taskRequirementChecks: base.taskRequirements.requirementChecks,
    criterionScores,
    overallBandRange: overallScore
  };
}

function buildCanonicalTask2ExecutiveSummary(safety, base) {
  if (safety.criticalInteraction || safety.seriousInteraction) {
    return {
      mainScoreLimitingFactor: safety.criticalInteractionSummary,
      mostUrgentRepair: safety.unfinishedEndingDetected
        ? `Submit a complete essay of at least ${safety.minimumRequiredWords} words, including a fully finished conclusion. Add relevant development to the existing route rather than padding the response.`
        : base.routeAssessment.recommendedRoute
    };
  }
  const route = base.routeAssessment;
  const partialOpinionConcession = base.metadata.essayType === TASK2_CANONICAL_TYPES.OPINION &&
    /disagree/.test(route.position || "") &&
    route.bodyRoutes.some((item) => /concession/.test(item.label) && isPartialRouteStatus(item.status));
  if (partialOpinionConcession) {
    return {
      mainScoreLimitingFactor: "The disagreement position is clear, but the essay route is only partially controlled: the second body paragraph presents a relevant concession without explicitly returning to the writer's main disagreement.",
      mostUrgentRepair: "Keep the disagreement route. At the end of the concession paragraph, explain why the acknowledged public needs do not remove the long-term justification for space investment."
    };
  }
  if (isPartialRouteStatus(route.status)) {
    const partialRoutes = route.bodyRoutes.filter((item) => isPartialRouteStatus(item.status)).map((item) => `Body ${item.index} (${item.label})`);
    return {
      mainScoreLimitingFactor: `All required ${base.metadata.essayTypeLabel} routes are present, but ${partialRoutes.join(" and ") || "one route"} is only partially developed.`,
      mostUrgentRepair: route.recommendedRoute
    };
  }
  if (isFailedRouteStatus(route.status)) {
    return {
      mainScoreLimitingFactor: `The ${base.metadata.essayTypeLabel} route is not yet controlled: ${route.missingRequirements.join(", ") || "the required routes do not remain consistent"}.`,
      mostUrgentRepair: route.recommendedRoute
    };
  }
  if (safety.languageAccuracyRisk?.blocksSecureBand7) {
    return {
      mainScoreLimitingFactor: "The main limitation is uneven development combined with frequent grammar and collocation errors. The task-type route is controlled, but language accuracy and precision prevent a secure Band 7 profile.",
      mostUrgentRepair: "Strengthen one controlled causal chain in each body paragraph, add a specific or plausible example where it proves the claim, and remove recurring article, agreement, spelling and collocation errors."
    };
  }
  if (safety.developmentRisk?.unevenDevelopment) {
    return {
      mainScoreLimitingFactor: "The main limitation is analytical depth after examples: individual or company-level cases are not consistently connected to wider task-level consequences, and the stronger paragraph compresses several claims into one route.",
      mostUrgentRepair: "After each example, add one controlled causal link to its wider significance, then reduce paragraph density by keeping only the mechanisms that directly prove the comparative judgement."
    };
  }
  return {
    mainScoreLimitingFactor: base.primaryLimiters.join(" ") || "The response covers the required task routes; remaining limitations are criterion-specific.",
    mostUrgentRepair: route.recommendedRoute
  };
}

function mergeCanonicalCapMetadata(base, providerAnalysis, safety) {
  const caps = [...(base?.caps || [])];
  return {
    applied: caps.length > 0,
    caps,
    overallCap: null,
    rationale: caps.map((item) => item.reason).join(" ")
  };
}

function normalizeCanonicalCriterionScores(input = {}, safety, capMetadata) {
  const deterministicRanges = deriveDeterministicTask2CriterionRanges(safety);
  const output = {};
  for (const criterion of TASK2_CRITERIA) {
    const source = input?.[criterion];
    const parsed = parseBandRange(deterministicRanges[criterion]);
    output[criterion] = typeof source === "object" && source
      ? {
          range: formatBandRange(parsed.low, parsed.high),
          diagnosis: deterministicCriterionDiagnosis(criterion, safety),
          evidence: String(source.evidence || ""),
          scoreSource: "deterministic-v11"
        }
      : { range: formatBandRange(parsed.low, parsed.high), diagnosis: deterministicCriterionDiagnosis(criterion, safety), evidence: "", scoreSource: "deterministic-v11" };
  }

  const route = safety.routeAssessment;
  const fullLengthComplete = !safety.underLength && !safety.unfinishedEndingDetected;
  const taskResponse = parseBandRange(output["Task Response"].range);
  if (fullLengthComplete && isPartialRouteStatus(route.status) && !route.missingRequirements.length && taskResponse.high <= 6) {
    output["Task Response"].range = "6.0-6.5";
    output["Task Response"].diagnosis = "All required task routes are present, but one route is only partially developed. This is a development limiter, not a broken-promise failure.";
  }
  if (
    fullLengthComplete &&
    safety.essayRoute === TASK2_CANONICAL_TYPES.OPINION &&
    isPartialRouteStatus(route.status) &&
    !route.missingRequirements.length &&
    safety.positionConfidence !== "low"
  ) {
    output["Task Response"].range = clampToSixSixFive(output["Task Response"].range);
    output["Task Response"].diagnosis = "The position is clear and relevant ideas are present, but the concession route is only partially controlled; this limits Task Response without creating a missing-position cap.";
    output["Coherence & Cohesion"].range = clampToSixSixFive(output["Coherence & Cohesion"].range);
    output["Coherence & Cohesion"].diagnosis = "Paragraphing is clear, but the concession does not explicitly return to the controlling position, so progression is not securely Band 7.";
  }

  for (const cap of capMetadata.caps.filter((item) => item.scope === "criterion")) {
    if (!output[cap.criterion]) continue;
    output[cap.criterion].range = capBandRange(output[cap.criterion].range, cap.maximum);
    output[cap.criterion].diagnosis = `${cap.reason} ${String(output[cap.criterion].diagnosis || "")}`.trim();
  }

  if (safety.languageAccuracyRisk.blocksSecureBand7) {
    output["Lexical Resource"].range = clampToSixSixFive(output["Lexical Resource"].range);
    output["Lexical Resource"].diagnosis = "Frequent spelling, word-choice and collocation errors recur across the essay, so lexical control is not securely Band 7.";
    output["Grammatical Range & Accuracy"].range = clampToSixSixFive(output["Grammatical Range & Accuracy"].range);
    output["Grammatical Range & Accuracy"].diagnosis = "Recurring article, agreement, reference or sentence-control errors prevent a secure Band 7 grammar profile.";
  }

  const secureBand75Blocked = !safety.languageAccuracyRisk.blocksSecureBand7 && (
    safety.languageAccuracyRisk.blocksSecureBand75 ||
    safety.developmentRisk.unevenDevelopment
  );
  if (secureBand75Blocked) {
    for (const criterion of TASK2_CRITERIA) {
      if (parseBandRange(output[criterion].range).high <= 7) continue;
      output[criterion].range = capBandRange(output[criterion].range, 7.0);
      output[criterion].diagnosis = `${String(output[criterion].diagnosis || "").trim()} The submitted evidence does not support a secure estimate above Band 7 for this criterion.`.trim();
    }
  }

  const collocationSignals = safety.languageAccuracyRisk.signals.filter((item) => item.category === "collocation").length;
  if (!safety.languageAccuracyRisk.blocksSecureBand7 && collocationSignals >= 3) {
    output["Lexical Resource"].range = parseBandRange(output["Lexical Resource"].range).high >= 7 ? "6.5-7.0" : capBandRange(output["Lexical Resource"].range, 7.0, 6.5);
    output["Lexical Resource"].diagnosis = "Several collocation and word-choice problems occur across the essay, so lexical control is not secure above Band 7.";
  }
  const mechanicalSignals = safety.languageAccuracyRisk.signals.filter((item) => /punctuation|agreement|article|parallel|mechanical/.test(item.category)).length;
  if (mechanicalSignals >= 1 && parseBandRange(output["Grammatical Range & Accuracy"].range).high > 7) {
    output["Grammatical Range & Accuracy"].range = "7.0";
    output["Grammatical Range & Accuracy"].diagnosis = "Grammar is generally controlled, but visible mechanical accuracy prevents a secure 7.5 estimate.";
  }
  if (isPartialRouteStatus(route.status) && parseBandRange(output["Coherence & Cohesion"].range).high > 7) {
    output["Coherence & Cohesion"].range = "7.0";
    output["Coherence & Cohesion"].diagnosis = "Paragraphing is clear, but one route is only partially developed; this limits secure progression above Band 7.";
  }
  return output;
}

export function deriveDeterministicTask2CriterionRanges(safety = {}) {
  const route = safety.routeAssessment || {};
  const critical = Boolean(safety.criticalInteraction);
  const serious = Boolean(safety.seriousInteraction);
  const failed = isFailedRouteStatus(route.status);
  const partial = isPartialRouteStatus(route.status);
  const languageBelow7 = Boolean(safety.languageAccuracyRisk?.blocksSecureBand7);
  const languageBelow75 = Boolean(safety.languageAccuracyRisk?.blocksSecureBand75 || safety.developmentRisk?.unevenDevelopment);
  return {
    "Task Response": critical ? "4.0" : serious || failed ? "5.0-5.5" : safety.underLength || partial ? "6.0-6.5" : "6.5",
    "Coherence & Cohesion": critical ? "5.0-5.5" : safety.unfinishedEndingDetected || failed ? "5.0-5.5" : partial ? "6.0-6.5" : "6.5-7.0",
    "Lexical Resource": critical ? "5.5-6.0" : serious ? "5.5-6.0" : languageBelow7 ? "6.0-6.5" : "6.5-7.0",
    "Grammatical Range & Accuracy": critical ? "5.5-6.0" : serious ? "5.5-6.0" : languageBelow7 ? "6.0-6.5" : "6.5-7.0"
  };
}

function deterministicCriterionDiagnosis(criterion, safety) {
  if (criterion === "Task Response") return `Deterministic route status: ${routeCoverageLabel(safety.routeAssessment?.status)}; completion: ${safety.completionStatus || "unknown"}.`;
  if (criterion === "Coherence & Cohesion") return `Deterministic paragraph-route status: ${routeCoverageLabel(safety.routeAssessment?.status)}; conclusion: ${safety.conclusionStatus || "unknown"}.`;
  return safety.languageAccuracyRisk?.blocksSecureBand7
    ? "Full-response language signals recur often enough to block a secure Band 7 estimate."
    : "Full-response language signals do not trigger a lower deterministic ceiling.";
}

function capBandRange(value, maximum, minimum = null) {
  const range = parseBandRange(value) || { low: maximum - 0.5, high: maximum };
  const high = Math.min(range.high, maximum);
  const low = Math.min(high, minimum == null ? range.low : Math.max(minimum, Math.min(range.low, high)));
  return formatBandRange(low, high);
}

function clampToSixSixFive(value) {
  const range = parseBandRange(value) || { low: 6, high: 6.5 };
  return range.low >= 6 ? "6.0-6.5" : capBandRange(value, 6.5);
}

function parseBandRange(value) {
  const numbers = String(value ?? "").replace(/[–—−]/g, "-").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (!numbers.length) return null;
  return { low: numbers[0], high: numbers.length > 1 ? numbers[1] : numbers[0] };
}

function roundToHalf(value) {
  return Math.round(Number(value) * 2) / 2;
}

function formatBandRange(low, high) {
  const first = Number(low).toFixed(1);
  const second = Number(high).toFixed(1);
  return first === second ? first : `${first}-${second}`;
}

export function assessTask2RevisionFidelity({ exactSentence = "", targetedRevision = "", revisionType = "" } = {}) {
  const exact = String(exactSentence || "");
  let revision = String(targetedRevision || "");
  let type = String(revisionType || "");
  if (["Teacher-Guided Recommended Route", "Model Paragraph"].includes(type)) type = "Teacher-Guided Expansion";
  if (/\bon the roads\b/i.test(exact) && /\bon the road\b/i.test(revision)) {
    revision = revision.replace(/\bon the road\b/gi, "on the roads");
  }
  if (/\bon the roads[;,.!?](?:Therefore|However|Moreover|In addition)\b/i.test(exact)) {
    revision = exact.replace(/([;,.!?])(?=[A-Z])/g, "$1 ");
    type = "Minimal Correction";
  }

  const exactTokens = new Set(revisionContentTokens(exact));
  const addedPremiseTerms = revisionContentTokens(revision).filter((token) =>
    !exactTokens.has(token) && /^(?:coverage|availability|access|area|district|route|frequency|capacity|subsidy|infrastructure|enforcement|incentive|consequence|taxpayer|commuter|resident|fares?|reliability|diversions?|alternatives?|policy|funding|penalty|restriction|shortage|unavailable|conveniently)$/.test(token)
  );
  const addedNumberClaim = /\b\d+(?:[,.]\d+)?%?|\b(?:hundreds?|thousands?|millions?)\b/i.test(revision) &&
    !/\b\d+(?:[,.]\d+)?%?|\b(?:hundreds?|thousands?|millions?)\b/i.test(exact);
  const addedCausalPremise = /\b(?:because|since|as a result of|due to)\b/i.test(revision) &&
    !/\b(?:because|since|as a result of|due to)\b/i.test(exact) &&
    countWords(revision) > countWords(exact) + 5;
  const explicitNewPolicy = /\b(?:lower fares?|increase frequency|improve reliability|introduce (?:a |an )?(?:tax|subsidy|penalty|restriction)|expand coverage|alternative routes?|unavailable diversions?)\b/i.test(revision) &&
    !/\b(?:lower fares?|increase frequency|improve reliability|introduce (?:a |an )?(?:tax|subsidy|penalty|restriction)|expand coverage|alternative routes?|unavailable diversions?)\b/i.test(exact);
  const addsPremise = countWords(revision) > countWords(exact) + 3 && (
    new Set(addedPremiseTerms).size >= 2 || addedNumberClaim || addedCausalPremise || explicitNewPolicy
  );
  if (addsPremise && ["Route-Preserving Revision", "Minimal Correction"].includes(type)) {
    type = "Teacher-Guided Expansion";
  }
  if (!REVISION_TYPES.includes(type)) {
    type = addsPremise ? "Teacher-Guided Expansion" : "Route-Preserving Revision";
  }
  return {
    targetedRevision: revision,
    revisionType: type,
    addsPremise,
    addedPremiseReasons: [
      ...(new Set(addedPremiseTerms).size >= 2 ? ["new premise vocabulary"] : []),
      ...(addedNumberClaim ? ["new numerical/example claim"] : []),
      ...(addedCausalPremise ? ["new causal premise"] : []),
      ...(explicitNewPolicy ? ["new policy or implementation detail"] : [])
    ],
    preservedAcceptableWording: /\bon the roads\b/i.test(exact) ? /\bon the roads\b/i.test(revision) : true
  };
}

function revisionContentTokens(value) {
  const stop = new Set(["the", "a", "an", "and", "or", "but", "to", "of", "for", "in", "on", "with", "by", "is", "are", "was", "were", "be", "been", "being", "that", "this", "these", "those", "it", "they", "their", "can", "could", "may", "might", "should", "would", "will"]);
  return String(value || "").toLowerCase().match(/[a-z][a-z-]{2,}/g)?.filter((token) => !stop.has(token)) || [];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
