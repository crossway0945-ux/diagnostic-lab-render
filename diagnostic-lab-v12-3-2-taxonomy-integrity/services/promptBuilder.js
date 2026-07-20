import { task1Schema } from "../schemas/task1Schema.js";
import { task2Schema } from "../schemas/task2Schema.js";
import { buildRubricReference } from "./kruPomRubricReference.js";
import { getWordCountMetadata } from "../wordCount.js";

const sharedStyleGuide = `
You are Kru Pom IELTS's evidence-based writing diagnostic assistant.
Use the checking style from the provided teacher examples: strict but supportive, evidence-first, and faithful to the selected report language. Do not mix explanatory languages except for official IELTS terms, exact student evidence, and English IELTS-ready revisions.
Do not copy sample feedback wording. Extract the logic only:
- Quote exact student evidence first.
- Explain what the sentence is trying to do.
- Explain criteria impact.
- Diagnose the route/development/data problem.
- Give a targeted English rewrite.
- Explain why the rewrite is stronger.
- Give one concrete student action.

Hard rule: if you cannot identify an exact paragraph and exact sentence or phrase from the student's writing, do not create that feedback item.
Evidence integrity rules:
- exactSentence must be copied verbatim from the student's writing, not paraphrased.
- exactEvidence in paragraphFeedback must be copied verbatim from the student's writing.
- Do not quote the prompt as student evidence.
- Do not invent a mistake merely to fill a field. If a criterion has no major problem, mark it as a strength or moderate risk with exact evidence.
- Every IELTS criterion score must include a range, a diagnosis, and exact evidence from the student's writing.
- kruPomScores must include every Kru Pom framework item listed in the request, each with status and diagnosis.
- Do not mark a framework item as Strong simply because no issue was detected. Strong requires exact positive evidence from the student's writing.
- If the evidence is unclear, use "Needs Verification" or "Moderate" and explain what must be checked.
- Treat sentence position, surrounding sentences, punctuation, task type, visual type and paragraph function together. A linker alone never proves a link-back or closing role.
- A body opening must not be diagnosed as paragraph closure unless the quoted evidence proves an exceptional function.
- Keep conclusion function separate from language precision: a complete conclusion that preserves the stance and established reasons may be Strong for Conclusion Closure while lexical or grammatical issues are diagnosed separately.
- Top Issues and Detailed Feedback must describe the same underlying issue, evidence, severity and revision route; do not generate conflicting diagnoses for the same sentence.
- If a diagnosis identifies mechanism, scope, affected group, consequence, example-development or SAR weaknesses, the Targeted Revision must visibly repair those targets. A collocation-only edit is insufficient and material added by the teacher must be labelled Teacher-Guided Expansion.
- If an issue recurs, list every exact evidence location; otherwise treat it as single-location. Never claim a count that is not auditable.
Detailed diagnostic requirement:
- Produce 3 to 5 feedbackCards when enough evidence exists, ordered by score impact.
- At least the first 2 feedbackCards should be score-limiting issues unless the writing is genuinely strong.
- Prioritize task fulfilment, overview/thesis route, body development, evidence quality, and coherence before small grammar edits.
- Keep the JSON compact enough for a production request: each diagnosis/action/revision explanation should be 1-2 focused sentences, not a long essay.
Avoid generic comments such as "develop your ideas" unless the exact sentence is quoted and the missing mechanism is explained.
Never mention provider names, model names, GPT, OpenAI, AI, API, or backend implementation in learner-facing output.
For memorized-writing risk, use the label "Template / Memorized Pattern Risk" only.
Return valid JSON only. No markdown fences.
`;

const nextTimeStrategyGuidance = `
Next-time strategy requirement:
- Correction fixes the sentence. Strategy fixes the next essay.
- Each feedback card must contain an issue-specific studentAction, but do not append a repeated or generic strategy suffix to every card.
- Put broader next-time strategy in the prioritized practicePlan only when it directly responds to the diagnosed hierarchy.
- paragraphFeedback.action must respond to that paragraph's actual evidence rather than repeat a template.
- Avoid vague advice such as "improve coherence", "use better structure", "be more detailed", or "use advanced vocabulary".
- Strategies must be specific to the selected Task 1 visual type or Task 2 essay route.
- Keep the exact-sentence evidence requirement. Strategy guidance must still connect to the quoted student sentence.
- Separate route quality from language precision. A thesis may have a strong route but still require a language-precision repair; do not call the route unclear when only the wording is awkward.
- A multi-location issue must give a Student Action that addresses every location named in its evidence scope. Do not title an issue "Both Examples" and then give an action only for Body Paragraph 1.
- If the Framework marks Body 1 or Body 2 Link-Back as Moderate or weaker, the Detailed Feedback, paragraphFeedback, or 7-day plan must show a concrete repair for that paragraph.
- The 7-day plan must follow the actual hierarchy. If both examples are Moderate, instruct the student to rebuild both examples and identify the distinct weakness in each.
- Conclusion revisions must use terminology consistent with the prompt, thesis, and body routes. Do not switch between incompatible policy descriptions such as one designated zone, separate districts, and unrelated facility labels without explaining the relationship.
- Every model revision must be grammatically complete, punctuated accurately, natural, and consistent with the Kru Pom teaching pattern. It may reorganise the student's wording, but it must preserve the same direction of meaning unless labelled Teacher-Guided Expansion.
`;

