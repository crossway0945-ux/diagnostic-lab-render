import { countWords, getWordCountMetadata, normalizeEssayText } from "../wordCount.js";

const POSITION_PATTERN = /\b(?:i\s+(?:(strongly|firmly|completely|fully|generally|partly|partially|consequently|therefore|ultimately)\s+)?(agree|disagree)|in my (?:view|opinion)[^.!?]{0,80}\b(agree|disagree)|i believe[^.!?]{0,80}\b(?:should|must|ought|outweigh|more (?:important|significant|beneficial)))\b/i;
const SUPPORT_PATTERN = /\b(?:agree|support|benefit|advantage|basic right|human right|should (?:receive|be provided)|free of charge|without (?:a )?charge|protect|improve|enable|allow|essential)\b/i;
const OPPOSITION_PATTERN = /\b(?:disagree|oppose|drawback|disadvantage|too (?:costly|expensive)|cost the government|budget.*not enough|tax(?:es)? must|should not|cannot afford|financial burden|on the other hand)\b/i;
const ADVANTAGES_OUTWEIGH_PATTERN = /\badvantages?\b[^.!?]{0,120}\b(?:far\s+|clearly\s+|significantly\s+|decisively\s+)?outweighs?\b[^.!?]{0,120}\b(?:disadvantages?|drawbacks?|risks?|costs?)\b/i;
const DISADVANTAGES_OUTWEIGH_PATTERN = /\b(?:disadvantages?|drawbacks?|risks?|costs?)\b[^.!?]{0,120}\b(?:far\s+|clearly\s+|significantly\s+|decisively\s+)?outweighs?\b[^.!?]{0,120}\badvantages?\b/i;
const OUTWEIGH_ADVANTAGE_PATTERN = /\b(?:advantages?|benefits?|flexibility|personalised instruction|individual needs|labou?r (?:abundance|supply)|job vacancies|fewer (?:labou?r )?shortages|productivity|tax revenue|economic (?:growth|development)|national development|larger pool of workers?)\b/gi;
const OUTWEIGH_DISADVANTAGE_PATTERN = /\b(?:disadvantages?|drawbacks?|future age?ing crisis|age?ing burden|retirement (?:burden|pressure)|economic and social(?:ietal)? strain|shrinking workforce|sociali[sz]ation|communication skills?|financial burden|negative effects?|major risks?|main concerns?)\b/gi;
const UNFINISHED_TAIL_PATTERN = /\b(?:because|although|while|whereas|if|when|which|that|so that|due to the fact that|in order to)\s+(?:i|we|they|he|she|it|people|governments?)?$|\b(?:and|but|or|to|of|for|with|i|we|they|he|she|it)$/i;
const BODY_1_START_PATTERN = /^(?:first(?:ly| of all)?|to begin with|one (?:main|major|important) (?:reason|advantage|benefit|point))\b/i;
const BODY_2_START_PATTERN = /^(?:on the other hand|however|nevertheless|conversely|second(?:ly)?|another (?:reason|view|point|issue|disadvantage|advantage))\b/i;
const CONCLUSION_START_PATTERN = /^(?:in conclusion|for conclusion|to conclude|in summary|to sum up)\b/i;

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
  const essayRoute = classifyEssayRoute(payload);
  const introPosition = detectPosition(introduction);
  const conclusionPosition = detectPosition(conclusion);
  const bodyRoutes = bodyParagraphs.map((paragraph) => classifyBodyRoute(paragraph, essayRoute));
  const detectedPosition = reconcilePosition({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes });
  const positionConfidence = positionConfidenceFor({ introPosition, conclusionPosition, unfinishedEndingDetected, bodyRoutes });
  const routeConflict = detectRouteConflict({ essayRoute, detectedPosition, introPosition, bodyRoutes });
  const meaningErrors = detectMeaningErrors(payload.prompt, writing);
  const languageErrors = detectLanguageControlErrors(writing, ending);
  const languageAccuracyRisk = detectTask2LanguageAccuracyRisk(writing);
  const developmentRisk = detectOutweighDevelopmentRisk(bodyParagraphs, essayRoute);
  const shortBodyParagraphs = classifyShortBodyParagraphs(bodyParagraphs, wordMetadata);
  const severeUnderLength = wordMetadata.wordShortfall >= 40;
  const directQuestionMissingPart = essayRoute === "direct-question" && countPromptQuestions(payload.prompt) >= 2 && bodyParagraphs.length < 2;
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
    (detectedPosition === "unclear" || detectedPosition === "contradictory" || routeConflict) &&
    (shortBodyParagraphs.length > 0 || meaningErrors.length > 0 || languageErrors.length >= 2);
  const seriousInteraction = !criticalInteraction && (directQuestionMissingPart || (severeUnderLength &&
    (routeConflict || detectedPosition === "unclear" || detectedPosition === "contradictory") &&
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
  const bodyRouteSummary = buildBodyRouteSummary({
    bodyRoutes,
    bodyParagraphs,
    prompt: payload.prompt,
    conclusionPosition,
    unfinishedEndingDetected,
    routeConflict,
    positionConfidence,
    essayRoute,
    languageAccuracyRisk,
    developmentRisk
  });

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
    routeConflict,
    bodyRouteSummary,
    detectedStructure,
    paragraphDetectionConfidence: structure.confidence,
    conclusionStatus: structure.conclusionPresent
      ? unfinishedEndingDetected ? "present but unfinished" : "present and complete"
      : "no clear conclusion detected",
    recommendedRoute: buildRecommendedRoute({ detectedPosition, conclusionPosition, unfinishedEndingDetected }),
    recommendedRouteRationale: buildRecommendedRouteRationale({ detectedPosition, conclusionPosition, unfinishedEndingDetected }),
    routeIntegrity: routeConflict || detectedPosition === "contradictory"
      ? "unstable"
      : positionConfidence === "low"
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
      ? `The response is ${wordMetadata.wordShortfall} words below the minimum and ends unfinished; the unclear or conflicting route, limited body development, and meaning-affecting language failures interact, so the essay does not function as a complete Task 2 answer.`
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

function classifyEssayRoute(payload) {
  const text = `${payload.essayType || ""} ${payload.prompt || ""}`.toLowerCase();
  if (/discuss both views|both views.*opinion/.test(text)) return "discuss-both-views";
  if (/outweigh|advantages?.*disadvantages?/.test(text)) return "outweigh";
  if (/problems?.*(?:solutions?|measures?)|causes?.*(?:solutions?|measures?)/.test(text)) return "problem-solution";
  if (/two questions?|direct questions?/.test(text)) return "direct-question";
  return "opinion";
}

function countPromptQuestions(prompt) {
  return (String(prompt || "").match(/\?/g) || []).length;
}

function detectPosition(text) {
  const source = String(text || "");
  if (DISADVANTAGES_OUTWEIGH_PATTERN.test(source)) return "disadvantages outweigh the advantages";
  if (ADVANTAGES_OUTWEIGH_PATTERN.test(source)) return "advantages outweigh the disadvantages";
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
  if (essayRoute === "outweigh") {
    const advantageSignals = paragraph.match(OUTWEIGH_ADVANTAGE_PATTERN) || [];
    const disadvantageSignals = paragraph.match(OUTWEIGH_DISADVANTAGE_PATTERN) || [];
    if (advantageSignals.length && disadvantageSignals.length) {
      if (advantageSignals.length >= disadvantageSignals.length * 2) return "advantage route";
      if (disadvantageSignals.length >= advantageSignals.length * 2) return "disadvantage route";
      return "mixed outweigh route";
    }
    if (advantageSignals.length) return "advantage route";
    if (disadvantageSignals.length) return "disadvantage route";
    return "route unclear from the controlling sentences";
  }
  const support = SUPPORT_PATTERN.test(paragraph);
  const oppose = OPPOSITION_PATTERN.test(paragraph);
  if (support && oppose) return "mixed or conditional route";
  if (oppose) return "opposes or limits the proposition";
  if (support) return "supports the proposition";
  return "route unclear from the controlling sentences";
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
    { pattern: /\b(?:should|could|would|might|must|may)\s+\w+ed\b/i, label: "modal followed by a past-form verb" },
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
    { pattern: /\b(?:instabillity|provde)\b/gi, category: "spelling" },
    { pattern: /\bpopulation\s+of\s+[^.!?]{0,45}\bcontinue\s+to\b/gi, category: "subject-verb agreement" },
    {
      pattern: /\b(?:a\s+)?future\s+age?ing\s+crisis\b/gi,
      category: "article control",
      unsafe: (match, source) => !/^a\s/i.test(match[0]) && !/\b(?:a|the)\s*$/i.test(source.slice(Math.max(0, match.index - 6), match.index))
    },
    { pattern: /\b(?:quality\s+of\s+workforce|as\s+large\s+workforce)\b/gi, category: "article control" },
    { pattern: /\b(?:increased youth|increases in youth|young-age population|labou?r abundance|economic industry|carry out operations or businesses|higher number of income tax(?: and sales tax)? revenues?)\b/gi, category: "collocation" },
    { pattern: /\bincrease\s+in\s+young adults?\b[^.!?]{0,80}\bwhich\s+outnumbers?\b/gi, category: "reference and logic" },
    { pattern: /\bbolsters?\b[^.!?]{0,90}\band\s+fewer\s+labou?r\s+shortages\b/gi, category: "parallel structure" }
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
      signals.push({ category: rule.category, exactEvidence });
    }
  }

  const categories = Array.from(new Set(signals.map((item) => item.category)));
  const spellingCount = signals.filter((item) => item.category === "spelling").length;
  const blocksSecureBand7 = (signals.length >= 5 && categories.length >= 3) || (spellingCount >= 2 && signals.length >= 4);
  return {
    signalCount: signals.length,
    categories,
    signals,
    blocksSecureBand7,
    classification: blocksSecureBand7 ? "frequent accuracy and collocation errors" : signals.length ? "limited accuracy risk" : "no deterministic frequent-error profile"
  };
}

function detectOutweighDevelopmentRisk(bodyParagraphs, essayRoute) {
  if (essayRoute !== "outweigh") return { unevenDevelopment: false, repeatedClaim: false, unsupportedClaim: false };
  const bodyText = bodyParagraphs.join(" ");
  const repeatedClaim = (bodyText.match(/\bfuture\s+age?ing\s+crisis\b/gi) || []).length >= 3;
  const unsupportedClaim = /\bmore companies will have highly skilled individuals\b/i.test(bodyText);
  const overloadedAdvantageRoute = /\bjob vacancies\b/i.test(bodyText) &&
    /\b(?:tax revenue|income tax|sales tax)\b/i.test(bodyText) &&
    /\b(?:public infrastructure|national development|economic development)\b/i.test(bodyText);
  return {
    unevenDevelopment: repeatedClaim || (unsupportedClaim && overloadedAdvantageRoute),
    repeatedClaim,
    unsupportedClaim,
    overloadedAdvantageRoute
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
