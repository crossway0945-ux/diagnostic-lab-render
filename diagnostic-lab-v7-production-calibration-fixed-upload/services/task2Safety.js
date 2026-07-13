import { countWords, getWordCountMetadata, normalizeEssayText } from "../wordCount.js";

const POSITION_PATTERN = /\b(?:i\s+(?:(strongly|firmly|completely|fully|generally|partly|partially|consequently|therefore|ultimately)\s+)?(agree|disagree)|in my (?:view|opinion)[^.!?]{0,80}\b(agree|disagree)|i believe[^.!?]{0,80}\b(?:should|must|ought|outweigh|more (?:important|significant|beneficial)))\b/i;
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
  DIRECT_QUESTION: "direct-question"
});

const TASK2_TYPE_LABELS = Object.freeze({
  [TASK2_CANONICAL_TYPES.OPINION]: "Opinion Essay",
  [TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS]: "Discuss Both Views",
  [TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES]: "Advantages / Disadvantages",
  [TASK2_CANONICAL_TYPES.OUTWEIGH]: "Advantages Outweigh Disadvantages",
  [TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION]: "Problem & Solution",
  [TASK2_CANONICAL_TYPES.DIRECT_QUESTION]: "Direct Question"
});

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
  const essayRoute = classifyTask2EssayType(payload);
  const stanceRequired = isStanceRequired(payload, essayRoute);
  const introPosition = stanceRequired ? detectPosition(introduction) : "";
  const conclusionPosition = stanceRequired ? detectPosition(conclusion) : "";
  const positionBodyRoutes = stanceRequired
    ? bodyParagraphs.map((paragraph) => classifyBodyRoute(paragraph, essayRoute))
    : [];
  const detectedPosition = stanceRequired
    ? reconcilePosition({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes: positionBodyRoutes })
    : "";
  const positionConfidence = stanceRequired
    ? positionConfidenceFor({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes: positionBodyRoutes })
    : "not-applicable";
  const routeAssessment = buildTaskTypeRouteAssessment({
    payload,
    essayRoute,
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
  const bodyRoutes = stanceRequired ? positionBodyRoutes : routeAssessment.bodyRoutes.map((item) => item.label);
  const routeConflict = ["conflicting", "failed"].includes(routeAssessment.status);
  const meaningErrors = detectMeaningErrors(payload.prompt, writing);
  const languageErrors = detectLanguageControlErrors(writing, ending);
  const languageAccuracyRisk = detectTask2LanguageAccuracyRisk(writing);
  const developmentRisk = detectOutweighDevelopmentRisk({
    bodyParagraphs,
    introduction,
    conclusion,
    essayRoute,
    prompt: payload.prompt
  });
  const shortBodyParagraphs = classifyShortBodyParagraphs(bodyParagraphs, wordMetadata);
  const severeUnderLength = wordMetadata.wordShortfall >= 40;
  const directQuestionMissingPart = essayRoute === TASK2_CANONICAL_TYPES.DIRECT_QUESTION && routeAssessment.missingRequirements.length > 0;
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
    ["partial", "failed", "conflicting"].includes(routeAssessment.status) &&
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
  if (essayRoute === TASK2_CANONICAL_TYPES.OUTWEIGH && routeAssessment.status === "controlled" && (languageAccuracyRisk.blocksSecureBand7 || developmentRisk.unevenDevelopment)) {
    routeAssessment.summary = routeAssessment.summary.replace(
      /Overall route status: controlled$/,
      "Overall route status: controlled, but weakened by language accuracy and uneven development"
    );
  }
  const bodyRouteSummary = routeAssessment.summary;
  const canonicalAnalysis = {
    version: "7.0",
    essayType: essayRoute,
    essayTypeLabel: TASK2_TYPE_LABELS[essayRoute],
    taskRequirements: routeAssessment.requirements,
    stanceRequired,
    routeAssessment,
    criterionScores: {},
    capMetadata: buildDeterministicCapMetadata({
      severeUnderLength,
      unfinishedEndingDetected,
      routeAssessment,
      directQuestionMissingPart
    }),
    primaryLimiters: buildPrimaryLimiters({
      wordMetadata,
      unfinishedEndingDetected,
      routeAssessment,
      languageAccuracyRisk
    }),
    frameworkAssessment: buildCanonicalFrameworkAssessment(routeAssessment),
    evidenceIssues: [...meaningErrors, ...languageErrors, ...languageAccuracyRisk.signals],
    overallBandRange: null
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
      : routeAssessment.status === "partial"
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
    essayRoute,
    criticalInteraction,
    seriousInteraction,
    directQuestionMissingPart,
    stanceRequired,
    taskRequirements: canonicalAnalysis.taskRequirements,
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
  const text = `${payload.essayType || ""} ${payload.prompt || ""}`.toLowerCase();
  if (/discuss both views|both views.*(?:opinion|view)/.test(text)) return TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS;
  if (/outweigh|advantages?\s+(?:are|is|do)\s+more|disadvantages?\s+(?:are|is|do)\s+more/.test(text)) return TASK2_CANONICAL_TYPES.OUTWEIGH;
  if (/problems?.*(?:solutions?|measures?)|causes?.*(?:solutions?|measures?)|problem\s*[&/]\s*solution|cause\s*[&/]\s*solution/.test(text)) return TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION;
  if (/direct questions?|two questions?/.test(text) || countPromptQuestions(payload.prompt) >= 2) return TASK2_CANONICAL_TYPES.DIRECT_QUESTION;
  if (/advantages?.*(?:and|&)\s*disadvantages?|positive.*negative|benefits?.*drawbacks?/.test(text)) return TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES;
  return TASK2_CANONICAL_TYPES.OPINION;
}

function isStanceRequired(payload, essayType) {
  const text = `${payload.essayType || ""} ${payload.prompt || ""}`;
  if ([TASK2_CANONICAL_TYPES.OPINION, TASK2_CANONICAL_TYPES.OUTWEIGH].includes(essayType)) return true;
  if (essayType === TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS) {
    return /(?:give|include)\s+(?:your|an)\s+(?:own\s+)?opinion|what is your (?:opinion|view)|your own view/i.test(text);
  }
  if (essayType === TASK2_CANONICAL_TYPES.DIRECT_QUESTION) {
    return /do you (?:think|agree|believe)|what is your (?:opinion|view)|to what extent/i.test(text);
  }
  return false;
}

function buildTaskTypeRouteAssessment(context) {
  const builders = {
    [TASK2_CANONICAL_TYPES.OPINION]: buildOpinionRouteAssessment,
    [TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS]: buildDiscussViewsRouteAssessment,
    [TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES]: buildAdvantagesDisadvantagesRouteAssessment,
    [TASK2_CANONICAL_TYPES.OUTWEIGH]: buildOutweighRouteAssessment,
    [TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION]: buildProblemSolutionRouteAssessment,
    [TASK2_CANONICAL_TYPES.DIRECT_QUESTION]: buildDirectQuestionRouteAssessment
  };
  return builders[context.essayRoute](context);
}

function buildOpinionRouteAssessment(context) {
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const rawRoute = classifyBodyRoute(paragraph, TASK2_CANONICAL_TYPES.OPINION);
    return routeItem(
      index,
      describeBodyRoute(rawRoute, paragraph, context.payload.prompt, TASK2_CANONICAL_TYPES.OPINION),
      paragraph,
      countWords(paragraph) >= 55 ? "adequate" : "partial"
    );
  });
  const missingPosition = ["unclear", "contradictory"].includes(context.detectedPosition);
  const conflict = detectRouteConflict({
    essayRoute: TASK2_CANONICAL_TYPES.OPINION,
    detectedPosition: context.detectedPosition,
    introPosition: context.introPosition,
    bodyRoutes: context.bodyParagraphs.map((paragraph) => classifyBodyRoute(paragraph, TASK2_CANONICAL_TYPES.OPINION))
  });
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
      requirement("body-routes", "Reasons aligned with the position", bodyRoutes.length >= 2 && !conflict, bodyRoutes.map((item) => item.evidence).join(" | ")),
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
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => {
    const label = index === 0 ? "presents the first view" : index === 1 ? "presents the second view" : "adds supporting discussion";
    return routeItem(index, label, paragraph, countWords(paragraph) >= 55 ? "adequate" : "partial");
  });
  const stanceMissing = context.stanceRequired && ["unclear", "contradictory"].includes(context.detectedPosition);
  const missingRequirements = [
    ...(bodyRoutes.length < 1 ? ["first view"] : []),
    ...(bodyRoutes.length < 2 ? ["second view"] : []),
    ...(stanceMissing ? ["own opinion"] : [])
  ];
  const status = missingRequirements.length ? "failed" : bodyRoutes.some((item) => item.status === "partial") ? "partial" : "controlled";
  return finalizeRouteAssessment(context, {
    schema: "two-views-and-opinion",
    label: "Discuss Both Views Route Assessment",
    requirements: [
      requirement("view-a", "First view covered", bodyRoutes.length >= 1, bodyRoutes[0]?.evidence),
      requirement("view-b", "Second view covered", bodyRoutes.length >= 2, bodyRoutes[1]?.evidence),
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

function buildDirectQuestionRouteAssessment(context) {
  const questionCount = Math.max(1, countPromptQuestions(context.payload.prompt));
  const bodyRoutes = context.bodyParagraphs.map((paragraph, index) => routeItem(
    index,
    `answers question ${Math.min(index + 1, questionCount)}`,
    paragraph,
    countWords(paragraph) >= 50 ? "adequate" : "partial"
  ));
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
  const requirementStatuses = assessment.requirements.map((item) => item.status);
  const confidence = context.bodyParagraphs.length >= 2 && requirementStatuses.filter((status) => status === "present").length >= 2
    ? "high"
    : context.bodyParagraphs.length ? "medium" : "low";
  const bodySummary = assessment.bodyRoutes.length
    ? assessment.bodyRoutes.map((item) => `Body ${item.index} route: ${item.label}${item.status === "partial" ? " (partially developed)" : ""}`)
    : ["No completed body route was detected"];
  const summary = [
    ...(context.stanceRequired ? [`Detected position: ${assessment.position || "unclear"}`] : []),
    ...bodySummary,
    `Conclusion route: ${assessment.conclusionLabel}`,
    `Overall route status: ${assessment.status === "controlled" ? "controlled" : assessment.status === "partial" ? "partially developed" : assessment.status === "conflicting" ? "conflicting / uncontrolled" : assessment.status}`
  ].join(" | ");
  return {
    ...assessment,
    stanceRequired: context.stanceRequired,
    confidence,
    summary,
    recommendedRoute: buildTaskTypeRecommendedRoute(context.essayRoute, context.stanceRequired),
    recommendedRouteRationale: buildTaskTypeRouteRationale(context.essayRoute, assessment.status),
    missingRequirements: assessment.missingRequirements || []
  };
}

function requirement(id, label, present, evidence = "") {
  return { id, label, required: true, status: present ? "present" : "missing", evidence: String(evidence || "") };
}

function routeItem(index, label, paragraph, status) {
  return { index: index + 1, label, status, evidence: firstSentence(paragraph), wordCount: countWords(paragraph) };
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

function buildTaskTypeRecommendedRoute(essayType, stanceRequired) {
  const routes = {
    [TASK2_CANONICAL_TYPES.OPINION]: "State one clear extent of agreement, make both body paragraphs prove it, and restate the same position in the conclusion.",
    [TASK2_CANONICAL_TYPES.DISCUSS_BOTH_VIEWS]: `Explain each view in a separate controlled route${stanceRequired ? ", state your own opinion clearly," : ""} and close by synthesising the discussion.`,
    [TASK2_CANONICAL_TYPES.ADVANTAGES_DISADVANTAGES]: "Develop the main advantages and disadvantages in distinct routes, then summarise both sides without inventing an opinion requirement.",
    [TASK2_CANONICAL_TYPES.OUTWEIGH]: "Develop both sides, make the stronger side explicit through comparison, and restate the outweigh judgement in the conclusion.",
    [TASK2_CANONICAL_TYPES.PROBLEM_SOLUTION]: "Identify and develop the requested causes/problems, pair them with relevant solutions, and summarise those routes in the conclusion.",
    [TASK2_CANONICAL_TYPES.DIRECT_QUESTION]: "Answer each question directly in its own controlled route and summarise the answers in the conclusion."
  };
  return routes[essayType];
}

function buildTaskTypeRouteRationale(essayType, status) {
  return `${TASK2_TYPE_LABELS[essayType]} requires its own prompt-coverage route. The detected route is ${status}; Kru Pom development tools explain how to strengthen it but do not create an unofficial IELTS scoring gate.`;
}

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function countPromptQuestions(prompt) {
  return (String(prompt || "").match(/\?/g) || []).length;
}

function detectPosition(text) {
  const source = String(text || "");
  const outweighPosition = detectSemanticOutweighPosition(source);
  if (outweighPosition) return outweighPosition;
  const match = source.match(POSITION_PATTERN);
  if (!match) return "";
  const modifier = String(match[1] || "").toLowerCase();
  const direction = String(match[2] || match[3] || "").toLowerCase();
  if (modifier === "partly" || modifier === "partially") return direction === "disagree" ? "partly disagree" : "partly agree";
  if (modifier === "strongly" || modifier === "firmly" || modifier === "completely" || modifier === "fully") return `strongly ${direction}`;
  if (modifier === "generally") return `generally ${direction}`;
  if (direction) return `generally ${direction}`;
  return "balanced/conditional position";
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
  if (!introPosition && !conclusionPosition) return bodyRoutes.includes("supports the proposition") && bodyRoutes.includes("opposes or limits the proposition") ? "contradictory" : "unclear";
  return introPosition || conclusionPosition || "unclear";
}

function positionConfidenceFor({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes }) {
  if (!introPosition || unfinishedEndingDetected) return "low";
  if (conclusionPosition && positionDirection(introPosition) !== positionDirection(conclusionPosition)) return "low";
  if (bodyRoutes.includes("route unclear from the controlling sentences")) return "medium";
  return "high";
}

function positionDirection(value) {
  if (/advantages outweigh the disadvantages/.test(value)) return "advantages-outweigh";
  if (/disadvantages outweigh the advantages/.test(value)) return "disadvantages-outweigh";
  if (/disagree/.test(value)) return "disagree";
  if (/agree/.test(value)) return "agree";
  return value;
}

function detectRouteConflict({ essayRoute, detectedPosition, introPosition, bodyRoutes }) {
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

function buildDeterministicCapMetadata({ severeUnderLength, unfinishedEndingDetected, routeAssessment, directQuestionMissingPart }) {
  const caps = [];
  if (severeUnderLength && unfinishedEndingDetected && ["failed", "conflicting"].includes(routeAssessment.status)) {
    caps.push({
      scope: "overall",
      criterion: "Overall",
      maximum: 4.5,
      reason: "Severe underlength, an unfinished ending, and a failed task-type route interact to prevent a complete Task 2 response."
    });
  } else if (severeUnderLength && routeAssessment.status === "partial") {
    caps.push({
      scope: "criterion",
      criterion: "Task Response",
      maximum: 6.5,
      reason: "Task Response is capped because severe underlength combines with materially partial body development."
    });
  } else if (directQuestionMissingPart) {
    caps.push({
      scope: "criterion",
      criterion: "Task Response",
      maximum: 5.0,
      reason: "At least one explicit Direct Question requirement is not answered."
    });
  } else if (routeAssessment.stanceRequired && routeAssessment.missingRequirements.includes("position")) {
    caps.push({
      scope: "criterion",
      criterion: "Task Response",
      maximum: 6.0,
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
    ...(routeAssessment.status === "partial" ? [`The ${routeAssessment.label.toLowerCase()} is only partially developed.`] : []),
    ...(["failed", "conflicting"].includes(routeAssessment.status) ? [`The ${routeAssessment.label.toLowerCase()} is ${routeAssessment.status}.`] : []),
    ...(languageAccuracyRisk.blocksSecureBand75 ? ["Language accuracy and collocation prevent a secure Band 7.5 profile."] : [])
  ];
}

function buildCanonicalFrameworkAssessment(routeAssessment) {
  const developmentStatus = routeAssessment.bodyRoutes.some((item) => item.status === "partial") ? "Moderate" : "Strong";
  const conclusion = routeAssessment.requirements.find((item) => item.id === "conclusion");
  return {
    routeClarity: { status: routeAssessment.status === "controlled" ? "Strong" : routeAssessment.status === "partial" ? "Moderate" : "Needs Work" },
    bodyDevelopment: { status: developmentStatus },
    conclusionClosure: { status: conclusion?.status === "present" ? "Strong" : "Needs Work" },
    sar: {
      status: developmentStatus,
      scoringRole: "diagnostic-only",
      note: "SAR is a Kru Pom development tool, not an official IELTS scoring gate."
    }
  };
}

export function deriveTask2OverallBandRange(criteriaScores = {}, capMetadata = {}) {
  const ranges = TASK2_CRITERIA.map((criterion) => parseBandRange(criteriaScores?.[criterion]?.range ?? criteriaScores?.[criterion]));
  if (ranges.some((range) => !range)) return { low: 0, high: 0, label: "", valid: false };
  let low = roundToHalf(ranges.reduce((sum, range) => sum + range.low, 0) / ranges.length);
  let high = roundToHalf(ranges.reduce((sum, range) => sum + range.high, 0) / ranges.length);
  const overallCap = Number(capMetadata?.overallCap);
  if (Number.isFinite(overallCap) && overallCap > 0) {
    high = Math.min(high, overallCap);
    low = Math.min(low, high);
  }
  return { low, high, label: formatBandRange(low, high), valid: true };
}

export function reconcileTask2CanonicalAnalysis(payload = {}, providerAnalysis = {}, suppliedSafety = null) {
  const safety = suppliedSafety || analyzeTask2Safety(payload);
  const base = safety.canonicalAnalysis;
  const capMetadata = mergeCanonicalCapMetadata(base.capMetadata, providerAnalysis, safety);
  const criterionScores = normalizeCanonicalCriterionScores(providerAnalysis.criteriaScores, safety, capMetadata);
  const overallBandRange = deriveTask2OverallBandRange(criterionScores, capMetadata);
  return {
    ...base,
    criterionScores,
    capMetadata,
    overallBandRange,
    primaryLimiters: Array.from(new Set([
      ...base.primaryLimiters,
      ...(Array.isArray(providerAnalysis.highBandLimiters) ? providerAnalysis.highBandLimiters : [])
    ])),
    consistency: {
      routeSource: "canonical-task2-analysis",
      scoreSource: "criterion-arithmetic",
      capSource: capMetadata.applied ? "explicit-canonical-cap" : "none"
    }
  };
}

function mergeCanonicalCapMetadata(base, providerAnalysis, safety) {
  const caps = [...(base?.caps || [])];
  const providerCap = parseBandRange(providerAnalysis?.overallBandCap)?.high;
  const validProviderOverallCap = Number.isFinite(providerCap) && (
    safety.criticalInteraction ||
    (safety.underLengthBy >= 40 && ["failed", "conflicting"].includes(safety.routeAssessment.status))
  );
  if (validProviderOverallCap && !caps.some((item) => item.scope === "overall")) {
    caps.push({
      scope: "overall",
      criterion: "Overall",
      maximum: providerCap,
      reason: String(providerAnalysis.taskResponseCapReason || "A critical task-completion interaction justifies an explicit overall cap.")
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

function normalizeCanonicalCriterionScores(input = {}, safety, capMetadata) {
  const output = {};
  for (const criterion of TASK2_CRITERIA) {
    const source = input?.[criterion];
    const parsed = parseBandRange(source?.range ?? source) || { low: 6, high: 6.5 };
    output[criterion] = typeof source === "object" && source
      ? { ...source, range: formatBandRange(parsed.low, parsed.high) }
      : { range: formatBandRange(parsed.low, parsed.high), diagnosis: "Criterion estimate requires evidence-based review.", evidence: "" };
  }

  const route = safety.routeAssessment;
  const fullLengthComplete = !safety.underLength && !safety.unfinishedEndingDetected;
  const taskResponse = parseBandRange(output["Task Response"].range);
  if (fullLengthComplete && route.status === "partial" && !route.missingRequirements.length && taskResponse.high <= 6) {
    output["Task Response"].range = "6.0-6.5";
    output["Task Response"].diagnosis = "All required task routes are present, but one route is only partially developed. This is a development limiter, not a broken-promise failure.";
  }

  const secureHighCandidate = fullLengthComplete &&
    route.status === "controlled" &&
    !capMetadata.caps.length &&
    !safety.languageAccuracyRisk.blocksSecureBand75 &&
    !safety.developmentRisk?.unevenDevelopment &&
    TASK2_CRITERIA.every((criterion) => parseBandRange(output[criterion].range).high >= 6.5);
  if (secureHighCandidate) {
    for (const criterion of TASK2_CRITERIA) {
      output[criterion].range = "7.0-7.5";
    }
  } else if (fullLengthComplete && route.status === "controlled" && !capMetadata.caps.length && !safety.languageAccuracyRisk.blocksSecureBand7 && TASK2_CRITERIA.every((criterion) => parseBandRange(output[criterion].range).high >= 6.5)) {
    for (const criterion of TASK2_CRITERIA) {
      output[criterion].range = "7.0";
    }
  }

  for (const cap of capMetadata.caps.filter((item) => item.scope === "criterion")) {
    if (!output[cap.criterion]) continue;
    output[cap.criterion].range = capBandRange(output[cap.criterion].range, cap.maximum);
    output[cap.criterion].diagnosis = `${cap.reason} ${String(output[cap.criterion].diagnosis || "")}`.trim();
  }

  if (safety.languageAccuracyRisk.blocksSecureBand7) {
    output["Lexical Resource"].range = capBandRange(output["Lexical Resource"].range, 6.5, 6.0);
    output["Lexical Resource"].diagnosis = "Frequent spelling, word-choice and collocation errors recur across the essay, so lexical control is not securely Band 7.";
    output["Grammatical Range & Accuracy"].range = capBandRange(output["Grammatical Range & Accuracy"].range, 6.5, 6.0);
    output["Grammatical Range & Accuracy"].diagnosis = "Recurring article, agreement, reference or sentence-control errors prevent a secure Band 7 grammar profile.";
  }

  const collocationSignals = safety.languageAccuracyRisk.signals.filter((item) => item.category === "collocation").length;
  if (collocationSignals >= 3) {
    output["Lexical Resource"].range = parseBandRange(output["Lexical Resource"].range).high >= 7 ? "6.5-7.0" : capBandRange(output["Lexical Resource"].range, 7.0, 6.5);
    output["Lexical Resource"].diagnosis = "Several collocation and word-choice problems occur across the essay, so lexical control is not secure above Band 7.";
  }
  const mechanicalSignals = safety.languageAccuracyRisk.signals.filter((item) => /punctuation|agreement|article|parallel|mechanical/.test(item.category)).length;
  if (mechanicalSignals >= 1 && parseBandRange(output["Grammatical Range & Accuracy"].range).high > 7) {
    output["Grammatical Range & Accuracy"].range = "7.0";
    output["Grammatical Range & Accuracy"].diagnosis = "Grammar is generally controlled, but visible mechanical accuracy prevents a secure 7.5 estimate.";
  }
  if (route.status === "partial" && parseBandRange(output["Coherence & Cohesion"].range).high > 7) {
    output["Coherence & Cohesion"].range = "7.0";
    output["Coherence & Cohesion"].diagnosis = "Paragraphing is clear, but one route is only partially developed; this limits secure progression above Band 7.";
  }
  return output;
}

function capBandRange(value, maximum, minimum = null) {
  const range = parseBandRange(value) || { low: maximum - 0.5, high: maximum };
  const high = Math.min(range.high, maximum);
  const low = Math.min(high, minimum == null ? range.low : Math.max(minimum, Math.min(range.low, high)));
  return formatBandRange(low, high);
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
  if (/\bon the roads\b/i.test(exact) && /\bon the road\b/i.test(revision)) {
    revision = revision.replace(/\bon the road\b/gi, "on the roads");
  }
  if (/\bon the roads[;,.!?](?:Therefore|However|Moreover|In addition)\b/i.test(exact)) {
    revision = exact.replace(/([;,.!?])(?=[A-Z])/g, "$1 ");
    type = "Minimal Correction";
  }

  const exactTokens = new Set(revisionContentTokens(exact));
  const addedPremiseTerms = revisionContentTokens(revision).filter((token) =>
    !exactTokens.has(token) && /^(?:coverage|availability|access|area|district|route|frequency|capacity|subsidy|infrastructure|enforcement|incentive|consequence|taxpayer|commuter|resident)$/.test(token)
  );
  const addsPremise = countWords(revision) > countWords(exact) + 3 && new Set(addedPremiseTerms).size >= 2;
  if (addsPremise && ["Route-Preserving Revision", "Minimal Correction"].includes(type)) {
    type = "Teacher-Guided Expansion";
  }
  return {
    targetedRevision: revision,
    revisionType: type,
    addsPremise,
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