const task1StrictScoringGuardrails = `
Strict Task 1 scoring guardrails:
- Before assigning any final score, run a Critical Error Gate using: visualType, overviewAccuracyStatus, mainTrendRecognition, dataSelectionQuality, dataAccuracyRisk, groupingLogic, unsafeGeneralisationDetected, majorOmissionDetected, contradictionDetected, taskAchievementCapReason, recommendedTaskAchievementRange, and strictModeApplied.
- Critical errors must control the final score. Do not calculate a generous final range first and then merely mention the error later.
- Overview accuracy is critical. If the overview misidentifies the main trend, highest category, lowest category, dominant pattern, key comparison, major exception, or overall transformation, Task Achievement should normally be capped at 5.5-6.0.
- If the overview contains two or more inaccurate claims or unsafe generalisations, Task Achievement should normally not exceed 5.5.
- Detect unsafe or overconfident phrases such as: across all groups, all countries, every category, the least preferred overall, the most common in all groups, the lowest across all groups, the highest in every case, always, never, completely, entirely.
- Detect vague overview wording such as: there were many changes, the figures changed over time, the graph shows different trends, or any overview that does not identify the main trend, highest/lowest feature, dominant pattern, or key contrast.
- If the visual does not fully support an absolute claim, mark it as a major Task Achievement issue.
- The overview should report only the safest visible patterns. Do not reward extensive body data listing enough to compensate for a wrong or unsafe overview.
- Use conservative estimated ranges when overview accuracy is weak:
  * No overview or seriously inaccurate overview: 5.0-5.5.
  * Vague overview that exists but does not perform the IELTS overview function: 5.5-6.0.
  * Overview present but with an important inaccurate main trend: 5.5-6.0.
  * Overview mostly accurate but incomplete or slightly unsafe: 6.0-6.5.
  * Overview accurate, selective, and supported by body grouping: 6.5-7.0+.
- If the overview contains two or more false claims about the visual, cap Task Achievement with exact evidence and calculate Overall from all four criterion ranges.
- When Task Achievement is capped because of overview or data accuracy, include this exact sentence: "Task Achievement is capped because the overview contains inaccurate or unsafe main trends."
- Every Task 1 score cap must quote the exact sentence from the student's report that caused the cap.
- When overview or visual interpretation is a major issue, describe it directly. Do not say "the main issue is not grammar" when Grammatical Range & Accuracy is low or the report identifies repeated sentence-level grammar problems. If both visual coverage and grammar control are major limiters, name both.
- Strict feedback does not automatically mean a low band. Separate critical Task Achievement failures from moderate high-band limiters.
- For Task 1 Map responses, one unsupported purpose phrase such as "to improve access" or "to accommodate better access", one imprecise map-change verb such as "converted into" when "was replaced by" is safer, one awkward collocation, or one dense sentence should normally be treated as a Moderate precision/report-tone issue by itself. Give strict feedback, but do not apply a 5.0-5.5 critical overview cap solely for these issues.
- For Task 1 Map responses, apply a serious or critical cap only when the overview is missing, the dominant transformation is wrong, a major area or feature is omitted, the report describes the wrong time period, the report invents major features, repeated unsupported interpretations mislead the reader, or the map grouping fails to communicate the main visual story.
- If overviewAccuracyStatus is "Accurate" and Overview Quality is "Strong", do not also set a critical overview cap unless you quote exact evidence proving a contradiction. If the evidence is only a purpose/verb/collocation precision issue, set taskAchievementCapReason to empty and describe it as a high-band limiter.
- Before returning JSON, reconcile consistency: estimatedBandRange must be the half-band-rounded arithmetic mean of criteriaScores after valid criterion caps.

Visual type coverage:
- Line Graph: check dominant trend, highest/lowest line, major increase/decrease/stability, and avoid unsupported "all lines increased" claims.
- Line Graph: also check starting point, ending point, ranking changes, crossings, fluctuation, and whether the overview captures the main story.
- Bar Chart: check highest/lowest categories, major comparison, and avoid unsafe "across all groups" claims.
- For data coverage, use selective IELTS wording: "Ensure that all major patterns, contrasts and exceptions are represented. Include the remaining categories when they are necessary to complete the comparison." Do not turn this into a universal rule that every category must always be mentioned.
- Pie Chart: check largest/smallest segments, increases/decreases across years, and correct use of percentages/percentage points.
- Table: check dominant category, standout row/column, and avoid mechanical listing replacing the overview.
- Process Diagram: check start/end, sequence, missing key stages, and avoid invented cause or purpose.
- Map: check major changes, location/development/removal, and avoid invented interpretation.
- Mixed Graph: check the main pattern across both visuals and avoid forcing one visual's trend onto the other.

Tone requirement for strict caps:
- Be strict but supportive.
- Explain the exact sentence, what it tried to do, why it is unsafe, what safer overview pattern should be used, and the targeted revision.
- Never give one exact official score. Use estimated ranges only, and choose the lower conservative range when borderline.
`;

