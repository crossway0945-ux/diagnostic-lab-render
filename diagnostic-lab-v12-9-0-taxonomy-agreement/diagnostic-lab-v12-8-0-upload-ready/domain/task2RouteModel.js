export const TASK2_ROUTE_CLASSIFIER_VERSION = "task-aware-route-model-v12.8.0";

const ROUTE_TYPES = Object.freeze([
  "cause", "problem", "solution", "effect", "advantage", "disadvantage",
  "support", "oppose", "view-a", "view-b", "answer", "unresolved"
]);

const CAUSE_FRAME = /\b(?:cause[sd]?|reason(?:s)?|driver(?:s)?|factor(?:s)?|because|due to|owing to|stems? from|result(?:s|ed)? from|is caused by|plays? (?:a|an) (?:major|crucial|important) role|lack of|shortage of|absence of|inattention|careless(?:ness)?|overcrowding)\b/i;
const PROBLEM_FRAME = /\b(?:problem(?:s)?|issue(?:s)?|difficulty|consequence(?:s)?|harm|delay(?:s)?|pollution|accident(?:s)?|traffic jam(?:s)?|pressure|burden|worsen(?:s|ed)?|negative impact)\b/i;
const EFFECT_FRAME = /\b(?:effect(?:s)?|consequence(?:s)?|impact(?:s)?|therefore|as a result|consequently|lead(?:s)? to|result(?:s)? in|create(?:s)?|produce(?:s)?)\b/i;
const ADVANTAGE_FRAME = /\b(?:advantage(?:s)?|benefit(?:s)?|positive (?:effect|impact|outcome)|improve(?:s|d)?|enable(?:s|d)?|opportunit(?:y|ies))\b/i;
const DISADVANTAGE_FRAME = /\b(?:disadvantage(?:s)?|drawback(?:s)?|negative (?:effect|impact|outcome)|risk(?:s)?|cost(?:s)?|burden(?:s)?|harm(?:s|ed)?)\b/i;
const SUPPORT_FRAME = /\b(?:i (?:strongly |firmly |fully )?agree|support(?:s|ed)?|should be|is beneficial|is essential)\b/i;
const OPPOSE_FRAME = /\b(?:i (?:strongly |firmly |fully )?disagree|oppose(?:s|d)?|should not|is harmful|is unnecessary)\b/i;

const SOLUTION_NOUN = /\b(?:solution(?:s)?|measure(?:s)?|policy|policies|initiative(?:s)?|programme(?:s)?|program(?:s)?|law(?:s)?|regulation(?:s)?|investment|infrastructure|enforcement|campaign(?:s)?|subsid(?:y|ies)|tax(?:es)?|restriction(?:s)?)\b/i;
const SOLUTION_AGENT = /\b(?:government(?:s)?|authorit(?:y|ies)|council(?:s)?|city officials?|police|schools?|employers?|companies|businesses|transport operators?|the state|policy[- ]makers?|individuals?|drivers?|residents?)\b/i;
const SOLUTION_MODAL_ACTION = /\b(?:should|could|must|need to|ought to|can)\s+(?:(?:significantly|substantially|gradually|directly|actively|strongly|more)\s+){0,2}(?:build|provide|introduce|implement|invest|expand|improve|enforce|encourage|require|restrict|subsidise|subsidize|fund|create|develop|increase|reduce|ban|charge|educate|promote)\b/i;
const SOLUTION_COPULAR_ACTION = /\b(?:solution|measure|policy|initiative|programme|program|approach|response)\b[^.!?]{0,80}\b(?:is|would be)\s+to\s+(?:build|provide|introduce|implement|invest|expand|improve|enforce|encourage|require|restrict|subsidise|subsidize|fund|create|develop|increase|reduce|ban|charge|educate|promote)\b/i;
const SOLUTION_GERUND_ACTION = /\b(?:building|providing|introducing|implementing|investing in|expanding|improving|enforcing|encouraging|requiring|restricting|funding|creating|developing|banning|charging|educating|promoting)\b/i;
const PURPOSE_FRAME = /\b(?:in order to|so that|thereby|which would|this would|to reduce|to address|to tackle|to solve|to alleviate|to prevent)\b/i;
const EXAMPLE_FRAME = /^(?:for example|for instance|to illustrate|such as)\b/i;
const DISCOURSE_ONLY = /^(?:first(?:ly| of all)?|second(?:ly)?|furthermore|moreover|in addition|however|on the other hand|another point is that)\s*,?\s*/i;

