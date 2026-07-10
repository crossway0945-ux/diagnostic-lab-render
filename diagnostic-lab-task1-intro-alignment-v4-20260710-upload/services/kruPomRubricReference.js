export function buildRubricReference(payload) {
  return payload.taskType === "Task 1" ? task1Reference() : task2Reference(payload);
}

function task1Reference() {
  return `
Kru Pom source rubric reference for Academic Task 1:
- Preferred structure is Introduction -> Overview -> Body paragraph(s). Do not reward a separate conclusion in Task 1.
- Do not tell students that Task 1 must always have exactly 4 paragraphs. A 5-paragraph report can be acceptable if each paragraph has a clear reporting function, though a controlled 4-paragraph structure is usually easier for IELTS Task 1.
- Introduction should answer What / Where or group / When / Unit where available.
- Overview is the most important paragraph. It should start safely with "Overall," and summarize the biggest visible patterns without raw numbers.
- A strong overview normally identifies highest/lowest, dominant pattern, biggest increase/decrease, stability/fluctuation, and important exceptions where relevant.
- Task Achievement is limited by missing overview, vague overview, inaccurate trends, missing key data, unsupported absolute claims, opinions, predictions, or interpretations.
- Body paragraphs should group data by meaningful logic, not list mechanically. Complete comparisons must include figures for all compared items when the prompt/data provides them.
- Tone must be objective: report facts, do not explain causes or give opinions such as "this is important" unless the visual itself states it.
- For past dates, tense control matters. Wrong tense across the report affects Grammatical Range & Accuracy.
- Band 7 Task Achievement requires a clear overview, clearly highlighted key features, and no inaccurate information. Band 6 may have an overview but some information may be inaccurate. Band 5 has no clear overview or inadequate/inaccurate key features.
`;
}

function task2Reference(payload) {
  const essayType = String(payload.essayType || "");
  return `
Kru Pom source rubric reference for Task 2:
- The essay must have a visible Golden Thread: prompt coverage -> thesis route -> Body 1 route -> Body 2 route -> conclusion.
- Introduction should paraphrase the task and give a thesis/roadmap that tells the examiner exactly what the body paragraphs will prove.
- Body paragraphs must follow the taught order: Topic Sentence -> Explain -> Example or evidence -> Link. Do not reward listing ideas without mechanism.
- Conclusion should restate the main route and reasons. It must not introduce a new major idea.
- LFC CPC must be checked: Link, Flow, Clear, Concise, Precise, Comprehensive.
- Task Response is capped when the essay does not answer all parts of the prompt, has a vague thesis, breaks the thesis promise, lacks explanation depth, or gives generic examples.
- Coherence & Cohesion is capped when body paragraphs do not match the thesis route, progression is unclear, paragraphing is weak, cohesive devices are mechanical, or link-back sentences are missing.
- Lexical Resource must reward precise academic wording and penalize vague wording, word salad, repeated broad nouns, inaccurate collocation, and spelling/word formation errors.
- Grammatical Range & Accuracy must check sentence control, tense, clause structure, punctuation, fragments, and whether errors reduce clarity.
${problemSolutionReference(essayType)}
`;
}

function problemSolutionReference(essayType) {
  if (!/problem|solution|cause/i.test(essayType)) return "";

  return `
Problem & Solution essay-specific rules from the lesson:
- First identify whether the question asks for causes + solutions, problems/consequences + solutions, or solutions only.
- For causes/problems + solutions: Body 1 should describe the causes/problems; Body 2 should describe solutions.
- The thesis should map both sides clearly. Safe formula: "The primary causes/problems of [issue] are [A] and [B]. To address these issues, the most effective solutions would be [X] and [Y]."
- Advanced formula: "While [problem] is largely caused by [A] and [B], it can be effectively tackled by [X] and [Y]."
- If the essay discusses only problems or only solutions when both are required, cap Task Response strongly.
- If solutions are named but not linked to the stated problems/causes, mark Body Paragraph Route Alignment and Task Response as weak.
- Conclusion should restate the main causes/problems and solutions, not add a new solution.
`;
}