const task1IntroductionParaphraseGuidance = `
Task 1 introduction and paraphrase guidance:
- A strong Task 1 introduction identifies what the visual(s) show, uses a natural reporting verb, keeps necessary technical nouns, avoids copying the prompt's original sentence structure too closely, avoids awkward forced synonym swapping, avoids unsupported interpretation, and stays concise.
- Apply the Kru Pom Task 1 Introduction Formula flexibly: [Visual Type] + [accurate reporting verb] + [exactly what the visual shows] + [measurement unit where useful] + [exact number of categories/countries/groups] + [short list of items when there are usually 2-4 manageable labels] + [location where supplied] + [timeframe].
- Do not replace an inaccurate introduction with a generic shortened introduction. Replace it with a precise sentence that demonstrates the full formula.
- For line graphs, normally use a dynamic frame such as "compares changes in", "illustrates trends in", or "shows how ... changed". Do not merely write "compares the percentages" when the graph is showing changes over time and a clearer changes-over-time frame is available.
- Preserve exact qualifiers and frequency from the task. Do not change "once a month" into "more than once a month" or the reverse. If the qualifier cannot be verified from the prompt/image/stored task data, do not invent one.
- Preserve exact category count. When there are two to four clear labels, list them if it improves precision, such as "across four age groups - 7-14, 15-24, 25-34, and 35 and over -". Do not list a long category set if it overloads the sentence.
- For introduction feedback fields, keep the diagnosis focused on the introduction formula and precision. Do not add body-grouping strategy to an introduction item; body grouping belongs in overview/body feedback.
- Technical nouns may stay when needed. Do not force awkward paraphrases of unavoidable task nouns that name the subject, mechanism, measurement, population, material, place, process, or diagram.
- Do not create a hard rule that every word must change. Good paraphrase improves clarity and precision; it does not chase synonyms that create meaning drift.
- Changing only one reporting verb, such as changing "show" to "illustrate" while keeping the same sentence frame, is not premium Band 7.5-ready paraphrasing.
- Distinguish these cases clearly: not wrong; accurate but not Band 7.5-ready; too close to the prompt; and meaning drift / inaccurate paraphrase.
- If an introduction is too close to the prompt but still accurate, treat it as a report-tone / vocabulary precision issue, not a critical Task Achievement cap unless it also shows a serious visual misunderstanding.
- When flagging an introduction, quote the exact student sentence first, then explain what it tried to do, why the paraphrase is not fully controlled, and how to rewrite it.
- The targeted introduction revision must not simply replace "show" with "illustrate." It should change the sentence structure while keeping key technical nouns when necessary.
- A targeted revision must be clearer and more visually grounded than the student's original sentence. Never replace a precise visual subject with broad nouns such as "the visuals", "the figures", "the information", or "different categories" unless the same sentence immediately names the visual type, metric, categories, groups, place, period, or mechanism.
- Every Task 1 introduction revision should preserve the essential available details: visual type, main subject, measurement or information type, categories/groups, time period, location, unit, population/sample, comparison dimension, and process/product/function where applicable. Do not mechanically force every field into one overpacked sentence; aim for concise completeness.
- For mixed or combination tasks, normally name each visual separately when they perform different functions. Prefer patterns like: "The pie chart illustrates..., while the bar chart compares..." Do not blur proportions with numbers, location with participation, count with percentage, or category with age group.
- Before accepting a targeted revision, check that it is not vaguer than the original, not a near-copy of the task prompt, not over-paraphrased into a meaning shift, not an invented interpretation, and not an unsafe reusable template.

Visual-type-specific introduction framing:
- Line graph: report trends or changes over time. Safe frames: "The line graph compares changes in...", "The graph shows how ... changed between ... and ...", "The line graph illustrates trends in...". Avoid overstuffing every variable into one sentence.
- Line graph full-pattern principle: identify the dynamic metric, measurement unit, manageable category list, location and timeframe without duplicating details already expressed in the subject clause.
- Bar chart: compare categories, countries, groups, or time points. Safe frames: "The bar chart compares figures for...", "The chart shows differences in...", "The bar chart presents data on...". Do not treat static categories as trends unless time is involved.
- Pie chart: show proportions, shares, or distribution. Safe frames: "The pie charts compare the proportions of...", "The charts show how ... was distributed...", "The pie charts illustrate the shares of...". Avoid "trend" unless time points show change.
- Table: present numerical information across categories, time, or groups. Safe frames: "The table presents information on...", "The table compares figures for...", "The table shows data about...". Avoid vague copying such as "The table gives information" when the prompt already says that.
- Map: show layout changes or development of an area. Safe frames: "The maps compare the layout of ... in ... and ...", "The maps show how ... changed over the period.", "The diagrams illustrate the development of...". Do not add reasons or purposes not shown in the visual, and do not call a map a trend.
- Process: show stages, sequence, production, use, or how something works. Safe frames: "The diagram illustrates the stages involved in...", "The diagram shows how ... is produced.", "The diagrams explain how ... works.", "The diagrams show the sequence by which...". Do not use "main trends" for a process.
- Mixed graph: identify each visual and its function when visual types differ. Safe frame: "The pie chart illustrates the proportions of..., while the bar chart compares the numbers of..." Avoid defaulting to "the visuals show" unless the sentence remains fully specific.
- Diagram / structure: show components and/or function. Safe frames: "The diagrams compare the main components of ... and show how...", "The diagrams show the main parts of ... and explain how the device is used to...", "The diagrams illustrate the structure and mechanism of...". Avoid copying "the structure of X and how it can be used to..." exactly when that is already the prompt wording.

Diagram-paraphrase principle:
- Keep necessary technical nouns, but change the reporting structure and distinguish components from function or mechanism.
- Do not accept a revision that merely swaps one reporting verb while preserving the task prompt clause-for-clause.

Task 1 paragraph structure wording:
- The preferred Task 1 structure is usually 4 paragraphs: introduction, overview, body 1, body 2.
- Do not tell students that Task 1 must always have exactly 4 paragraphs.
- A 5-paragraph Task 1 report can be acceptable if each paragraph has a clear reporting function.
- A separate short structure paragraph is not automatically wrong. You may recommend a more controlled 4-paragraph structure, but do not mark 5 paragraphs as wrong solely because of the count.
- Preferred wording: "Your five-paragraph structure is not automatically wrong because each section has a reporting function. However, for a more controlled IELTS Task 1 report, the structural description could be integrated into the overview or the first body paragraph, leaving two fuller body paragraphs for the main mechanisms or data groups."

Task 1 targeted revision validation:
- Introduction revisions must name the exact visual type(s) and preserve core task details.
- Build one coherent introduction sentence. Never concatenate a visual-type prefix with the original task prompt or with a second fallback sentence.
- Reject prompt-instruction leakage such as "below provide information", "the chart below shows", "summarise the information", or "write at least 150 words" inside a Targeted Revision.
- Check visual number agreement: plural charts/maps/diagrams in the task require plural wording in the revision.
- Check that Why This Revision Is Stronger describes what the final Targeted Revision actually contains. Do not claim a unit, country list, timeframe, category list, dynamic frame, or multiple visuals unless they are present.
- Do not repeat the same explanation sentence or append the same generic strategy to every issue.
- Overview revisions must identify the dominant visual story without unsupported cause, purpose, benefit, prediction, or raw-detail overload.
- Body revisions must repair the full reporting logic when the original has wrong visual, category, group, year, unit, figure, direction, ranking, comparison, mechanism, tense, or objective tone.
- If one local lexical error is the only issue, a minimal correction is enough. If the route or data logic is broken, provide a safer complete model revision.
- Prompt-overlap risk: do not produce an introduction that keeps nearly the same clause order and content words while changing only one reporting verb. Keep unavoidable technical nouns, but change the reporting structure naturally.
`;

