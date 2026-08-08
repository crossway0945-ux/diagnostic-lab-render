export const FRAMEWORK_EVIDENCE_VERSION = "framework-evidence-contract-v12.9.8";

export const FRAMEWORK_CANONICAL_KEYS = Object.freeze({
  "Position Clarity": "positionClarity",
  "Thesis Route Clarity": "thesisRouteClarity",
  "Body Paragraph Route Alignment": "bodyRouteAlignment",
  "Explanation Depth": "explanationDepth",
  "SAR Example Quality": "sarExampleQuality",
  "Link Back Control": "linkBackControl",
  "Conclusion Closure": "conclusionClosure",
  "LFC CPC Control": "lfcCpcControl",
  "LFC-CPC Control": "lfcCpcControl"
});

const POSITIVE_RATING = /\b(?:strong|aligned|controlled|functionally strong|structurally strong|pass)\b/i;
const DEVELOPMENT_GAP = /Causal Mechanism|Solution Mechanism|Explanation Depth|Example Development|SAR Example Quality|Sentence Completion/i;
const LANGUAGE_GAP = /Lexical|Word|Collocation|Meaning|Grammar|Sentence|Agreement|Article|Countability|Reference|Pronoun|Tense|Preposition|Punctuation|Modal/i;

const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => text(value).toLowerCase();

