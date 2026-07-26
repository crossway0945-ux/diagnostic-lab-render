const COMPLETE_SENTENCE = /[.!?]["')\]]*$/u;
const EXAMPLE_MARKER = /^(?:for example|for instance|as an example|to illustrate)\b/i;
const CONCLUSION_MARKER = /^(?:in conclusion|to conclude|to sum up|in summary|overall)\b/i;
const CAUSE_ROUTE = /\b(?:cause|causes|reason|reasons|driver|drivers|source|sources|factor|factors|stem(?:s|ming)? from|due to|because of|responsible for)\b/i;
const SOLUTION_ROUTE = /\b(?:solution|solutions|solve|address|tackle|resolve|measure|measures|remedy|remedies|should|must|could be reduced|can be reduced)\b/i;
const VIEW_ROUTE = /\b(?:one view|the other view|some people|others argue|supporters|opponents|both views)\b/i;
const POSITION = /\b(?:i (?:strongly |firmly |partly |partially )?(?:agree|disagree|believe|argue|support|oppose)|in my view|in my opinion|outweigh|positive development|negative development)\b/i;
const THESIS_META_ROUTE = /\b(?:this|the)\s+(?:essay|response|report)\s+(?:will|aims? to)\s+(?:discuss|examine|consider|address|analyse|analyze)\b/i;
const QUESTION_ONE = /\b(?:first question|firstly|the first issue|regarding the first)\b/i;
const QUESTION_TWO = /\b(?:second question|secondly|the second issue|regarding the second)\b/i;
const CAUSAL_MECHANISM = /\b(?:because|since|thereby|therefore|thus|hence|consequently|as a result|resulting in|leads? to|causes?|creates?|forces?|prevents?|allows?|enables?|which means)\b/i;
const RESULT = /\b(?:therefore|thus|hence|consequently|as a result|resulting in|the result is|this means)\b/i;
const CONSEQUENCE = /\b(?:harm|damage|loss|delay|collision|accident|congestion|queue|shortage|pressure|risk|decline|increase|reduce|worsen|improve)\w*/i;
const LINK_BACK = /\b(?:this|these|such)\b.{0,100}\b(?:reason|claim|position|argument|problem|solution|route|thesis)\b/i;
const COMPARISON = /\b(?:whereas|while|compared with|compared to|in contrast|by contrast|higher|lower|more than|less than|respectively)\b/i;
const DATA = /\b\d+(?:[.,]\d+)?%?\b|\b(?:percent|percentage|million|billion|tonnes?|kilograms?|years?)\b/i;
const MAP_CHANGE = /\b(?:built|constructed|demolished|removed|replaced|converted|expanded|relocated|redeveloped|unchanged)\b/i;
const PROCESS_STAGE = /\b(?:first|next|then|subsequently|afterwards|finally|stage|step|is (?:heated|mixed|transported|processed|collected|stored|converted|cooled|filtered|packaged))\b/i;
const PROCESS_ENDPOINT = /\b(?:finally|final stage|ends? with|culminates? in|is ultimately|the finished|the final product)\b/i;
const OVERVIEW_MARKER = /^(?:overall|in general|generally|it is clear that|it can be seen that)\b/i;

export const CANONICAL_SENTENCE_ROLES = Object.freeze([
  "background",
  "paraphrase",
  "position",
  "thesis_route",
  "cause_route",
  "solution_route",
  "view_route",
  "answer_to_question_1",
  "answer_to_question_2",
  "body_topic_sentence",
  "explanation",
  "causal_mechanism",
  "example",
  "evidence",
  "result",
  "consequence",
  "paragraph_closure",
  "link_back",
  "conclusion_position",
  "conclusion_summary",
  "conclusion_new_idea",
  "introduction_paraphrase",
  "overview",
  "dominant_feature",
  "data_sentence",
  "comparison",
  "map_change",
  "process_stage",
  "process_endpoint",
  "unnecessary_conclusion",
  "fragment",
  "unknown"
]);

export const SENTENCE_ROLE_CLASSIFIER_VERSION = "deterministic-role-model-v12.7.0";

export function classifySentenceRole({
  taskType = "Task 2",
  visualType = "",
  paragraphRole = "",
  sentenceIndex = 0,
  sentenceCount = 1,
  sentence = "",
  previousSentence = "",
  nextSentence = "",
  prompt = ""
} = {}) {
  const text = String(sentence || "").trim();
  const role = String(paragraphRole || "");
  const finalSentence = sentenceIndex === Math.max(0, Number(sentenceCount || 1) - 1);
  if (!text) return roleResult("unknown", [], "low", ["empty"]);
  if (!COMPLETE_SENTENCE.test(text) && wordCount(text) < 6) {
    return roleResult("fragment", [], "high", ["short_unfinished_span"]);
  }

  if (String(taskType) === "Task 1") {
    return classifyTask1Role({ text, role, visualType, sentenceIndex, finalSentence });
  }

  if (/^Introduction$/i.test(role)) {
    const causes = CAUSE_ROUTE.test(text);
    const solutions = SOLUTION_ROUTE.test(text);
    const views = VIEW_ROUTE.test(text);
    const position = POSITION.test(text);
    const q1 = QUESTION_ONE.test(text);
    const q2 = QUESTION_TWO.test(text);
    if (causes && solutions) return roleResult("thesis_route", ["cause_route", "solution_route"], "high", ["cause_signal", "solution_signal"]);
    if (causes) return roleResult("cause_route", position ? ["position"] : [], "high", ["cause_signal"]);
    if (solutions) return roleResult("solution_route", position ? ["position"] : [], "high", ["solution_signal"]);
    if (views) return roleResult("view_route", position ? ["position"] : [], "high", ["view_signal"]);
    if (q1) return roleResult("answer_to_question_1", q2 ? ["answer_to_question_2"] : [], "medium", ["question_route_signal"]);
    if (q2) return roleResult("answer_to_question_2", [], "medium", ["question_route_signal"]);
    if (position) return roleResult("position", [], "high", ["position_signal"]);
    if (THESIS_META_ROUTE.test(text)) return roleResult("thesis_route", [], "high", ["declared_essay_route"]);
    if (sentenceIndex === 0) return roleResult("paraphrase", [], "medium", ["introduction_opening"]);
    return roleResult("background", [], "medium", ["introduction_context"]);
  }

  if (/^Conclusion$/i.test(role)) {
    if (sentenceIndex > 0 && introducesNewIdea(text)) {
      return roleResult("conclusion_new_idea", [], "high", ["new_idea_marker"]);
    }
    if (POSITION.test(text)) return roleResult("conclusion_position", [], "high", ["position_signal"]);
    return roleResult("conclusion_summary", [], "medium", ["conclusion_location"]);
  }

  if (/^Body Paragraph/i.test(role)) {
    if (sentenceIndex === 0) return roleResult("body_topic_sentence", routeSecondaries(text), "high", ["paragraph_opening"]);
    if (EXAMPLE_MARKER.test(text)) {
      const secondary = [];
      if (CAUSAL_MECHANISM.test(text)) secondary.push("causal_mechanism");
      if (RESULT.test(text)) secondary.push("result");
      return roleResult("example", secondary, "high", ["example_marker"]);
    }
    if (finalSentence && LINK_BACK.test(text)) return roleResult("link_back", [], "high", ["back_reference", "route_reference"]);
    if (finalSentence && !introducesNewIdea(text)) {
      const secondary = RESULT.test(text) ? ["result"] : [];
      return roleResult("paragraph_closure", secondary, "medium", ["paragraph_final_position"]);
    }
    if (CAUSAL_MECHANISM.test(text)) {
      const secondary = [];
      if (RESULT.test(text)) secondary.push("result");
      if (CONSEQUENCE.test(text)) secondary.push("consequence");
      return roleResult("causal_mechanism", secondary, "high", ["causal_link"]);
    }
    if (RESULT.test(text)) return roleResult(CONSEQUENCE.test(text) ? "consequence" : "result", [], "medium", ["result_marker"]);
    if (DATA.test(text)) return roleResult("evidence", [], "medium", ["data_signal"]);
    return roleResult("explanation", routeSecondaries(text), "medium", ["body_support"]);
  }

  if (CONCLUSION_MARKER.test(text)) return roleResult("conclusion_summary", [], "medium", ["conclusion_marker"]);
  if (OVERVIEW_MARKER.test(text)) return roleResult("overview", [], "medium", ["overview_marker"]);
  return roleResult("unknown", [], "low", ["no_controlled_rule"]);
}

function classifyTask1Role({ text, role, visualType, sentenceIndex, finalSentence }) {
  if (/^Introduction$/i.test(role)) return roleResult("introduction_paraphrase", [], "high", ["task1_introduction"]);
  if (/^Overview$/i.test(role) || OVERVIEW_MARKER.test(text)) {
    return roleResult("overview", DATA.test(text) ? ["dominant_feature"] : [], "high", ["task1_overview"]);
  }
  if (/^Task 1 Conclusion$/i.test(role)) return roleResult("unnecessary_conclusion", [], "high", ["task1_conclusion"]);
  if (/^Body Paragraph/i.test(role)) {
    if (/map|plan/i.test(visualType) && MAP_CHANGE.test(text)) return roleResult("map_change", [], "high", ["map_change_verb"]);
    if (/process|cycle|diagram|mechanism/i.test(visualType) && PROCESS_ENDPOINT.test(text)) return roleResult("process_endpoint", [], "high", ["process_endpoint_signal"]);
    if (/process|cycle|diagram|mechanism/i.test(visualType) && PROCESS_STAGE.test(text)) return roleResult("process_stage", [], "high", ["process_sequence_signal"]);
    if (COMPARISON.test(text)) return roleResult("comparison", DATA.test(text) ? ["data_sentence"] : [], "high", ["comparison_signal"]);
    if (DATA.test(text)) return roleResult("data_sentence", [], "high", ["data_signal"]);
    if (sentenceIndex === 0) return roleResult("body_topic_sentence", [], "medium", ["task1_body_opening"]);
    if (finalSentence) return roleResult("paragraph_closure", [], "low", ["task1_body_final"]);
    return roleResult("evidence", [], "low", ["task1_detail"]);
  }
  return roleResult("unknown", [], "low", ["no_controlled_rule"]);
}

function routeSecondaries(text) {
  const roles = [];
  if (CAUSE_ROUTE.test(text)) roles.push("cause_route");
  if (SOLUTION_ROUTE.test(text)) roles.push("solution_route");
  if (VIEW_ROUTE.test(text)) roles.push("view_route");
  return roles;
}

function roleResult(primaryRole, secondaryRoles, confidence, signals) {
  return {
    primaryRole,
    secondaryRoles: [...new Set((secondaryRoles || []).filter((role) => role && role !== primaryRole))],
    confidence,
    signals,
    classifierVersion: SENTENCE_ROLE_CLASSIFIER_VERSION
  };
}

function introducesNewIdea(text) {
  return /^(?:moreover|furthermore|in addition|another|a further)\b/i.test(String(text || "")) ||
    /\b(?:a new reason|another argument|should also)\b/i.test(String(text || ""));
}

function wordCount(value) {
  return String(value || "").match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.length || 0;
}