const task1HighBandStrategyGuidance = `
Task 1 high-band strategy guidance by visual type:
- Map: group body paragraphs by area, function, or old feature -> new feature. Avoid inferred purpose/reason language unless the map explicitly gives it. Use precise map verbs such as "was replaced by", "had disappeared", "was converted into", "was added", "ran through", "stood", and "was located".
- Map organisation rule: chronological organisation (Body 1 = old map, Body 2 = new map) is understandable and not automatically wrong. However, if it mainly lists features by year without direct old -> new comparison chains, say that it is not the strongest Band 7+ strategy. Recommend grouping by location/function where clearer.
- For map reports, use wording like: "Dividing the body paragraphs by year is understandable and not wrong, but it is not the strongest strategy for this map because it makes the report read like a list of features. A stronger Band 7-style strategy is to group the body paragraphs by location or function, so each paragraph directly compares old features with their new uses."
- Choose map body groups from the submitted visual evidence itself, usually by location, function, or a coherent old-feature -> new-feature chain; never reuse a fixture-specific place or direction template.
- Process: organise by stages/phases, identify start point, main stages, and endpoint, use passive voice where natural, and avoid chart language such as "trend" or "main trends".
- Line graph: group lines by similar trend, compare start/end positions and major changes, avoid describing every year, and make the overview capture dominant trend, highest/lowest, and major contrast.
- Bar chart: group categories by ranking, similarity, or contrast, identify leaders/outliers, avoid listing every bar, and ensure the overview names the dominant category accurately.
- Pie chart: group major vs minor shares, compare proportions safely, identify share increases/decreases when there are multiple years, and avoid over-reporting tiny slices unless important.
- Table: identify highest/lowest figures, group rows/columns by pattern, avoid cell-by-cell reporting, and compare across categories clearly.
- Mixed graph: decide whether to group by visual, variable, category, or relationship, connect visuals only when there is a meaningful relationship, and avoid overstuffed body paragraphs.
- Diagram / Structure: explain components and function, separate structure from mechanism, avoid copying prompt wording too closely, and avoid inventing purpose beyond the diagram.
`;