function stableId(...parts) {
  const input = parts.map(text).join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `framework-evidence-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function evidence(dimension, paragraphLabel, sentence, evidenceType, confidence = "high", source = "") {
  const exactEvidence = text(sentence);
  if (!exactEvidence) return null;
  return {
    evidenceId: stableId(dimension, paragraphLabel, exactEvidence, evidenceType),
    paragraphLabel: text(paragraphLabel),
    exactEvidence,
    evidenceType: text(evidenceType),
    confidence: text(confidence || "medium"),
    source: text(source)
  };
}

function issueCategory(issue = {}) {
  return text(issue.primaryCategory || issue.issueCategory || issue.issueType);
}

function paragraphLabelForIssue(issue = {}) {
  return text(issue.paragraphLabel || issue.paragraphLocation).replace(/,\s*Sentence\s+\d+.*$/i, "");
}

function issuesForParagraph(issues, label) {
  const wanted = lower(label);
  return issues.filter((issue) => {
    const actual = lower(paragraphLabelForIssue(issue));
    return actual && wanted && (actual.startsWith(wanted) || wanted.startsWith(actual));
  });
}

function contractRecord({
  frameworkDimension,
  rating,
  scope = "essay",
  positiveEvidence = [],
  limitingEvidence = [],
  paragraphCoverage = [],
  confidence = "medium",
  rationale = "",
  sourceIssueIds = [],
  aggregationMethod = "canonical-evidence"
}) {
  const positives = positiveEvidence.filter(Boolean);
  const limits = limitingEvidence.filter(Boolean);
  const positive = isPositiveFrameworkRating(rating);
  return {
    frameworkDimension,
    rating,
    scope,
    positiveEvidence: positives,
    limitingEvidence: limits,
    paragraphCoverage,
    confidence,
    rationale,
    sourceIssueIds: [...new Set(sourceIssueIds.map(text).filter(Boolean))],
    evidenceStatus: positive
      ? (positives.length ? "supported" : "insufficient")
      : (limits.length ? "limited" : rating === "Not Applicable" ? "not-applicable" : "insufficient"),
    aggregationMethod
  };
}

export function isPositiveFrameworkRating(value = "") {
  return POSITIVE_RATING.test(text(value)) && !/\b(?:not|mixed|moderate|needs work|repair needed|insufficient)\b/i.test(text(value));
}

function requirementEvidence(routeAssessment, dimension, filter = () => true) {
  return (Array.isArray(routeAssessment?.requirements) ? routeAssessment.requirements : [])
    .filter((item) => filter(item) && /adequate|controlled|present|complete/i.test(text(item?.status)))
    .map((item) => evidence(dimension, "Essay", item.evidence, "route-requirement", "high", `routeAssessment.requirements.${item.id}`))
    .filter(Boolean);
}

function buildPositionRecord(routeAssessment = {}) {
  const semantic = routeAssessment.semanticPosition || {};
  const qualifiedState = routeAssessment.qualifiedPositionState || semantic.finalPositionState;
  const qualified = qualifiedState?.qualified === true;
  const qualifiedNeedsThesisRepair = qualified && qualifiedState.thesisClarity !== "clear";
  const exact = semantic.exactPositionEvidence ||
    (routeAssessment.requirements || []).find((item) => item.id === "judgement")?.evidence ||
    "";
  const clear = /clear/i.test(text(semantic.positionClarity)) &&
    /consistent/i.test(text(semantic.positionConsistency)) &&
    /high|medium/i.test(text(semantic.positionConfidence || routeAssessment.confidence));
  const positives = (clear || qualified)
    ? [evidence("Position Clarity", "Introduction", exact, "explicit-position", semantic.positionConfidence || routeAssessment.confidence, "routeAssessment.semanticPosition")]
    : [];
  const qualifiedLimit = qualifiedNeedsThesisRepair
    ? evidence(
        "Position Clarity",
        "Introduction",
        semantic.thesisPositionEvidence || qualifiedState.thesisPositionEvidence || exact,
        "qualified-thesis-limiter",
        "high",
        "routeAssessment.qualifiedPositionState"
      )
    : null;
  return contractRecord({
    frameworkDimension: "Position Clarity",
    rating: qualifiedNeedsThesisRepair ? "Needs Work in Thesis - Clarified by Conclusion" : positives.length ? "Strong" : "Not Demonstrated",
    positiveEvidence: positives,
    limitingEvidence: qualifiedLimit ? [qualifiedLimit] : [],
    confidence: positives.length ? text(semantic.positionConfidence || routeAssessment.confidence || "medium") : "low",
    rationale: qualifiedNeedsThesisRepair
      ? "The conclusion makes the qualified judgement traceable, but the thesis initially combines positive and negative evaluation without clearly separating the limited exception from the main position."
      : positives.length
      ? "The position is explicit, consistent and traceable to the submitted introduction."
      : "A positive position judgement cannot be made without explicit, consistent position evidence.",
    aggregationMethod: "explicit-position-and-consistency"
  });
}

function buildThesisRecord(routeAssessment = {}, thesisDimensions = {}, issues = []) {
  const qualifiedState = routeAssessment.qualifiedPositionState || routeAssessment.semanticPosition?.finalPositionState;
  const qualifiedNeedsRepair = qualifiedState?.qualified === true && qualifiedState.thesisClarity !== "clear";
  const routeEvidence = text(
    routeAssessment.semanticPosition?.exactPositionEvidence ||
    routeAssessment.taskAwareRouteModel?.introductionRoutePromise?.exactEvidence ||
    routeAssessment.requirements?.find((item) => item.id === "judgement")?.evidence
  );
  const routePresent = !qualifiedNeedsRepair && (thesisDimensions.structurallyClear === true ||
    (Array.isArray(routeAssessment.missingRequirements) && routeAssessment.missingRequirements.length === 0 &&
      /adequate|controlled|present/i.test(text(routeAssessment.thesisRouteStatus))));
  const limits = issues.filter((issue) => /Thesis Route Clarity/i.test(issueCategory(issue)));
  const positives = routePresent && routeEvidence
    ? [evidence("Thesis Route Clarity", "Introduction", routeEvidence, "thesis-route", routeAssessment.confidence || "medium", "thesisDimensions + routeAssessment")]
    : [];
  return contractRecord({
    frameworkDimension: "Thesis Route Clarity",
    rating: qualifiedNeedsRepair ? "Needs Work - Qualified Route Clarified Later" : positives.length ? "Strong" : limits.length ? "Needs Work" : "Not Assessed",
    positiveEvidence: positives,
    limitingEvidence: limits.map((issue) => evidence("Thesis Route Clarity", paragraphLabelForIssue(issue), issue.exactSentence || issue.exactEvidence, "limiting-issue", "high", issue.issueId)),
    confidence: positives.length ? "high" : "low",
    rationale: qualifiedNeedsRepair
      ? "The thesis contains the intended qualified route but does not yet label the limited exception and main judgement clearly; the conclusion resolves that scope."
      : positives.length
      ? "The thesis states a traceable route. Whether every promised idea is fully developed is assessed separately."
      : "No explicit positive thesis-route evidence was available.",
    sourceIssueIds: limits.map((issue) => issue.issueId),
    aggregationMethod: "thesis-route-presence-not-development-quality"
  });
}

function buildBodyRouteRecord(routeAssessment = {}, issues = []) {
  const routes = Array.isArray(routeAssessment.bodyRoutes) ? routeAssessment.bodyRoutes : [];
  const coverage = routes.map((route) => {
    const label = `Body Paragraph ${route.index}`;
    const exact = route.controllingSentence || route.evidence || route.paragraphClaim;
    const controlled = /adequate|controlled|present/i.test(text(route.alignmentStatus || route.status));
    const qualifiedRole = route.routeRole === "exception-concession"
      ? "Exception/Concession Aligned"
      : route.routeRole === "main-position-support"
        ? "Main-Position Aligned"
        : "Aligned";
    return {
      paragraphLabel: label,
      status: controlled && exact ? qualifiedRole : "Not Demonstrated",
      exactEvidence: text(exact),
      confidence: exact ? "high" : "low"
    };
  });
  const positives = coverage
    .filter((item) => /Aligned$/.test(item.status))
    .map((item) => evidence("Body Paragraph Route Alignment", item.paragraphLabel, item.exactEvidence, "controlling-proposition", item.confidence, "routeAssessment.bodyRoutes"));
  const limits = issues.filter((issue) =>
    (/Body Route Alignment/i.test(issueCategory(issue)) ||
      (/Route Clarity/i.test(issueCategory(issue)) && /Body Paragraph/i.test(paragraphLabelForIssue(issue)))) &&
    !/High-Band Refinement/i.test(text(issue.severity || issue.revisionType)) &&
    !/\broute is functional\b|\broute-consistent\b|\boptional\b/i.test(text(issue.kruPomDiagnosis || issue.diagnosis || issue.whyItLimitsBand))
  );
  const allAligned = coverage.length > 0 && positives.length === coverage.length && limits.length === 0;
  return contractRecord({
    frameworkDimension: "Body Paragraph Route Alignment",
    rating: allAligned ? "Aligned" : positives.length ? "Mixed" : "Not Demonstrated",
    positiveEvidence: positives,
    limitingEvidence: limits.map((issue) => evidence("Body Paragraph Route Alignment", paragraphLabelForIssue(issue), issue.exactSentence || issue.exactEvidence, "limiting-issue", "high", issue.issueId)),
    paragraphCoverage: coverage,
    confidence: allAligned ? "high" : positives.length ? "medium" : "low",
    rationale: allAligned
      ? routes.map((route) => `Body ${route.index}: ${text(route.label || route.promptObligationServed || "route aligned")}`).join(" | ")
      : "At least one body paragraph lacks a positively identified controlling route.",
    sourceIssueIds: limits.map((issue) => issue.issueId),
    aggregationMethod: "all-body-controlling-propositions"
  });
}

function buildExplanationRecord(routeAssessment = {}, issues = []) {
  const routes = Array.isArray(routeAssessment.bodyRoutes) ? routeAssessment.bodyRoutes : [];
  const coverage = routes.map((route) => {
    const label = `Body Paragraph ${route.index}`;
    const paragraphIssues = issuesForParagraph(issues, label).filter((issue) => DEVELOPMENT_GAP.test(issueCategory(issue)));
    const exact = route.explanationMechanism ||
      route.taskAwareRouteModel?.developmentEvidence?.[0] ||
      "";
    const controlled = Boolean(text(exact)) && paragraphIssues.length === 0;
    return {
      paragraphLabel: label,
      status: controlled ? "Controlled" : paragraphIssues.length ? "Development Repair Needed" : "Not Demonstrated",
      exactEvidence: text(exact),
      sourceIssueIds: paragraphIssues.map((issue) => text(issue.issueId)).filter(Boolean)
    };
  });
  const positives = coverage
    .filter((item) => item.status === "Controlled")
    .map((item) => evidence("Explanation Depth", item.paragraphLabel, item.exactEvidence, "causal-or-explanatory-mechanism", "high", "routeAssessment.bodyRoutes.explanationMechanism"));
  const limits = issues.filter((issue) => DEVELOPMENT_GAP.test(issueCategory(issue)));
  const allControlled = coverage.length > 0 && coverage.every((item) => item.status === "Controlled");
  return contractRecord({
    frameworkDimension: "Explanation Depth",
    rating: allControlled ? "Strong" : positives.length ? "Moderate" : limits.length ? "Needs Work" : "Not Assessed",
    positiveEvidence: positives,
    limitingEvidence: limits.map((issue) => evidence("Explanation Depth", paragraphLabelForIssue(issue), issue.exactSentence || issue.exactEvidence, "development-limiter", "high", issue.issueId)),
    paragraphCoverage: coverage,
    confidence: allControlled ? "high" : "medium",
    rationale: allControlled
      ? "Every body paragraph contains a traceable explanatory mechanism with no surviving development limiter."
      : "Explanation quality is uneven across the body paragraphs.",
    sourceIssueIds: limits.map((issue) => issue.issueId),
    aggregationMethod: "paragraph-by-paragraph-mechanism"
  });
}

function buildSarRecord(routeAssessment = {}, issues = []) {
  const routes = Array.isArray(routeAssessment.bodyRoutes) ? routeAssessment.bodyRoutes : [];
  const coverage = routes.map((route) => {
    const label = `Body Paragraph ${route.index}`;
    const paragraphIssues = issuesForParagraph(issues, label);
    const exampleGaps = paragraphIssues.filter((issue) => {
      const category = issueCategory(issue);
      if (/Example Development|SAR Example Quality/i.test(category)) return true;
      if (/Causal Mechanism|Solution Mechanism|Sentence Completion/i.test(category)) {
        return !text(route.exampleSupport) || /example/i.test(text(issue.sentenceRole || issue.sentenceFunction));
      }
      return false;
    });
    const exampleText = text(route.exampleSupport);
    const explanationText = text(route.explanationMechanism);
    let status = "Not Assessed";
    let exactEvidence = "";
    let evidenceType = "";
    if (route.supportAssessment?.status) {
      status = text(route.supportAssessment.status);
      exactEvidence = text(route.supportAssessment.exactEvidence || exampleText || explanationText);
      evidenceType = status === "Development Repair Needed" ? "limited-example" : "controlled-support-language-repair";
    } else if (exampleText && !exampleGaps.length) {
      status = "Strong Support";
      exactEvidence = exampleText;
      evidenceType = "concrete-example";
    } else if (exampleText && exampleGaps.length) {
      status = "Development Repair Needed";
      exactEvidence = exampleText;
      evidenceType = "limited-example";
    } else if (!exampleText && explanationText && !exampleGaps.length) {
      status = "Explanation Sufficient Without Example";
      exactEvidence = explanationText;
      evidenceType = "complete-explanation-without-example";
    } else if (exampleGaps.length) {
      status = "Development Repair Needed";
      exactEvidence = text(exampleGaps[0]?.exactSentence || exampleGaps[0]?.exactEvidence || explanationText);
      evidenceType = "development-limiter";
    } else {
      status = "Not Demonstrated";
    }
    return {
      paragraphLabel: label,
      status,
      exactEvidence,
      evidenceType,
      sourceIssueIds: exampleGaps.map((issue) => text(issue.issueId)).filter(Boolean)
    };
  });
  const isPositiveStatus = (status) => /^(?:Strong Support|Controlled Support|Explanation Sufficient Without Example)/.test(text(status));
  const positives = coverage
    .filter((item) => isPositiveStatus(item.status))
    .map((item) => evidence("SAR Example Quality", item.paragraphLabel, item.exactEvidence, item.evidenceType, "high", "routeAssessment.bodyRoutes"));
  const limitingRows = coverage.filter((item) => !isPositiveStatus(item.status) && /Repair Needed|Not Demonstrated/.test(item.status));
  const limits = limitingRows.map((item) =>
    evidence("SAR Example Quality", item.paragraphLabel, item.exactEvidence || item.paragraphLabel, item.evidenceType || "support-not-demonstrated", "high", item.sourceIssueIds.join(",")));
  const hasStrong = coverage.some((item) => item.status === "Strong Support");
  const allPositive = coverage.length > 0 && coverage.every((item) => isPositiveStatus(item.status));
  const anyLimited = limitingRows.length > 0;
  let rating = "Not Assessed";
  if (allPositive) rating = hasStrong ? "Strong" : "Controlled";
  else if (positives.length && anyLimited) rating = "Mixed";
  else if (anyLimited) rating = "Not Demonstrated";
  return contractRecord({
    frameworkDimension: "SAR Example Quality",
    rating,
    positiveEvidence: positives,
    limitingEvidence: limits,
    paragraphCoverage: coverage,
    confidence: coverage.length ? "high" : "low",
    rationale: positives.length && anyLimited
      ? `${coverage.find((item) => isPositiveStatus(item.status))?.paragraphLabel || "One body paragraph"} uses controlled support, while ${limitingRows[0]?.paragraphLabel || "another paragraph"} still needs development repair, so support quality is uneven.`
      : allPositive
        ? "Each body paragraph has positively demonstrated support; an explicit example is not required when a complete causal explanation performs the support function."
        : "Positive example/support quality was not demonstrated across the body paragraphs.",
    sourceIssueIds: coverage.flatMap((item) => item.sourceIssueIds),
    aggregationMethod: "paragraph-support-profile-no-example-quota"
  });
}

function buildLinkBackRecord(routeAssessment = {}, issues = []) {
  const routes = Array.isArray(routeAssessment.bodyRoutes) ? routeAssessment.bodyRoutes : [];
  const qualified = Boolean(routeAssessment.qualifiedPositionState?.qualified || routeAssessment.semanticPosition?.finalPositionState?.qualified);
  const coverage = routes.map((route) => {
    const label = `Body Paragraph ${route.index}`;
    const exact = text(route.linkBack || route.controllingSentence || route.evidence);
    const paragraphIssues = issuesForParagraph(issues, label).filter((issue) => {
      const category = issueCategory(issue);
      const targetsLinkBack = Boolean(text(route.linkBack)) &&
        text(issue.exactSentence || issue.exactEvidence).trim() === text(route.linkBack).trim();
      if (/Link Back Control|Paragraph Closure/i.test(category)) return true;
      if (/Reference Control/i.test(category)) return targetsLinkBack;
      if (!qualified || !/Sentence Completion/i.test(category)) return false;
      return targetsLinkBack;
    });
    return {
      paragraphLabel: label,
      status: exact && !paragraphIssues.length ? "Controlled" : paragraphIssues.length ? "Repair Needed" : "Not Demonstrated",
      exactEvidence: exact,
      sourceIssueIds: paragraphIssues.map((issue) => text(issue.issueId)).filter(Boolean)
    };
  });
  const positives = coverage.filter((item) => item.status === "Controlled")
    .map((item) => evidence("Link Back Control", item.paragraphLabel, item.exactEvidence, "maintained-controlling-idea", "medium", "routeAssessment.bodyRoutes.linkBack"));
  const limited = coverage.filter((item) => item.status !== "Controlled");
  const allControlled = coverage.length > 0 && limited.length === 0;
  return contractRecord({
    frameworkDimension: "Link Back Control",
    rating: allControlled ? "Strong" : positives.length ? "Mixed" : "Not Demonstrated",
    positiveEvidence: positives,
    limitingEvidence: limited.map((item) => evidence("Link Back Control", item.paragraphLabel, item.exactEvidence || item.paragraphLabel, "closure-limiter", "medium", item.sourceIssueIds.join(","))),
    paragraphCoverage: coverage,
    confidence: allControlled ? "medium" : "low",
    rationale: allControlled
      ? "Each body paragraph maintains a traceable controlling idea; a formulaic link-back sentence is not required."
      : "Closure control is not positively demonstrated in every body paragraph.",
    sourceIssueIds: coverage.flatMap((item) => item.sourceIssueIds),
    aggregationMethod: "paragraph-controlling-idea-maintenance"
  });
}

function buildConclusionRecord(routeAssessment = {}, conclusionFunction = {}, issues = []) {
  const conclusionRequirement = (routeAssessment.requirements || []).find((item) => item.id === "conclusion");
  const exact = text(conclusionRequirement?.evidence || routeAssessment.taskAwareRouteModel?.conclusionRouteClosure?.exactEvidence);
  const routeClosed = conclusionFunction?.complete === true &&
    /adequate|controlled|present/i.test(text(conclusionRequirement?.status || routeAssessment.overallRouteStatus)) &&
    !(routeAssessment.missingRequirements || []).length;
  const functionalIssues = issues.filter((issue) => /Conclusion Closure/i.test(issueCategory(issue)));
  const languageIssues = issuesForParagraph(issues, "Conclusion").filter((issue) => LANGUAGE_GAP.test(issueCategory(issue)));
  const positives = routeClosed && exact
    ? [evidence("Conclusion Closure", "Conclusion", exact, "route-closure", routeAssessment.confidence || "medium", "routeAssessment.requirements.conclusion")]
    : [];
  let rating = functionalIssues.length ? "Needs Work" : positives.length ? "Functionally Strong" : "Not Assessed";
  if (!functionalIssues.length && positives.length && languageIssues.length) rating = "Functionally Strong - Language Repair Needed";
  return contractRecord({
    frameworkDimension: "Conclusion Closure",
    rating,
    positiveEvidence: positives,
    limitingEvidence: functionalIssues.map((issue) => evidence("Conclusion Closure", "Conclusion", issue.exactSentence || issue.exactEvidence, "functional-limiter", "high", issue.issueId)),
    paragraphCoverage: [{
      paragraphLabel: "Conclusion",
      status: rating,
      exactEvidence: exact,
      sourceIssueIds: [...functionalIssues, ...languageIssues].map((issue) => text(issue.issueId)).filter(Boolean)
    }],
    confidence: positives.length ? "high" : "low",
    rationale: functionalIssues.length
      ? `The conclusion contains a validated functional limiter: ${functionalIssues.map((issue) => issueCategory(issue)).join(", ")}. Its route closure does not cancel new or undeveloped conclusion material.`
      : positives.length
        ? "The conclusion preserves the established judgement and closes the route; language accuracy is reported separately."
        : "A positive conclusion judgement requires explicit route-closure evidence.",
    sourceIssueIds: [...functionalIssues, ...languageIssues].map((issue) => issue.issueId),
    aggregationMethod: "functional-closure-separated-from-language"
  });
}

function buildLfcRecord(frameworkScores = {}, languageProfile = {}, issues = []) {
  const languageIssues = issues.filter((issue) => LANGUAGE_GAP.test(issueCategory(issue)));
  const strengths = Array.isArray(languageProfile?.positiveEvidence)
    ? languageProfile.positiveEvidence
    : Array.isArray(languageProfile?.strengths) ? languageProfile.strengths : [];
  const positives = strengths.map((item) =>
    evidence("LFC CPC Control", item.paragraphLocation || item.paragraphLabel || "Essay", item.exactSentence || item.evidence || item, "language-control", item.confidence || "medium", "languageProfile.positiveEvidence"))
    .filter(Boolean);
  const current = frameworkScores["LFC CPC Control"] || frameworkScores["LFC-CPC Control"] || {};
  const rating = languageIssues.length ? "Moderate" : positives.length ? text(current.status || "Strong") : "Not Assessed";
  return contractRecord({
    frameworkDimension: "LFC CPC Control",
    rating,
    positiveEvidence: positives,
    limitingEvidence: languageIssues.map((issue) => evidence("LFC CPC Control", paragraphLabelForIssue(issue), issue.exactSentence || issue.exactEvidence, "language-limiter", "high", issue.issueId)),
    confidence: languageIssues.length || positives.length ? "high" : "low",
    rationale: languageIssues.length
      ? `Validated language issues remain in: ${[...new Set(languageIssues.map(issueCategory))].join(", ")}.`
      : positives.length ? "Positive language-control evidence is traceable." : "No priority language issue is not proof of strong language control.",
    sourceIssueIds: languageIssues.map((issue) => issue.issueId),
    aggregationMethod: "validated-language-evidence-not-absence"
  });
}

function genericRecord(name, card = {}, routeAssessment = {}, issues = []) {
  // Only dimensions whose proposition is genuinely established by the canonical route model may
  // consume route-requirement evidence. Reusing an essay-route sentence as "evidence" for
  // vocabulary, grammar, paragraph balance or memorisation risk would satisfy the shape of the
  // contract while violating its meaning.
  const routeEvidenceDimensions = new Set(["Essay Type Recognition", "Prompt Coverage"]);
  const positives = routeEvidenceDimensions.has(name) ? requirementEvidence(routeAssessment, name) : [];
  const issuePattern = /Vocabulary/i.test(name)
    ? /Lexical|Word|Collocation|Meaning/i
    : /Grammar/i.test(name)
      ? /Grammar|Agreement|Article|Countability|Tense|Preposition|Modal|Sentence/i
      : /Paragraph Balance/i.test(name)
        ? /Paragraph Balance|Development Depth|Route Coverage/i
        : null;
  const limits = issuePattern ? issues.filter((issue) => issuePattern.test(issueCategory(issue))) : [];
  const rating = name === "Prompt Coverage" && positives.length && !(routeAssessment.missingRequirements || []).length
    ? "Aligned"
    : isPositiveFrameworkRating(card.status) && !positives.length ? "Not Assessed" : text(card.status || "Not Assessed");
  const originalDiagnosis = text(card.diagnosis);
  return contractRecord({
    frameworkDimension: name,
    rating,
    positiveEvidence: positives,
    limitingEvidence: limits.map((issue) =>
      evidence(name, paragraphLabelForIssue(issue), issue.exactSentence || issue.exactEvidence, "limiting-issue", "high", issue.issueId)),
    confidence: positives.length || limits.length ? "medium" : "low",
    rationale: positives.length
      ? "The positive judgement is supported by clear, traceable evidence in the response."
      : originalDiagnosis || "No explicit positive evidence record was available, so the rating is not inferred from the absence of an issue.",
    sourceIssueIds: limits.map((issue) => issue.issueId),
    aggregationMethod: "generic-fail-closed"
  });
}

function localizeFrameworkRecord(record = {}, reportLanguage = "en") {
  if (String(reportLanguage).toLowerCase() !== "th") return record;
  const name = record.frameworkDimension;
  const rating = record.rating;
  const limited = Array.isArray(record.limitingEvidence) && record.limitingEvidence.length > 0;
  const messages = {
    "Position Clarity": isPositiveFrameworkRating(rating)
      ? "จุดยืนชัดเจน สอดคล้องตลอดทั้งงาน และมีหลักฐานตรงจากบทนำ"
      : "ยังไม่สามารถยืนยันจุดยืนเชิงบวกได้ เพราะไม่มีหลักฐานจุดยืนที่ชัดเจนและสอดคล้อง",
    "Thesis Route Clarity": isPositiveFrameworkRating(rating)
      ? "Thesis ระบุเส้นทางคำตอบได้ชัดเจน ส่วนการพัฒนาคำสัญญาแต่ละประเด็นประเมินแยกต่างหาก"
      : "ยังไม่มีหลักฐานเชิงบวกที่เพียงพอเพื่อยืนยันความชัดเจนของเส้นทาง Thesis",
    "Body Paragraph Route Alignment": isPositiveFrameworkRating(rating)
      ? "แต่ละย่อหน้าเนื้อหามีประโยคควบคุมที่สอดคล้องกับเส้นทางคำตอบและตรวจสอบย้อนกลับได้"
      : "อย่างน้อยหนึ่งย่อหน้าเนื้อหายังไม่มีหลักฐานชัดเจนว่าเส้นทางสอดคล้องกับคำตอบหลัก",
    "Explanation Depth": rating === "Strong"
      ? "ทุกย่อหน้าเนื้อหามีกลไกอธิบายที่ตรวจสอบได้และไม่มีข้อจำกัดด้านการพัฒนาหลงเหลือ"
      : "ความลึกของคำอธิบายยังไม่สม่ำเสมอระหว่างย่อหน้าเนื้อหา",
    "SAR Example Quality": rating === "Mixed"
      ? "คุณภาพหลักฐานสนับสนุนยังไม่สม่ำเสมอ: มีย่อหน้าที่สนับสนุนได้ดี แต่อีกย่อหน้ายังต้องซ่อมการพัฒนา"
      : isPositiveFrameworkRating(rating)
        ? "ทุกย่อหน้าเนื้อหามีหลักฐานสนับสนุนที่ตรวจสอบได้ โดยไม่บังคับว่าต้องใช้ตัวอย่างเมื่อคำอธิบายเหตุผลทำหน้าที่นี้ได้ครบ"
        : "ยังไม่พบหลักฐานเชิงบวกเพียงพอที่จะยืนยันคุณภาพตัวอย่างหรือการสนับสนุนในทุกย่อหน้า",
    "Link Back Control": isPositiveFrameworkRating(rating)
      ? "แต่ละย่อหน้าเนื้อหารักษาแนวคิดควบคุมไว้ได้ โดยไม่จำเป็นต้องใช้ประโยคเชื่อมกลับแบบสูตรสำเร็จ"
      : "ยังไม่พบหลักฐานเชิงบวกของการควบคุมบทสรุปย่อหน้าในทุกย่อหน้า",
    "Conclusion Closure": isPositiveFrameworkRating(rating) || /Functionally Strong/i.test(rating)
      ? "บทสรุปรักษาคำตัดสินเดิมและปิดเส้นทางคำตอบได้ ส่วนความถูกต้องทางภาษาแยกประเมินต่างหาก"
      : "การให้คะแนนบทสรุปเชิงบวกต้องมีหลักฐานตรงว่าบทสรุปปิดเส้นทางคำตอบจริง",
    "LFC CPC Control": limited
      ? "ยังมีข้อจำกัดทางภาษาที่ผ่านการตรวจสอบและต้องแก้ไขก่อนถือว่าควบคุมภาษาได้ดี"
      : isPositiveFrameworkRating(rating)
        ? "มีหลักฐานเชิงบวกที่ตรวจสอบย้อนกลับได้ว่าควบคุมภาษาได้"
        : "การไม่พบปัญหาลำดับต้นไม่ใช่หลักฐานว่าควบคุมภาษาได้ดี"
  };
  const translated = messages[name];
  if (translated) return { ...record, rationale: translated };
  if (/[\u0E00-\u0E7F]/u.test(String(record.rationale || ""))) return record;
  return {
    ...record,
    rationale: limited
      ? "มิตินี้ยังมีหลักฐานข้อจำกัดที่ต้องตรวจสอบและแก้ไข"
      : "ยังไม่มีหลักฐานเชิงบวกโดยตรง จึงไม่อนุมานผลเชิงบวกจากการไม่พบปัญหา"
  };
}

export function buildFrameworkEvidenceContract({
  taskType = "Task 2",
  reportLanguage = "en",
  frameworkScores = {},
  routeAssessment = {},
  thesisDimensions = {},
  paragraphCoverage = [],
  canonicalIssues = [],
  conclusionFunction = null,
  languageProfile = {},
  criteriaScores = {}
} = {}) {
  if (String(taskType) === "Task 1") {
    return {
      version: FRAMEWORK_EVIDENCE_VERSION,
      taskType: "Task 1",
      dimensions: {},
      frameworkScores: { ...frameworkScores },
      audit: [],
      note: "Task 1 does not inherit Task 2 SAR/example requirements."
    };
  }
  const issues = Array.isArray(canonicalIssues) ? canonicalIssues : [];
  let dimensions = {
    "Position Clarity": buildPositionRecord(routeAssessment),
    "Thesis Route Clarity": buildThesisRecord(routeAssessment, thesisDimensions, issues),
    "Body Paragraph Route Alignment": buildBodyRouteRecord(routeAssessment, issues),
    "Explanation Depth": buildExplanationRecord(routeAssessment, issues),
    "SAR Example Quality": buildSarRecord(routeAssessment, issues),
    "Link Back Control": buildLinkBackRecord(routeAssessment, issues),
    "Conclusion Closure": buildConclusionRecord(routeAssessment, conclusionFunction, issues),
    "LFC CPC Control": buildLfcRecord(frameworkScores, languageProfile, issues)
  };
  for (const [name, card] of Object.entries(frameworkScores || {})) {
    const normalizedName = name === "LFC-CPC Control" ? "LFC CPC Control" : name;
    if (!dimensions[normalizedName]) dimensions[normalizedName] = genericRecord(normalizedName, card, routeAssessment, issues);
  }
  dimensions = Object.fromEntries(
    Object.entries(dimensions).map(([name, record]) => [name, localizeFrameworkRecord(record, reportLanguage)])
  );
  const reconciled = { ...frameworkScores };
  for (const [name, record] of Object.entries(dimensions)) {
    const sourceName = Object.prototype.hasOwnProperty.call(reconciled, name)
      ? name
      : name === "LFC CPC Control" && Object.prototype.hasOwnProperty.call(reconciled, "LFC-CPC Control")
        ? "LFC-CPC Control"
        : name;
    const previous = reconciled[sourceName] || {};
    reconciled[sourceName] = {
      ...previous,
      status: record.rating,
      diagnosis: record.rationale
    };
  }
  const audit = auditFrameworkEvidenceContract({ dimensions, frameworkScores: reconciled });
  return {
    version: FRAMEWORK_EVIDENCE_VERSION,
    taskType: "Task 2",
    dimensions,
    frameworkScores: reconciled,
    audit,
    paragraphCoverageCount: Array.isArray(paragraphCoverage) ? paragraphCoverage.length : 0,
    criterionCount: Object.keys(criteriaScores || {}).length
  };
}

export function auditFrameworkEvidenceContract(contract = {}) {
  const records = [];
  for (const [name, dimension] of Object.entries(contract.dimensions || {})) {
    const positive = isPositiveFrameworkRating(dimension.rating);
    const evidenceRecords = Array.isArray(dimension.positiveEvidence) ? dimension.positiveEvidence : [];
    const invalidEvidence = evidenceRecords.filter((item) => !text(item?.evidenceId) || !text(item?.paragraphLabel) || !text(item?.exactEvidence));
    const pass = !positive || (evidenceRecords.length > 0 && invalidEvidence.length === 0 && /high|medium/i.test(text(dimension.confidence)));
    records.push({
      frameworkDimension: name,
      rating: text(dimension.rating),
      positiveRating: positive,
      positiveEvidenceCount: evidenceRecords.length,
      invalidEvidenceCount: invalidEvidence.length,
      pass,
      result: pass ? "PASS" : "FAIL"
    });
  }
  return records;
}

export function assertFrameworkEvidenceContract(contract = {}) {
  const audit = auditFrameworkEvidenceContract(contract);
  const failures = audit.filter((item) => !item.pass);
  if (!failures.length) return audit;
  const error = new Error(`Positive framework ratings lack traceable positive evidence: ${failures.map((item) => item.frameworkDimension).join(", ")}.`);
  error.errorCode = "FRAMEWORK_EVIDENCE_CONTRACT_FAILED";
  error.validationDetails = failures;
  throw error;
}