export function buildTaskAwareRouteModel({
  taskFamily = "",
  internalSubtype = "",
  requiredRoutes = [],
  prompt = "",
  introduction = "",
  bodyParagraphs = [],
  conclusion = ""
} = {}) {
  const family = String(internalSubtype || taskFamily || "unresolved");
  const requirements = normalizeRequiredRouteTypes(taskFamily, internalSubtype, requiredRoutes, prompt);
  const paragraphRoutes = bodyParagraphs.map((paragraph, index) =>
    classifyParagraphRoute({ paragraph, index, family, requirements, prompt })
  );
  const present = new Set(paragraphRoutes.filter((item) => item.confidence !== "low").map((item) => item.primaryRoute));
  const missing = requirements.filter((required) => !present.has(required));
  const conflict = paragraphRoutes.some((item) => item.conflict);
  const overallRouteStatus = conflict
    ? "contradicted"
    : missing.length
      ? (present.size ? "partially_developed" : "absent")
      : paragraphRoutes.some((item) => item.developmentStatus !== "adequate")
        ? "partially_developed"
        : "adequately_developed";
  return Object.freeze({
    version: TASK2_ROUTE_CLASSIFIER_VERSION,
    taskFamily: String(taskFamily || "unresolved"),
    internalSubtype: String(internalSubtype || ""),
    requiredRouteTypes: Object.freeze([...requirements]),
    introductionRoutePromise: Object.freeze(classifyRoutePromise(introduction, requirements)),
    paragraphRoutes: Object.freeze(paragraphRoutes.map((item) => Object.freeze(item))),
    conclusionRouteClosure: Object.freeze(classifyRoutePromise(conclusion, requirements)),
    missingRouteTypes: Object.freeze(missing),
    overallRouteStatus,
    conflict,
    validation: Object.freeze({
      firstPass: "controlling-proposition",
      secondPassTriggered: paragraphRoutes.some((item) => item.secondPassTriggered),
      rule: "A route requires a controlling proposition and compatible development; a topic noun alone cannot establish a route."
    })
  });
}

export function classifyParagraphRoute({ paragraph = "", index = 0, family = "", requirements = [], prompt = "" } = {}) {
  const sentences = splitSentences(paragraph);
  const controllingSentence = sentences.find((sentence) => !EXAMPLE_FRAME.test(sentence)) || sentences[0] || "";
  const controllingProposition = controllingSentence.replace(DISCOURSE_ONLY, "").trim();
  const firstPass = scoreRouteFrames(controllingProposition, family, prompt);
  const development = scoreRouteFrames(sentences.slice(1).join(" "), family, prompt);
  const combined = Object.fromEntries(ROUTE_TYPES.map((type) => [
    type,
    (firstPass[type] || 0) * 3 + (development[type] || 0)
  ]));
  const initial = bestRoute(combined, requirements);
  const secondPassTriggered = isRouteEvidenceConflict(initial, firstPass, development);
  const validated = secondPassTriggered
    ? boundedRouteRevalidation({ initial, firstPass, development, requirements, controllingProposition })
    : initial;
  const wordCount = String(paragraph || "").trim().split(/\s+/).filter(Boolean).length;
  const lateAdditionalRoute = sentences.findIndex((sentence, sentenceIndex) =>
    sentenceIndex > 0 && /\b(?:second|another|additional)\s+(?:cause|problem|reason|solution|measure|effect|advantage|disadvantage)\b/i.test(sentence)
  );
  const additionalRouteUnderdeveloped = lateAdditionalRoute >= 0 && sentences.length - lateAdditionalRoute <= 2;
  const developmentStatus = sentences.length >= 3 && wordCount >= 55 && !additionalRouteUnderdeveloped
    ? "adequate"
    : sentences.length >= 2
      ? "partial"
      : "mentioned";
  return {
    index: index + 1,
    primaryRoute: validated.route,
    label: routeLabel(validated.route),
    confidence: validated.confidence,
    controllingProposition,
    evidence: controllingSentence,
    developmentEvidence: sentences.slice(1, 3),
    developmentStatus,
    firstPassScores: firstPass,
    developmentScores: development,
    secondPassTriggered,
    conflict: validated.conflict,
    rationale: validated.rationale
  };
}

function scoreRouteFrames(text, family, prompt) {
  const value = String(text || "");
  const solutionAction = SOLUTION_MODAL_ACTION.test(value) ||
    SOLUTION_COPULAR_ACTION.test(value) ||
    (SOLUTION_GERUND_ACTION.test(value) && (SOLUTION_NOUN.test(value) || PURPOSE_FRAME.test(value))) ||
    (SOLUTION_AGENT.test(value) && SOLUTION_NOUN.test(value) && PURPOSE_FRAME.test(value));
  const output = {
    cause: weightedMatches(value, CAUSE_FRAME) + (/\b(?:main|primary|underlying|immediate)\s+(?:cause|reason)\b|\b(?:cause|reason)\s+is\b/i.test(value) ? 4 : 0),
    problem: weightedMatches(value, PROBLEM_FRAME) + (/\b(?:main|primary|serious)\s+(?:problem|issue)\b|\b(?:problem|issue)\s+is\b/i.test(value) ? 4 : 0),
    solution: solutionAction ? 4 + weightedMatches(value, SOLUTION_NOUN) + weightedMatches(value, PURPOSE_FRAME) : 0,
    effect: weightedMatches(value, EFFECT_FRAME),
    advantage: weightedMatches(value, ADVANTAGE_FRAME),
    disadvantage: weightedMatches(value, DISADVANTAGE_FRAME),
    support: weightedMatches(value, SUPPORT_FRAME),
    oppose: weightedMatches(value, OPPOSE_FRAME),
    "view-a": 0,
    "view-b": 0,
    answer: /\b(?:because|the main reason|this is because|yes|no)\b/i.test(value) ? 1 : 0,
    unresolved: 0
  };
  if (/discuss both views/i.test(family) || /discuss both views/i.test(prompt)) {
    if (/on (?:the )?one hand|first view|some people|supporters/i.test(value)) output["view-a"] += 3;
    if (/on the other hand|second view|others? (?:argue|believe|claim)/i.test(value)) output["view-b"] += 3;
  }
  // Mentioning a transport option inside a causal proposition is not an intervention.
  if (!solutionAction) output.solution = 0;
  return output;
}