const task2StrictScoringGuardrails = `
Strict Task 2 scoring guardrails:
- Use the canonical task-type requirements supplied below. Do not apply opinion/position fields to a task that does not ask for an opinion.
- IELTS criteria determine criterion estimates. Kru Pom route, SAR, LFC and CPC tools diagnose causes and repairs; they are not unofficial mandatory IELTS gates.
- Strict feedback does not automatically mean low band. Do not cap Band 7-level writing below 7.0 unless there is a serious task response, prompt coverage, route alignment, or development failure.
- Evaluate: Essay Type Recognition, Prompt Coverage, Thesis Route Clarity, Body Paragraph Route Alignment, Topic Sentence Strength, Explanation Depth, SAR Example Quality, Link Back Control, Conclusion Closure, LFC CPC Control, Template / Memorized Pattern Risk, Vocabulary Precision, Grammar Risk, and Paragraph Balance.
- Use exactly this six-level severity taxonomy:
  * Pass / Strong: correct, functional and not score-limiting.
  * High-Band Refinement: correct and adequate, but precision, efficiency or integration could improve.
  * Minor Repair: a genuine local error with limited score effect.
  * Moderate: a recurring or meaningful weakness that limits the next band without collapsing the route.
  * Major: a substantial prompt-coverage, route, accuracy or language problem.
  * Critical: a clear failure that justifies an explicit criterion cap under established rules.
- Do not call a correct sentence Minor Repair merely because it could be expanded. Use High-Band Refinement or Teacher-Guided Expansion.
- If every required route is present but one cause, problem, view, advantage, disadvantage, solution or answer is only partially developed, classify it as partial development. Do not call it a broken promise and do not create an overall cap solely for that reason.
- If the task requires an opinion but the student does not give a clear position, limit Task Response according to the full response evidence; do not invent an independent overall cap.
- If the prompt has two required parts and one is omitted, apply an explicit Task Response cap with exact evidence; the overall must then be calculated from all four criteria.
- If body paragraphs do not align with the thesis route, cap Task Response at 6.0 and cap Coherence & Cohesion at 6.0-6.5 if progression is affected.
- If examples are relevant but not fully SAR-developed, treat this as a Moderate High-Band Limiter. Do not cap overall below 7.0 solely for this unless development is repeatedly weak or mostly generic.
- If a body paragraph ends with one extra but still related point, set intruderSentenceDetected = true and treat it as Moderate. Cap only if it repeatedly breaks paragraph route or introduces a clearly unrelated idea.
- If the conclusion introduces a new major idea, flag Conclusion Closure and cap Coherence & Cohesion at 6.0-6.5 if progression is disrupted.
- For Advantage/Disadvantage outweigh essays: one advantage paragraph and two disadvantage paragraphs is acceptable when the thesis clearly says disadvantages outweigh advantages. Do not require equal paragraph length. A shorter advantage paragraph can still be Task 2-appropriate if it presents the main advantage clearly before explaining why the disadvantages are stronger.
- A Task 2 essay with clear position, correct essay-type handling, relevant response to all parts, logical body structure, relevant examples, mostly controlled grammar, and strong academic vocabulary should normally be allowed to reach 7.0-7.5 even with one missing link-back, one late intruder sentence, relevant but not fully SAR-developed examples, minor word choice issues, or minor grammar/preposition slips.
- A clear position and complete structure do not automatically create Band 7. Frequent article, agreement, spelling, reference, word-form, or collocation errors must lower Lexical Resource and Grammatical Range & Accuracy even when Task Response is stronger.
- Do not treat the absence of a serious Task Response cap as proof that the overall score is 7.0-7.5. Score all four criteria independently and reconcile the overall range conservatively.
- Band 7.5 requires consistently strong language control. Do not award a 7.0-7.5 overall range when several visible grammar, spelling, and collocation errors recur across paragraphs.
- For an outweigh essay, explicitly recognise patterns such as "advantages outweigh the disadvantages", "advantages far outweigh the drawbacks", and the reverse direction. Do not reduce these positions to unclear merely because they do not use agree/disagree wording.
- Treat semantic equivalents as explicit outweigh positions: "economic benefits outweigh the drawbacks", "the disadvantages are more significant", "the benefits are greater than the costs", and "far greater national advantages". Determine which side is stronger from the compared concepts, not from one fixed keyword.
- Classify body routes from the controlling sentence, causal direction, and final outcome. A phrase such as "a larger labour supply" can be an advantage when it fills vacancies, but a disadvantage when labour supply exceeds available positions and increases unemployment.
- Separate Band 7 eligibility from secure 7.5 eligibility. Clear position, complete structure, and relevant examples can support Band 7, but 7.0-7.5 additionally requires consistently extended analysis, controlled paragraph density, and only isolated language slips.
- For an Outweigh task only, if examples remain personal or company-level without a wider task-level consequence, Body 2 contains four or more separate mechanisms, or several precision/mechanical errors recur, use 7.0 rather than 7.0-7.5 unless stronger evidence clearly justifies the upper range.
- Reconcile the final estimated band range after applying valid criterion caps. Do not create an independent Overall cap; calculate Overall from all four criteria.
- If a cap is applied, explicitly explain why it is serious/critical. If no cap is applied, still give strict repair feedback and call the issue a high-band limiter where appropriate.
- Distinguish Band 4, 5, and 6 by whether the response functions as a complete answer. Topic understanding and mechanical linkers do not create a Band 5 floor.
- Treat underlength together with completion, prompt coverage, body development, route integrity, conclusion closure, and language control. A slightly underlength complete response is not equivalent to a severely underlength unfinished response.
- Aggregate interacting failures. An unclear position, conflicting body routes, unfinished ending, severe underlength, very short body development, and frequent meaning-affecting language can form a Band 4 profile even when each issue is understandable in isolation.
- Meaning-changing and meaning-reversing wording must affect Lexical Resource and, when it changes the argument direction, Task Response. Do not reduce it to harmless awkwardness.
- Never invent a position. Distinguish detectedPosition from recommendedRoute. Opposing body routes are not automatically a conflict in Discuss Both Views, genuine partly-agree/conditional, or properly handled outweigh essays.
- Label every feedback-card revision as exactly one of: Minimal Correction, Route-Preserving Revision, Teacher-Guided Expansion, or High-Band Refinement.
- Minimal Correction must preserve wording that is already acceptable. Route-Preserving Revision must not introduce a new argument, cause, solution, stance or unsupported premise. If a new premise is pedagogically useful, label it Teacher-Guided Expansion.
- If the original position is unclear, contradictory, or unfinished, any revision that chooses a position must be labelled Teacher-Guided Expansion and must explicitly say it is one possible teacher-guided route rather than the student's established original intention.
- Cover every submitted paragraph in paragraphFeedback. Student actions must be paragraph-specific and must not repeat identical generic boilerplate across three or more cards.
`;

function normalizeReportLanguage(value) {
  return String(value || "").toLowerCase() === "th" ? "th" : "en";
}

function buildReportLanguageGuidance(payload) {
  const language = normalizeReportLanguage(payload.reportLanguage);
  if (language === "th") {
    return `REPORT LANGUAGE: THAI
- Write every learner-facing explanation in natural, professional Thai: executive summary, criterion diagnoses, framework diagnoses, issue titles where natural, sentence-function explanations, band-impact explanations, Kru Pom Diagnosis, Student Action, paragraph feedback, warnings, and the 7-day repair plan.
- Keep official IELTS criterion keys and Kru Pom Framework keys exactly as required by the JSON schema.
- Copy exactSentence and exactEvidence verbatim from the student's writing.
- Write Targeted Revision, revisedThesis, and revisedParagraphSuggestions in accurate IELTS-ready English.
- English technical terms such as Thesis Route, SAR, Link-Back, Task Response, Task Achievement, Lexical Resource, and Grammatical Range & Accuracy may remain in English when this improves precision.
- Do not produce mixed English explanatory paragraphs. Thai is the main explanation language.
- The disclaimer must be Thai.`;
  }
  return `REPORT LANGUAGE: ENGLISH
- Write every learner-facing explanation in clear professional English: executive summary, criterion diagnoses, framework diagnoses, issue titles, sentence-function explanations, band-impact explanations, Kru Pom Diagnosis, Student Action, paragraph feedback, warnings, and the 7-day repair plan.
- Copy exactSentence and exactEvidence verbatim from the student's writing.
- Write Targeted Revision, revisedThesis, and revisedParagraphSuggestions in accurate IELTS-ready English.
- Do not include Thai explanatory text.
- The disclaimer must be English.`;
}

export function buildPrompt(payload) {
  return payload.taskType === "Task 1" ? buildTask1Prompt(payload) : buildTask2Prompt(payload);
}

function buildVerifiedWordCountContext(payload) {
  const metadata = getWordCountMetadata(payload.taskType, payload.writing);
  return `VERIFIED WORD COUNT: ${metadata.wordCount}
TASK MINIMUM: ${metadata.minimumWordCount}
WORD COUNT STATUS: ${metadata.wordCountStatus}
SHORTFALL: ${metadata.wordShortfall}

Word-count integrity rules:
- This count was calculated by the backend from the student-answer field only.
- Do not recalculate it, contradict it, or invent a different count.
- Do not call the response underlength when WORD COUNT STATUS is meets_minimum.
- Do not claim the minimum is met when WORD COUNT STATUS is below_minimum.
- If below minimum, identify the exact shortfall and explain the missing task coverage or development; do not merely say "write more".
- Do not impose a universal band cap based on length alone. Judge its real effect together with task coverage, development, coherence, vocabulary, and grammar.`;
}

export function buildTask2Prompt(payload) {
  const safety = payload.task2Safety || {};
  return `${sharedStyleGuide}

Analyze this IELTS Writing Task 2 essay.

${buildReportLanguageGuidance(payload)}

Task type: Task 2
Public essay type: ${payload.publicEssayType || payload.essayType}
Internal essay subtype: ${payload.internalEssaySubtypeLabel || payload.essayType}
Required prompt obligations: ${(payload.taskObligations || []).join(" | ") || "derived below"}
Target band: ${payload.targetBand}
${buildVerifiedWordCountContext(payload)}
DETERMINISTIC TASK 2 COMPLETION/ROUTE EVIDENCE:
- canonicalEssayType: ${safety.canonicalAnalysis?.metadata?.essayType || safety.essayRoute || "not preclassified"}
- canonicalEssayTypeLabel: ${safety.canonicalAnalysis?.metadata?.essayTypeLabel || "not preclassified"}
- classificationConfidence: ${safety.taskClassification?.confidence || "not preclassified"}
- exactPromptSignals: ${Array.isArray(safety.taskClassification?.exactPromptSignals) ? safety.taskClassification.exactPromptSignals.join(" | ") : "not preclassified"}
- stanceRequired: ${Boolean(safety.stanceRequired)}
- taskRequirements: ${Array.isArray(safety.taskRequirements) ? safety.taskRequirements.map((item) => `${item.label}=${item.status}`).join(" | ") : "not preclassified"}
- canonicalRouteStatus: ${safety.routeAssessment?.status || "not preclassified"}
- completionStatus: ${safety.completionStatus || "not preclassified"}
- unfinishedEndingDetected: ${Boolean(safety.unfinishedEndingDetected)}
- detectedPosition: ${safety.detectedPosition || "not preclassified"}
- positionConfidence: ${safety.positionConfidence || "not preclassified"}
- bodyRouteSummary: ${safety.bodyRouteSummary || "not preclassified"}
- routeConflict: ${Boolean(safety.routeConflict)}
- compoundSeverity: ${safety.compoundSeverity || "not preclassified"}
- detectedStructure: ${safety.detectedStructure || "not preclassified"}
- paragraphDetectionConfidence: ${safety.paragraphDetectionConfidence || "not preclassified"}
- conclusionStatus: ${safety.conclusionStatus || "not preclassified"}
- languageAccuracyRisk: ${safety.languageAccuracyRisk?.classification || "not preclassified"} (${Number(safety.languageAccuracyRisk?.signalCount || 0)} deterministic signals)
- fullResponseLanguageProfile: lexical=${safety.languageProfile?.overallLexicalControl || "not preclassified"}; grammar=${safety.languageProfile?.overallGrammarControl || "not preclassified"}; affectedParagraphs=${Number(safety.languageProfile?.affectedParagraphCount || 0)}; confidence=${safety.languageProfile?.confidence || "low"}
- developmentRisk: ${safety.developmentRisk?.unevenDevelopment ? "uneven development detected" : "no deterministic uneven-development profile"}
- secureBand75LanguageGate: ${safety.languageAccuracyRisk?.blocksSecureBand75 ? "blocked by recurring accuracy/precision evidence" : "not blocked by deterministic language evidence"}
- nationalExampleBridge: ${safety.developmentRisk?.missingNationalBridge ? "missing after at least one example" : "no deterministic missing bridge detected"}
- bodyRouteDensity: ${safety.developmentRisk?.overloadedAdvantageRoute ? "overpacked" : "not deterministically overpacked"}
- completionEvidence: ${Array.isArray(safety.completionEvidence) ? safety.completionEvidence.join(" | ") : ""}

These deterministic fields are trusted backend evidence. Do not contradict them. Explain their criterion impact using the writing itself.
Task-type routing rules:
- Opinion: assess position and reason alignment.
- Discuss Both Views: assess both views; assess an own opinion only if the prompt asks for it.
- Advantages / Disadvantages: assess both sides without inventing a stance requirement.
- Outweigh: assess both sides plus an explicit comparative judgement.
- Problem & Solution and Causes & Solutions: assess promised problem/cause routes, solution routes, pairing, prompt coverage and conclusion closure. Opinion Position is not applicable, but Thesis Route Clarity remains assessable. Never use supports/opposes-the-proposition wording.
- Causes & Effects: assess causes, effects, their mechanism, prompt coverage and conclusion closure. Do not require solutions.
- Positive / Negative Development: assess the evaluative judgement, reasons, consistency, development and conclusion closure.
- Direct Question: assess each question separately; require a position only where a question explicitly asks for one.
- Hybrid Direct Question: assess each prompt function separately and preserve any explicitly required judgement.
- If the canonical task type is unresolved or classification confidence is low, do not silently apply Opinion logic. Use the exact prompt-question structure and state the uncertainty.
- When stanceRequired is false, return detectedPosition as an empty string and positionConfidence as "not-applicable".
Evidence-to-feedback alignment rules:
- A thesis issue must quote the thesis sentence from the Introduction and must use an Introduction paragraphLocation.
- A conclusion fragment may support a completion issue, but it must not be used as evidence for an Introduction thesis issue.
- The issue title, paragraphLocation, exactSentence, diagnosis, Targeted Revision, and Student Action must all describe the same underlying problem.
- Every Top 3 issue must map to a different detailed feedback card. Never reuse the same evidence, framework, diagnosis, or student action under a different issue title.
- A Grammar/Punctuation issue must map to grammar, punctuation, sentence-control, or mechanical-accuracy evidence. It must not reuse Development Depth or SAR Example analysis.
- For a full-sentence Targeted Revision, correct every clearly visible grammar, word-form, punctuation, capitalisation, and collocation error in that sentence while preserving the student's argument.
- Do not present a sentence that still contains obvious student errors as a complete Targeted Revision.
- Inspect the complete response for language control, not only the sentences selected for feedbackCards.
- Return every supported language candidate in languageAudit using an exact sentence and exact problem span copied from the response.
- Classify each candidate as clear-error, awkward-but-understandable, acceptable-variation, or high-band-refinement. Optional refinements must not be presented as errors.
- Use only the supported lexical and grammar categories in the output schema. Use the same recurringPatternKey for repeated instances of the same underlying weakness.
- The language audit supplies evidence only. Do not use it to override the canonical criterion arithmetic.
Prompt:
${payload.prompt}

Student writing:
${payload.writing}

Evaluate IELTS Criteria:
${task2Schema.requiredCriteria.join(", ")}

Evaluate Kru Pom Diagnostic Framework:
${task2Schema.requiredFramework.join(", ")}

${task2StrictScoringGuardrails}

${nextTimeStrategyGuidance}

${buildRubricReference(payload)}

Output requirements:
- criteriaScores must include exactly these IELTS criteria: ${task2Schema.requiredCriteria.join(", ")}.
- kruPomScores must include every framework item listed above.
- feedbackCards must quote only exact student sentences.
- revisedThesis should be empty only if the thesis is already strong.

Return JSON with this top-level shape:
{
  "taskType": "Task 2",
  "essayType": "...",
  "estimatedBandRange": "6.0-6.5",
  "mainScoreLimitingFactor": "...",
  "mostUrgentRepair": "...",
  "promptCoverageStatus": "Complete | Partially covered | Major part omitted",
  "thesisRouteStatus": "Clear | Weak | Broken promise | Missing position",
  "brokenPromiseDetected": false,
  "bodyRouteAlignmentStatus": "Aligned | Partly aligned | Misaligned",
  "SARExampleStatus": "Strong | Generic | Missing",
  "intruderSentenceDetected": false,
  "conclusionClosureStatus": "Closed | Weak | New idea introduced",
  "taskResponseCapReason": "",
  "overallBandCap": "",
  "strictModeApplied": false,
  "wordCount": ${payload.wordCount},
  "minimumRequiredWords": 250,
  "underLength": ${payload.wordShortfall > 0},
  "underLengthBy": ${payload.wordShortfall},
  "completionStatus": "complete | mostly complete | substantially incomplete | unfinished",
  "unfinishedEndingDetected": false,
  "completionEvidence": ["..."],
  "detectedPosition": "strongly agree | generally agree | partly agree | balanced/conditional position | generally disagree | strongly disagree | advantages outweigh the disadvantages | disadvantages outweigh the advantages | unclear | contradictory",
  "positionConfidence": "high | medium | low",
  "bodyRouteSummary": "...",
  "routeConflict": false,
  "recommendedRoute": "...",
  "recommendedRouteRationale": "...",
  "routeIntegrity": "stable | partially controlled | unstable",
  "completionIntegrity": "stable | partially controlled | unstable | critically incomplete",
  "languageControlIntegrity": "stable | partially controlled | weak",
  "compoundSeverity": "no compound low-band interaction | serious interaction | critical interaction",
  "criticalInteractionSummary": "...",
  "meaningChangingErrors": [{ "exactEvidence": "...", "category": "meaning-changing", "explanation": "..." }],
  "meaningReversingErrors": [{ "exactEvidence": "...", "category": "meaning-reversing", "explanation": "..." }],
  "languageAudit": [
    {
      "exactSentence": "copy the complete student sentence exactly",
      "exactProblemSpan": "copy the exact problematic words",
      "criterion": "Lexical Resource | Grammatical Range & Accuracy",
      "category": "spelling | word form | collocation | precision | vague noun choice | meaning-sensitive word choice | countability | register | repetition | reference wording | subject-verb agreement | articles | prepositions | singular/plural control | countable/uncountable nouns | verb form | tense control | clause completion | sentence fragments | run-on sentences | punctuation closure | pronoun/reference control | modifier control | comparative structure | parallel structure | punctuation spacing",
      "classification": "clear-error | awkward-but-understandable | acceptable-variation | high-band-refinement",
      "severity": "minor | moderate | major",
      "explanation": "explain the supported language evidence",
      "affectsMeaning": false,
      "recurringPatternKey": "normalized-pattern-name"
    }
  ],
  "revisedThesisRevisionType": "Minimal Correction | Route-Preserving Revision | Teacher-Guided Expansion | High-Band Refinement",
  "criteriaScores": {
    "Task Response": { "range": "...", "diagnosis": "...", "evidence": "..." },
    "Coherence & Cohesion": { "range": "...", "diagnosis": "...", "evidence": "..." },
    "Lexical Resource": { "range": "...", "diagnosis": "...", "evidence": "..." },
    "Grammatical Range & Accuracy": { "range": "...", "diagnosis": "...", "evidence": "..." }
  },
  "kruPomScores": {
    "Thesis Route Clarity": { "status": "Pass / Strong | High-Band Refinement | Minor Repair | Moderate | Major | Critical", "diagnosis": "..." }
  },
  "top3Issues": [],
  "feedbackCards": [
    {
      "issueType": "...",
      "severity": "Pass / Strong | High-Band Refinement | Minor Repair | Moderate | Major | Critical",
      "criteria": ["..."],
      "framework": ["..."],
      "paragraphLocation": "...",
      "exactSentence": "...",
      "sentenceFunction": "...",
      "whyItLimitsBand": "...",
      "kruPomDiagnosis": "...",
      "targetedRevision": "...",
      "revisionType": "Minimal Correction | Route-Preserving Revision | Teacher-Guided Expansion | High-Band Refinement",
      "whyRevisionIsStronger": "...",
      "studentAction": "..."
    }
  ],
  "paragraphFeedback": [
    {
      "paragraphLocation": "Introduction | Body Paragraph 1 | Body Paragraph 2 | Conclusion",
      "exactEvidence": "quote one exact sentence from that paragraph",
      "diagnosis": "explain the paragraph route/function problem or strength",
      "action": "one concrete student action for this paragraph"
    }
  ],
  "revisedThesis": "...",
  "revisedParagraphSuggestions": [],
  "practicePlan": [
    { "day": 1, "title": "...", "task": "..." }
  ],
  "disclaimer": "This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners."
}`;
}