function boundedRouteRevalidation({ initial, firstPass, development, requirements, controllingProposition }) {
  const propositionWinner = bestRoute(firstPass, requirements);
  if (propositionWinner.confidence !== "low" && propositionWinner.route !== initial.route) {
    return {
      ...propositionWinner,
      confidence: "high",
      rationale: `Second-pass validation preferred the controlling proposition over a conflicting topic mention in supporting detail: "${controllingProposition}".`
    };
  }
  return {
    ...initial,
    confidence: initial.confidence === "high" ? "medium" : initial.confidence,
    rationale: "Second-pass validation retained the route because the controlling proposition and paragraph development were compatible."
  };
}

function isRouteEvidenceConflict(initial, firstPass, development) {
  const first = bestRoute(firstPass);
  const support = bestRoute(development);
  return first.confidence !== "low" && support.confidence !== "low" && first.route !== support.route && initial.route === support.route;
}

function bestRoute(scores, preferred = []) {
  const entries = Object.entries(scores || {})
    .filter(([route]) => ROUTE_TYPES.includes(route))
    .sort((left, right) => right[1] - left[1] || preferenceRank(left[0], preferred) - preferenceRank(right[0], preferred));
  const [route = "unresolved", score = 0] = entries[0] || [];
  const nextScore = entries[1]?.[1] || 0;
  return {
    route: score > 0 ? route : "unresolved",
    confidence: score >= 6 && score - nextScore >= 2 ? "high" : score >= 2 ? "medium" : "low",
    conflict: score > 0 && score === nextScore && entries[1]?.[0] !== route,
    rationale: score > 0
      ? `The controlling proposition and its development support the ${route} route.`
      : "No route was assigned because a topic mention without a controlling proposition is insufficient."
  };
}

function normalizeRequiredRouteTypes(taskFamily, internalSubtype, requiredRoutes, prompt) {
  const subtype = String(internalSubtype || "");
  const family = String(taskFamily || "");
  if (/causes-solutions|cause.*solution/i.test(`${subtype} ${prompt}`)) return ["cause", "solution"];
  if (/causes-effects|cause.*effect/i.test(`${subtype} ${prompt}`)) return ["cause", "effect"];
  if (/problem-solution/i.test(family)) return [/\b(?:cause|reason|why)\b/i.test(prompt) ? "cause" : "problem", "solution"];
  if (/advantages-disadvantages|outweigh/i.test(`${family} ${subtype}`)) return ["advantage", "disadvantage"];
  if (/opinion|positive-negative/i.test(`${family} ${subtype}`)) return ["support"];
  if (/discuss-both-views/i.test(family)) return ["view-a", "view-b"];
  if (/direct-question|hybrid|multi-question/i.test(`${family} ${subtype}`)) return ["answer"];
  const mapped = (Array.isArray(requiredRoutes) ? requiredRoutes : []).flatMap((item) => {
    const value = String(item || "").toLowerCase();
    return ROUTE_TYPES.filter((route) => value.includes(route));
  });
  return [...new Set(mapped.length ? mapped : ["unresolved"])];
}

function classifyRoutePromise(text, requirements) {
  const scores = scoreRouteFrames(text, "", "");
  return {
    promisedRoutes: requirements.filter((route) => (scores[route] || 0) > 0),
    exactEvidence: splitSentences(text)[0] || "",
    confidence: bestRoute(scores, requirements).confidence
  };
}

function routeLabel(route) {
  const labels = {
    cause: "develops causes",
    problem: "develops problems",
    solution: "develops solutions",
    effect: "develops effects",
    advantage: "develops advantages",
    disadvantage: "develops disadvantages",
    support: "supports the writer's position",
    oppose: "opposes the proposition",
    "view-a": "presents the first view",
    "view-b": "presents the second view",
    answer: "answers an explicit question",
    unresolved: "route is unclear from the controlling proposition"
  };
  return labels[route] || labels.unresolved;
}

function splitSentences(text) {
  return String(text || "")
    .replace(/([.!?])(?=[A-Z])/g, "$1 ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function weightedMatches(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Array.from(String(text || "").matchAll(new RegExp(pattern.source, flags))).length;
}

function preferenceRank(route, preferred) {
  const index = preferred.indexOf(route);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