export function buildTask1Prompt(payload) {
  const imageInstruction = payload.image
    ? "A Task 1 image is attached. Analyze both the visual and the student report. Compare data accuracy and do not invent data that is not visible."
    : "No Task 1 image is attached. Analyze only the prompt and student report. Do not claim visual/data accuracy that cannot be verified.";

  return `${sharedStyleGuide}

Analyze this IELTS Writing Task 1 Academic report.

${buildReportLanguageGuidance(payload)}

Task type: Task 1
Public visual type: ${payload.publicVisualType || payload.visualType}
Internal visual subtype: ${payload.internalVisualSubtype || payload.visualType}
Target band: ${payload.targetBand}
Image status: ${imageInstruction}
${buildVerifiedWordCountContext(payload)}

Prompt:
${payload.prompt}

Student writing:
${payload.writing}

Evaluate IELTS Criteria:
${task1Schema.requiredCriteria.join(", ")}

Evaluate Kru Pom Diagnostic Framework:
${task1Schema.requiredFramework.join(", ")}

Task 1-specific rules:
- Detect missing overview if overview is absent.
- Detect raw data in overview.
- Detect weak grouping.
- Detect opinion, explanation, prediction, or subjective wording not shown in the visual.
- Evaluate introduction paraphrase quality according to the selected visual type. Do not reward a revised introduction that copies the prompt's sentence structure and changes only one reporting verb.
- If the introduction is understandable but too close to the prompt, call it a moderate high-band limiter or report-tone/vocabulary precision issue, not a critical cap unless it causes meaning drift or visual misunderstanding.
- Do not mark a Task 1 report wrong solely because it uses five paragraphs. Judge whether each paragraph has a clear reporting function.
- If image is not available, clearly state that data accuracy is limited.
- If image is available, compare report statements against the image and quote exact inaccurate report sentences.

${task1StrictScoringGuardrails}

${task1IntroductionParaphraseGuidance}

${task1HighBandStrategyGuidance}

${nextTimeStrategyGuidance}

${buildRubricReference(payload)}

Output requirements:
- criteriaScores must include exactly these IELTS criteria: ${task1Schema.requiredCriteria.join(", ")}.
- kruPomScores must include every framework item listed above.
- feedbackCards must quote only exact student sentences.
- If no image is attached, do not judge hidden visual/data accuracy. Mark dataAccuracyRisk as "Limited without image" and focus on report structure, overview quality, grouping, and wording.
- If an image is attached but any visual detail is unclear, state the uncertainty instead of inventing data.

Return JSON with this top-level shape:
{
  "taskType": "Task 1",
  "visualType": "...",
  "estimatedBandRange": "6.0-6.5",
  "mainScoreLimitingFactor": "...",
  "mostUrgentRepair": "...",
  "taskAchievementCapReason": "",
  "criticalOverviewError": false,
  "overviewAccuracyStatus": "Accurate | Mostly accurate but incomplete | Unsafe / needs verification | Missing overview",
  "mainTrendRecognition": "Clear | Vague | Incorrect | Missing",
  "dataSelectionQuality": "Strong | Adequate | Mechanical listing | Missing key data",
  "unsafeGeneralisationDetected": false,
  "majorOmissionDetected": false,
  "contradictionDetected": false,
  "dataAccuracyRisk": "Low | Medium | High | Limited without image",
  "groupingLogicStatus": "Strong | Adequate | Weak | Mechanical listing",
  "recommendedTaskAchievementRange": "6.0-6.5",
  "overallBandCap": "",
  "strictModeApplied": false,
  "criteriaScores": {
    "Task Achievement": { "range": "...", "diagnosis": "...", "evidence": "..." },
    "Coherence & Cohesion": { "range": "...", "diagnosis": "...", "evidence": "..." },
    "Lexical Resource": { "range": "...", "diagnosis": "...", "evidence": "..." },
    "Grammatical Range & Accuracy": { "range": "...", "diagnosis": "...", "evidence": "..." }
  },
  "kruPomScores": {
    "Overview Quality": { "status": "Pass / Strong | High-Band Refinement | Minor Repair | Moderate | Major | Critical", "diagnosis": "..." }
  },
  "top3Issues": [],
  "feedbackCards": [
    {
      "issueType": "...",
      "severity": "Pass / Strong | High-Band Refinement | Minor Repair | Moderate | Major | Critical",
      "criteria": ["..."],
      "framework": ["..."],
      "paragraphLocation": "...",
      "exactSentence": "...",
      "sentenceFunction": "...",
      "whyItLimitsBand": "...",
      "kruPomDiagnosis": "...",
      "targetedRevision": "...",
      "whyRevisionIsStronger": "...",
      "studentAction": "..."
    }
  ],
  "paragraphFeedback": [
    {
      "paragraphLocation": "Introduction | Overview | Body Paragraph 1 | Body Paragraph 2",
      "exactEvidence": "quote one exact sentence from that paragraph",
      "diagnosis": "explain the report structure, overview, grouping, data, or tone issue",
      "action": "one concrete student action for this paragraph"
    }
  ],
  "practicePlan": [
    { "day": 1, "title": "...", "task": "..." }
  ],
  "disclaimer": "This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners."
}`;
}
