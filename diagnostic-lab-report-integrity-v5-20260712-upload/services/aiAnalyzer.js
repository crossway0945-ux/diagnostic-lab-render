import { buildPrompt } from "./promptBuilder.js";
import { buildDiagnosticResponseFormat } from "./diagnosticResponseSchema.js";

const DISCLAIMER = "This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners.";
const THAI_DISCLAIMER = "รายงานนี้เป็นการประเมินเชิง diagnostic ตาม IELTS Writing Criteria และ framework ของ Kru Pom IELTS ไม่ใช่คะแนนทางการจาก IELTS examiner";
const TASK1_CAP_MESSAGE = "Task Achievement is capped because the overview contains inaccurate or unsafe main trends.";
const TASK1_UNSAFE_GENERALISATION_PATTERN = /\b(across all groups|all countries|every category|the least preferred overall|the most common in all groups|the lowest across all groups|the highest in every case|always|never|completely|entirely)\b/i;
const TASK1_NON_OVERVIEW_UNSAFE_GENERALISATION_PATTERN = /\b(across all groups|all countries|every category|the least preferred overall|the most common in all groups|the lowest across all groups|the highest in every case|always|never)\b/i;
const TASK1_VAGUE_OVERVIEW_PATTERN = /\b(many changes|figures changed over time|changed over time|different trends|various changes|several changes|some (?:categories|figures|subjects|groups).*(?:increased|rose).*some (?:categories|figures|subjects|groups).*(?:decreased|fell)|shows? different trends)\b/i;
const TASK1_MAP_UNSUPPORTED_PURPOSE_PATTERN = /\b(creates? more space|facilit(?:y|ies) construction|to accommodate|to improve|in order to|so that|because|for better access|for facilities|for construction)\b/i;
const TASK1_VAGUE_REVISION_PATTERN = /\b(the visuals show|the figures show|the information illustrates|different categories|various groups|several changes|different locations|a number of people|some types|things changed)\b/i;
const TASK1_VISUAL_TYPE_PATTERN = /\b(line graph|bar chart|pie chart|pie charts|table|map|maps|plan|plans|diagram|diagrams|process|chart|charts|graph|graphs)\b/i;
const TASK1_MEASUREMENT_PATTERN = /\b(proportion|proportions|percentage|percentages|share|shares|number|numbers|amount|figures|minutes|students|people|participants|locations|categories|age groups|years|stages|components|structure|function|heating|water|air)\b/i;
const TASK2_CAP_MESSAGE = "Task Response is capped because the response does not fully deliver the promised task route.";
const TASK1_HIGH_BAND_LIMITER_MESSAGE = "The report is generally strong, but precision is limited by one unsupported purpose phrase and a few map-language choices that should be made safer.";
const TASK1_CRITERIA_NAMES = ["Task Achievement", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"];
const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_TIMEOUT_MS = 55000;
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 3500;
const DEFAULT_SERVERLESS_PROVIDER_TIMEOUT_CAP_MS = 55000;
const DEFAULT_SERVERLESS_MAX_OUTPUT_TOKENS = 3500;
const DEFAULT_SERVERLESS_REASONING_EFFORT = "low";
const GENERIC_ANALYSIS_MESSAGE = "Analysis could not be completed. Please try again or contact Kru Pom IELTS.";
const REPORT_OUTPUT_VALIDATION_MESSAGE = "The report could not be finalised because an output-quality check failed. No analysis credit was used. Please run the analysis again or contact Kru Pom IELTS.";
const TASK1_PROMPT_LEAKAGE_PATTERN = /\b(?:below\s+(?:shows?|show|provides?|provide|presents?|present|illustrates?|illustrate)|the\s+(?:chart|charts|graph|graphs|map|maps|diagram|diagrams|table)\s+below\s+(?:shows?|show)|summari[sz]e\s+the\s+information|selecting\s+and\s+reporting\s+the\s+main\s+features|make\s+comparisons\s+where\s+relevant|write\s+at\s+least\s+150\s+words)\b/i;
const TASK1_VISUAL_NOUN_PATTERN = /\b(line graph|line graphs|bar chart|bar charts|pie chart|pie charts|map|maps|plan|plans|diagram|diagrams|process|processes|table|tables)\b/gi;

const PROVIDER_STUDENT_MESSAGES = {
  PROVIDER_AUTH_ERROR: "The diagnostic service is not ready yet. Please contact Kru Pom IELTS.",
  PROVIDER_MODEL_ERROR: "The diagnostic service is not configured correctly. Please contact Kru Pom IELTS.",
  PROVIDER_RATE_LIMIT: "The diagnostic service is busy right now. Please try again in a few minutes.",
  PROVIDER_TIMEOUT: "The diagnostic service took too long to respond. Please try again.",
  PROVIDER_JSON_PARSE_ERROR: "Analysis could not be completed cleanly. Please try again or contact Kru Pom IELTS.",
  PROVIDER_ERROR: GENERIC_ANALYSIS_MESSAGE
};

export async function analyzeWriting(payload) {
  if (process.env.OPENAI_API_KEY) {
    return analyzeWithOpenAI(payload);
  }

  if (requiresFullDiagnosticEngine()) {
    throw providerError("PROVIDER_AUTH_ERROR", {
      statusCode: 502,
      debugHint: "OPENAI_API_KEY is missing and full diagnostic engine mode is required.",
      payload
    });
  }

  return validateReportOutput(buildLocalAnalysis(payload), payload);
}

export function getAnalyzerHealth() {
  const apiKeyConfigured = hasOpenAiKey();
  const model = configuredOpenAiModel();

  return {
    diagnosticEngineConfigured: apiKeyConfigured,
    apiKeyConfigured,
    modelConfigured: !apiKeyConfigured || Boolean(model),
    modelName: apiKeyConfigured ? (model || "not-configured") : "local-basic-diagnostic",
    endpoint: configuredOpenAiEndpoint(),
    timeoutMs: configuredTimeoutMs(),
    maxOutputTokens: configuredMaxOutputTokens(),
    reasoningEffort: configuredReasoningEffort(),
    fullEngineRequired: requiresFullDiagnosticEngine()
  };
}

export async function runProviderHealthCheck() {
  const config = getOpenAiConfig();
  const data = await postOpenAIResponse({
    config: {
      ...config,
      maxOutputTokens: 100,
      timeoutMs: Math.min(config.timeoutMs, 10000)
    },
    body: {
      model: config.model,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: 'Return valid JSON only: {"ok": true}' }]
      }],
      text: {
        format: simpleHealthResponseFormat()
      },
      max_output_tokens: 100
    }
  });
  const parsed = parseJsonResponse(extractResponseText(data));

  return {
    ran: true,
    ok: parsed.ok === true,
    modelName: config.model,
    endpoint: config.endpoint
  };
}

async function analyzeWithOpenAI(payload) {
  const config = getOpenAiConfig(payload);
  const prompt = buildPrompt(payload);
  const result = await runOpenAiAnalysisAttempt({ config, payload, prompt, isRetry: false }).catch(async (error) => {
    if (!["PROVIDER_JSON_PARSE_ERROR", "REPORT_OUTPUT_VALIDATION_FAILED"].includes(error?.errorCode)) throw error;
    return runOpenAiAnalysisAttempt({
      config: {
        ...config,
        maxOutputTokens: Math.max(config.maxOutputTokens, 5000),
        reasoningEffort: config.reasoningEffort === "minimal" ? "low" : config.reasoningEffort
      },
      payload,
      prompt: buildRetryPrompt(prompt, error),
      isRetry: true,
      previousError: error
    });
  });

  return result;
}

async function runOpenAiAnalysisAttempt({ config, payload, prompt, isRetry, previousError = null }) {
  const content = [{ type: "input_text", text: prompt }];

  if (payload.taskType === "Task 1" && payload.image?.dataUrl) {
    content.push({ type: "input_image", image_url: payload.image.dataUrl });
  }

  const data = await postOpenAIResponse({
    config,
    payload,
    body: {
      model: config.model,
      input: [{ role: "user", content }],
      text: {
        format: buildDiagnosticResponseFormat(payload.taskType)
      },
      reasoning: {
        effort: config.reasoningEffort
      },
      max_output_tokens: config.maxOutputTokens
    }
  });
  const text = extractResponseText(data);
  let parsed;
  try {
    parsed = extractParsedResponse(data) || parseJsonResponse(text, payload);
  } catch (error) {
    if (previousError?.rawOutputPreview && !error.rawOutputPreview) {
      error.rawOutputPreview = previousError.rawOutputPreview;
    }
    throw error;
  }
  const evidenceChecked = enforceEvidenceIntegrity(parsed, payload);

  const normalized = normalizeAnalysis({
    ...evidenceChecked,
    analysisMode: payload.image?.dataUrl ? "Full diagnostic engine with Task 1 image input" : "Full diagnostic engine",
    warnings: [
      ...(evidenceChecked.warnings || []),
      ...(isRetry ? ["The diagnostic engine automatically retried once because the first structured response was incomplete."] : [])
    ]
  }, payload);

  return validateReportOutput(normalized, payload);
}

function buildRetryPrompt(prompt, previousError = null) {
  const qualityIssues = Array.isArray(previousError?.validationIssues)
    ? previousError.validationIssues.slice(0, 8).join(" | ")
    : "";
  return `${prompt}

CRITICAL STRUCTURED OUTPUT RETRY:
The previous structured response could not be parsed cleanly by the diagnostic app.
Return exactly one complete JSON object that matches the requested schema.
Do not use markdown fences, comments, prose before JSON, or prose after JSON.
Keep every diagnosis/action concise: 1 focused sentence per field where possible.
Do not omit required top-level fields, criteriaScores, kruPomScores, feedbackCards, paragraphFeedback, or practicePlan.
Use only exact student evidence copied from the student's writing for evidence fields.
Before returning, verify every generated feedback field is complete, grammatical, non-duplicated, and free from task-instruction leakage.
Do not concatenate a visual-type prefix with the original task prompt.
Ensure Targeted Revision and Why This Revision Is Stronger describe the same visual number, unit, categories, countries, and timeframe.${qualityIssues ? `\nPrevious output-quality failures to repair: ${qualityIssues}` : ""}`;
}

function getOpenAiConfig(payload) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const model = configuredOpenAiModel();

  if (!apiKey) {
    throw providerError("PROVIDER_AUTH_ERROR", {
      statusCode: 502,
      debugHint: "OPENAI_API_KEY is missing.",
      payload
    });
  }

  if (!model) {
    throw providerError("PROVIDER_MODEL_ERROR", {
      statusCode: 500,
      debugHint: "OPENAI_MODEL is missing while OPENAI_API_KEY is configured.",
      payload
    });
  }

  return {
    endpoint: configuredOpenAiEndpoint(),
    apiKey,
    model,
    timeoutMs: configuredTimeoutMs(),
    maxOutputTokens: configuredMaxOutputTokens(),
    reasoningEffort: configuredReasoningEffort()
  };
}

async function postOpenAIResponse({ config, body, payload = null }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;

  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw providerError("PROVIDER_TIMEOUT", {
        statusCode: 504,
        debugHint: `Provider request exceeded ${config.timeoutMs} ms.`,
        payload
      });
    }

    throw providerError("PROVIDER_ERROR", {
      statusCode: 502,
      debugHint: `Provider request failed before a response was received: ${error?.message || "unknown error"}`,
      payload
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const providerText = await response.text().catch(() => "");
    throw classifyProviderResponse(response.status, providerText, payload);
  }

  try {
    return await response.json();
  } catch (error) {
    throw providerError("PROVIDER_JSON_PARSE_ERROR", {
      statusCode: 502,
      providerStatus: response.status,
      debugHint: `Provider returned non-JSON response: ${error?.message || "JSON parse failed"}`,
      payload
    });
  }
}

function classifyProviderResponse(status, providerText, payload) {
  const body = String(providerText || "");
  const lower = body.toLowerCase();
  const isModelError = status === 404 ||
    lower.includes("model_not_found") ||
    lower.includes("invalid_model") ||
    lower.includes("unsupported_model") ||
    lower.includes("does not exist") ||
    lower.includes("not found");

  let errorCode = "PROVIDER_ERROR";
  if (status === 401 || status === 403) errorCode = "PROVIDER_AUTH_ERROR";
  else if (isModelError) errorCode = "PROVIDER_MODEL_ERROR";
  else if (status === 429) errorCode = "PROVIDER_RATE_LIMIT";

  return providerError(errorCode, {
    statusCode: errorCode === "PROVIDER_RATE_LIMIT" ? 429 : 502,
    providerStatus: status,
    providerBodyPreview: truncate(body, 1000),
    debugHint: "Check server logs for provider status and truncated provider response.",
    payload
  });
}

function providerError(errorCode, options = {}) {
  const error = new Error(providerStudentMessage(errorCode, options.payload));
  error.statusCode = options.statusCode || 502;
  error.errorCode = errorCode;
  error.debugHint = options.debugHint || "Check server logs for provider details.";
  if (options.providerStatus) error.providerStatus = options.providerStatus;
  if (options.providerBodyPreview) error.providerBodyPreview = options.providerBodyPreview;
  if (options.rawOutputPreview) error.rawOutputPreview = options.rawOutputPreview;
  return error;
}

function providerStudentMessage(errorCode, payload) {
  if (
    payload?.taskType === "Task 1" &&
    payload?.image?.dataUrl &&
    ["PROVIDER_ERROR", "PROVIDER_TIMEOUT", "PROVIDER_JSON_PARSE_ERROR"].includes(errorCode)
  ) {
    return "Task 1 image analysis could not be completed. Please try without the image or contact Kru Pom IELTS.";
  }

  return PROVIDER_STUDENT_MESSAGES[errorCode] || GENERIC_ANALYSIS_MESSAGE;
}

function hasOpenAiKey() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

function configuredOpenAiModel() {
  return String(process.env.OPENAI_MODEL || "").trim();
}

function configuredOpenAiEndpoint() {
  return String(process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_ENDPOINT).trim();
}

function configuredTimeoutMs() {
  const value = Number(process.env.OPENAI_TIMEOUT_MS || DEFAULT_OPENAI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(value) && value > 0 ? value : DEFAULT_OPENAI_TIMEOUT_MS;
  if (!isServerlessRuntime()) return timeoutMs;

  const capValue = Number(process.env.DIAGNOSTIC_PROVIDER_TIMEOUT_CAP_MS || DEFAULT_SERVERLESS_PROVIDER_TIMEOUT_CAP_MS);
  const capMs = Number.isFinite(capValue) && capValue > 0 ? capValue : DEFAULT_SERVERLESS_PROVIDER_TIMEOUT_CAP_MS;
  const effectiveTimeoutMs = Math.max(timeoutMs, DEFAULT_SERVERLESS_PROVIDER_TIMEOUT_CAP_MS);
  const effectiveCapMs = Math.max(capMs, DEFAULT_SERVERLESS_PROVIDER_TIMEOUT_CAP_MS);
  return Math.min(effectiveTimeoutMs, effectiveCapMs);
}

function configuredMaxOutputTokens() {
  const value = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || DEFAULT_OPENAI_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = Number.isFinite(value) && value > 0 ? value : DEFAULT_OPENAI_MAX_OUTPUT_TOKENS;
  if (!isServerlessRuntime()) return maxOutputTokens;

  const capValue = Number(process.env.DIAGNOSTIC_MAX_OUTPUT_TOKENS_CAP || DEFAULT_SERVERLESS_MAX_OUTPUT_TOKENS);
  const capTokens = Number.isFinite(capValue) && capValue > 0 ? capValue : DEFAULT_SERVERLESS_MAX_OUTPUT_TOKENS;
  return Math.min(maxOutputTokens, capTokens);
}

function configuredReasoningEffort() {
  const value = String(process.env.OPENAI_REASONING_EFFORT || "medium").trim().toLowerCase();
  const effort = ["minimal", "low", "medium", "high"].includes(value) ? value : "medium";
  if (!isServerlessRuntime() || process.env.DIAGNOSTIC_SERVERLESS_FAST_MODE === "false") {
    return effort;
  }

  return ["medium", "high"].includes(effort) ? DEFAULT_SERVERLESS_REASONING_EFFORT : effort;
}

function requiresFullDiagnosticEngine() {
  if (process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE === "false") return false;
  if (process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE === "true") return true;
  return process.env.NODE_ENV === "production" || isServerlessRuntime();
}

function isServerlessRuntime() {
  return Boolean(
    process.env.NETLIFY ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV
  );
}

function simpleHealthResponseFormat() {
  return {
    type: "json_schema",
    name: "provider_health_check",
    strict: true,
    schema: {
      type: "object",
      properties: {
        ok: { type: "boolean" }
      },
      required: ["ok"],
      additionalProperties: false
    }
  };
}

function extractParsedResponse(data) {
  if (data?.output_parsed && typeof data.output_parsed === "object") return data.output_parsed;
  return null;
}

function enforceEvidenceIntegrity(analysis, payload) {
  const warnings = Array.isArray(analysis.warnings) ? [...analysis.warnings] : [];
  const writing = String(payload.writing || "");
  const feedbackCards = Array.isArray(analysis.feedbackCards)
    ? analysis.feedbackCards.filter((card) => {
      if (!card?.exactSentence) return false;
      const matched = containsEvidence(writing, card.exactSentence);
      if (!matched) {
        warnings.push(`Dropped one feedback card because its quoted evidence was not found in the student's writing: ${truncate(card.exactSentence, 120)}`);
      }
      return matched;
    })
    : [];

  const paragraphFeedback = Array.isArray(analysis.paragraphFeedback)
    ? analysis.paragraphFeedback.filter((item) => {
      if (!item?.exactEvidence) return false;
      const matched = containsEvidence(writing, item.exactEvidence);
      if (!matched) {
        warnings.push(`Dropped one paragraph note because its quoted evidence was not found in the student's writing: ${truncate(item.exactEvidence, 120)}`);
      }
      return matched;
    })
    : [];

  return {
    ...analysis,
    feedbackCards,
    paragraphFeedback,
    warnings: Array.from(new Set(warnings))
  };
}

function containsEvidence(source, evidence) {
  const normalizedSource = normalizeEvidenceText(source);
  const normalizedEvidence = normalizeEvidenceText(evidence);
  return Boolean(normalizedEvidence) && normalizedSource.includes(normalizedEvidence);
}

function normalizeEvidenceText(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildLocalAnalysis(payload) {
  const analysis = payload.taskType === "Task 1"
    ? buildLocalTask1Analysis(payload)
    : buildLocalTask2Analysis(payload);

  return normalizeAnalysis({
    ...analysis,
    analysisMode: "Evidence-based diagnostic check",
    warnings: [
      "Advanced diagnostic checking is not fully connected. This result uses basic evidence rules and exact-sentence matching.",
      ...(payload.taskType === "Task 1" && payload.image
        ? ["Image-based chart checking is available only when the full diagnostic service is available. No visual or data-accuracy judgment was inferred from the uploaded image."]
        : [])
    ]
  }, payload);
}

function buildLocalTask2Analysis(payload) {
  const records = getSentenceRecords(payload.writing);
  const cards = [];
  const used = new Set();
  const intro = records.filter((record) => record.paragraphIndex === 0);
  const thesisCandidate = intro.find((record) => /this essay|discuss both views|give my opinion|i will discuss/i.test(record.sentence)) || intro.at(-1);

  if (thesisCandidate && (/this essay|discuss both views|give my opinion|i will discuss/i.test(thesisCandidate.sentence) || !/\bbecause\b|\bwhile\b|\balthough\b/i.test(thesisCandidate.sentence))) {
    addCard(cards, used, {
      issueType: "Thesis Route Problem",
      severity: "Critical",
      criteria: ["Task Response", "Coherence & Cohesion"],
      framework: ["Thesis Route Clarity", "LFC CPC - Link", "LFC CPC - Clear"],
      paragraphLocation: thesisCandidate.location,
      exactSentence: thesisCandidate.sentence,
      sentenceFunction: "This sentence is trying to function as the thesis statement.",
      whyItLimitsBand: "ประโยคนี้บอกว่าจะทำอะไรใน essay แต่ยังไม่สร้าง route ให้ examiner เห็นว่า Body 1 และ Body 2 จะพิสูจน์อะไร",
      kruPomDiagnosis: "ปัญหานี้ไม่ใช่ grammar เป็นหลัก แต่เป็น route control: thesis ยังไม่ตอบโจทย์แบบชัดพอและยังไม่ล็อกทิศทางของ paragraph.",
      targetedRevision: "While schools can introduce money management through structured lessons, I believe parents must also shape children's daily financial habits because spending decisions are first learned at home.",
      whyRevisionIsStronger: "เวอร์ชันใหม่ดีกว่าเพราะมี View 1, เหตุผลของ View 1, จุดยืนของผู้เขียน, เหตุผลของจุดยืน และ route สำหรับ body paragraphs.",
      studentAction: "Rewrite the thesis using: While [View 1] because [reason], I believe [your position] because [reason]."
    });
  }

  const vagueExplanation = records.find((record) => /\b(many things|good things|useful information|very important|important for|useful because|good or bad)\b/i.test(record.sentence));
  if (vagueExplanation) {
    addCard(cards, used, {
      issueType: "Explanation Too General",
      severity: "Critical",
      criteria: ["Task Response"],
      framework: ["Explanation Depth", "Body Paragraph Development", "LFC CPC - Clear", "LFC CPC - Precise"],
      paragraphLocation: vagueExplanation.location,
      exactSentence: vagueExplanation.sentence,
      sentenceFunction: "This sentence is trying to explain or support the paragraph's main idea.",
      whyItLimitsBand: "คำกว้าง ๆ ทำให้ examiner ยังไม่เห็น mechanism ว่าสิ่งนั้นช่วยหรือกระทบอย่างไร คะแนน Task Response จึงติดที่ development.",
      kruPomDiagnosis: "ไอเดียเกี่ยวข้องกับโจทย์ แต่ reasoning ยังไม่ visible พอ ต้องเปลี่ยนจากคำกว้างเป็นรายละเอียดเชิง academic.",
      targetedRevision: "Online learning gives students access to recorded lessons, interactive exercises, and teacher feedback outside normal classroom hours, allowing them to review difficult concepts at their own pace.",
      whyRevisionIsStronger: "เวอร์ชันใหม่ใส่ mechanism ชัดเจน: access, tools, feedback, and learner control. Examiner เห็นเหตุผล ไม่ใช่แค่คำว่า useful.",
      studentAction: "Replace broad nouns like 'many things', 'good things', and 'useful information' with concrete academic details."
    });
  }

  const weakExample = records.find((record) => /^for example\b/i.test(record.sentence) && (record.sentence.length < 120 || /\bmany people\b|\bpeople use\b|\bstudents use\b/i.test(record.sentence)));
  if (weakExample) {
    addCard(cards, used, {
      issueType: "SAR Example Failure",
      severity: "Critical",
      criteria: ["Task Response"],
      framework: ["SAR Example Quality", "Body Paragraph Development"],
      paragraphLocation: weakExample.location,
      exactSentence: weakExample.sentence,
      sentenceFunction: "This sentence is trying to provide an example.",
      whyItLimitsBand: "ตัวอย่างนี้เกี่ยวข้องกับ topic แต่ยังไม่ prove argument เพราะยังไม่เห็น Specific Situation, Action, and Result.",
      kruPomDiagnosis: "นี่คือ topic-relevant example แต่ยังไม่ใช่ argument-proving example. ต้องทำให้คน สถานการณ์ การกระทำ และผลลัพธ์ชัดขึ้น.",
      targetedRevision: "For example, a secondary school student who receives a monthly allowance can use a class budgeting worksheet to divide money into transport, meals, savings, and emergency spending, which helps the student make safer financial decisions before adulthood.",
      whyRevisionIsStronger: "เวอร์ชันใหม่มี S = student with allowance, A = uses a budgeting worksheet, R = makes safer financial decisions.",
      studentAction: "Before writing an example, answer: Who / Where? What action? What result?"
    });
  }

  const weakLink = records.find((record) => /\bthis is (very )?important\b|\btherefore,? both\b|\bit is useful for\b/i.test(record.sentence));
  if (weakLink) {
    addCard(cards, used, {
      issueType: "Weak Link Sentence",
      severity: "Needs Work",
      criteria: ["Coherence & Cohesion"],
      framework: ["Link Back Control", "LFC CPC - Link", "LFC CPC - Flow"],
      paragraphLocation: weakLink.location,
      exactSentence: weakLink.sentence,
      sentenceFunction: "This sentence is trying to close a paragraph or connect back to the main argument.",
      whyItLimitsBand: "ประโยคปิดยัง generic เกินไป จึงทำให้ paragraph หยุด แต่ยังไม่ close argument กลับไปที่ thesis.",
      kruPomDiagnosis: "ต้อง link back ด้วยคำสำคัญของ argument ไม่ใช่ปิดด้วยประโยคกว้าง ๆ เช่น 'This is important.'",
      targetedRevision: "Therefore, structured financial education at school can give students practical decision-making skills before they face real financial responsibilities in adulthood.",
      whyRevisionIsStronger: "เวอร์ชันใหม่เชื่อม school-based education -> practical decision-making -> adult financial responsibility ชัดกว่าเดิม.",
      studentAction: "End each body paragraph by restating the exact argument of that paragraph in a more precise way."
    });
  }

  const bodyTopic = records.find((record) => record.paragraphIndex > 0 && record.paragraphIndex < getParagraphs(payload.writing).length - 1 && /on the one hand|on the other hand|firstly|secondly/i.test(record.sentence));
  if (bodyTopic && cards.length < 4) {
    addCard(cards, used, {
      issueType: "Topic Sentence Route Alignment",
      severity: "Needs Work",
      criteria: ["Task Response", "Coherence & Cohesion"],
      framework: ["Body Paragraph Route Alignment", "Topic Sentence Strength"],
      paragraphLocation: bodyTopic.location,
      exactSentence: bodyTopic.sentence,
      sentenceFunction: "This sentence is trying to open a body paragraph.",
      whyItLimitsBand: "Topic sentence บอกทิศทางกว้าง ๆ แต่ยังไม่ผูกกลับกับ thesis route อย่างแม่นพอ",
      kruPomDiagnosis: "ควรทำให้ topic sentence เป็น mini-claim ที่พิสูจน์ thesis ไม่ใช่แค่เปิดมุมมองแบบทั่วไป.",
      targetedRevision: "On the one hand, schools can provide structured financial lessons that give children a safe place to practise budgeting before they manage real money independently.",
      whyRevisionIsStronger: "เวอร์ชันใหม่บอก claim + reason + connection to the prompt in one sentence.",
      studentAction: "Check each body topic sentence against the thesis route before writing the explanation."
    });
  }

  return buildAnalysisFromCards({
    payload,
    cards,
    criteriaNames: ["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"],
    frameworkNames: [
      "Essay Type Recognition",
      "Prompt Coverage",
      "Thesis Route Clarity",
      "Body Paragraph Route Alignment",
      "Explanation Depth",
      "SAR Example Quality",
      "Link Back Control",
      "LFC CPC Control",
      "Template / Memorized Pattern Risk",
      "Vocabulary Precision",
      "Grammar Risk",
      "Paragraph Balance"
    ],
    mainScoreLimitingFactor: "Body development and route control are limiting the response because key claims are supported with broad wording rather than precise evidence.",
    mostUrgentRepair: "Repair the thesis route first, then upgrade body explanations and examples using mechanism language + SAR.",
    essayType: payload.essayType
  });
}

function buildLocalTask1Analysis(payload) {
  const records = getSentenceRecords(payload.writing);
  const cards = [];
  const used = new Set();
  const firstSentence = records[0];
  const secondSentence = records[1];
  const overview = findTask1Overview(records);

  if (firstSentence && isTask1IntroVisualTypeMismatch(payload, firstSentence.sentence)) {
    addCard(cards, used, {
      issueType: "Task 1 Introduction Visual-Type Precision",
      severity: "Needs Work",
      criteria: ["Task Achievement", "Lexical Resource"],
      framework: ["Visual Understanding", "Vocabulary Precision", "Report Tone Control"],
      paragraphLocation: firstSentence.location,
      exactSentence: firstSentence.sentence,
      sentenceFunction: "This sentence attempts to identify the visual type, metric, groups and timeframe.",
      whyItLimitsBand: "The introduction starts with a visual-type or metric precision error, so the reader cannot trust the report route from the first sentence.",
      kruPomDiagnosis: buildTask1IntroDiagnosis(payload),
      targetedRevision: buildTask1IntroTargetedRevision(payload),
      whyRevisionIsStronger: buildTask1IntroWhyStronger(payload),
      studentAction: buildTask1IntroStudentAction(payload)
    });
  }

  if (firstSentence && isTask1IntroTooCloseToPrompt(payload.prompt, firstSentence.sentence)) {
    addCard(cards, used, {
      issueType: "Task 1 Introduction Paraphrase Control",
      severity: "Moderate",
      criteria: ["Task Achievement", "Lexical Resource"],
      framework: ["Task 1 Objective Reporting", "Visual Understanding", "Vocabulary Precision", "Report Tone Control"],
      paragraphLocation: firstSentence.location,
      exactSentence: firstSentence.sentence,
      sentenceFunction: "This sentence is trying to introduce the Task 1 visual.",
      whyItLimitsBand: "This introduction is understandable, but it is not fully controlled because it keeps too much of the prompt's sentence structure. This is not a serious Task Achievement failure by itself, but it limits report-tone control and lexical precision.",
      kruPomDiagnosis: "Intro นี้ไม่ได้ผิดหลัก ๆ แต่ยังไม่ premium เพราะเปลี่ยนคำบางคำโดยยังคงโครงประโยคของโจทย์มากเกินไป ต้อง paraphrase แบบเปลี่ยน structure โดยไม่บิดความหมาย.",
      targetedRevision: buildTask1IntroTargetedRevision(payload),
      whyRevisionIsStronger: "This revision keeps necessary technical nouns, changes the sentence structure, uses visual-type-appropriate framing, and avoids forced synonym changes that could create meaning drift.",
      studentAction: "Keep key technical nouns when needed, but do not simply replace 'show' with 'illustrate'. Rewrite the sentence structure so the introduction sounds like your own concise report sentence."
    });
  }

  if (firstSentence && !/\b(chart|graph|table|diagram|map|pie|bar|line)\b/i.test(firstSentence.sentence)) {
    addCard(cards, used, {
      issueType: "Task 1 Introduction Coverage",
      severity: "Needs Work",
      criteria: ["Task Achievement"],
      framework: ["Visual Understanding", "Prompt Coverage"],
      paragraphLocation: firstSentence.location,
      exactSentence: firstSentence.sentence,
      sentenceFunction: "This sentence is trying to introduce the visual.",
      whyItLimitsBand: "Introduction ควรบอกประเภท visual, data, and time/place scope ให้ครบ ถ้าเปิดกว้างเกินไป Task Achievement จะไม่ชัด.",
      kruPomDiagnosis: "Task 1 intro ต้องตอบ What / Which data / Where or group / When ใน 1-2 ประโยค.",
      targetedRevision: "The bar chart compares the percentage of students choosing four university subjects in 2010 and 2020.",
      whyRevisionIsStronger: "เวอร์ชันใหม่บอก visual type, measurement, topic, and time period ชัดเจน.",
      studentAction: "Check that your Task 1 introduction answers: What visual? Which data? Which group/place? Which time period?"
    });
  }

  if (!overview && secondSentence) {
    addCard(cards, used, {
      issueType: "Missing Overview",
      severity: "Critical",
      criteria: ["Task Achievement", "Coherence & Cohesion"],
      framework: ["Overview Quality", "Grouping Logic"],
      paragraphLocation: secondSentence.location,
      exactSentence: secondSentence.sentence,
      sentenceFunction: "This sentence appears where an overview should summarize the main visual pattern.",
      whyItLimitsBand: "Task 1 ต้องมี overview ชัดเจน ถ้าไม่มี overview คะแนน Task Achievement จะถูกจำกัดมาก.",
      kruPomDiagnosis: "Overview ไม่ใช่ conclusion และไม่ใช่ body detail. ต้องสรุปภาพใหญ่โดยไม่ใส่ raw data.",
      targetedRevision: "Overall, the most noticeable change was the rise in science-related choices, while arts became less popular over the period.",
      whyRevisionIsStronger: "เวอร์ชันใหม่สรุปภาพใหญ่และ grouping โดยไม่ใส่ตัวเลขดิบ.",
      studentAction: "Place a clear overview immediately after the introduction and summarize only the biggest patterns."
    });
  }

  if (overview && /\d/.test(overview.sentence)) {
    addCard(cards, used, {
      issueType: "Raw Data in Overview",
      severity: "Needs Work",
      criteria: ["Task Achievement"],
      framework: ["Overview Quality", "Data Selection"],
      paragraphLocation: overview.location,
      exactSentence: overview.sentence,
      sentenceFunction: "This sentence is trying to summarize the overall picture.",
      whyItLimitsBand: "Overview ควรสรุป trend/main feature ไม่ใช่ยกตัวเลขดิบ ถ้าใส่ตัวเลขมากเกินไปจะกลายเป็น body paragraph.",
      kruPomDiagnosis: "แยก overview กับ body data ให้ชัด: overview = ภาพใหญ่, body = ตัวเลขและ comparison.",
      targetedRevision: "Overall, the most popular subjects remained concentrated in practical fields, while arts-related choices declined over time.",
      whyRevisionIsStronger: "เวอร์ชันใหม่ให้ main pattern โดยไม่ทำให้ overview หนักด้วยตัวเลข.",
      studentAction: "Remove raw numbers from the overview and move them into body paragraphs."
    });
  }

  const unsupportedMapPurpose = isTask1MapPayload(payload)
    ? records.find((record) => TASK1_MAP_UNSUPPORTED_PURPOSE_PATTERN.test(record.sentence))
    : null;
  if (unsupportedMapPurpose) {
    const inOverview = unsupportedMapPurpose === overview;
    addCard(cards, used, {
      issueType: inOverview ? "Unsafe Map Overview Inference" : "Unsupported Map Purpose Inference",
      severity: inOverview ? "Needs Work" : "Moderate",
      criteria: ["Task Achievement", "Lexical Resource"],
      framework: inOverview
        ? ["Overview Quality", "Task 1 Objective Reporting", "Report Tone Control"]
        : ["Task 1 Objective Reporting", "Report Tone Control"],
      paragraphLocation: unsupportedMapPurpose.location,
      exactSentence: unsupportedMapPurpose.sentence,
      sentenceFunction: inOverview
        ? "This sentence is trying to summarize the main map transformation."
        : "This sentence is trying to report a map change but adds a reason or purpose.",
      whyItLimitsBand: "Task 1 Map reports must describe visible changes, not inferred reasons. Purpose language is unsafe unless the map explicitly labels the reason.",
      kruPomDiagnosis: "This is not mainly a grammar issue. It is a visual-interpretation issue: report old feature -> new feature, location, and function without explaining why the change happened.",
      targetedRevision: "Overall, the town changed noticeably, with older residential and industrial features replaced by new residential, recreational, and commercial areas.",
      whyRevisionIsStronger: "The revision reports visible map changes and removes the unsupported reason/purpose.",
      studentAction: "Before writing, make an Old Feature -> New Feature table. Avoid purpose phrases unless the map explicitly gives the reason."
    });
  }

  const vagueGrouping = records.find((record) => /\bsome\b.*\bsome\b|\bmany changes\b|\ba lot of changes\b/i.test(record.sentence));
  if (vagueGrouping) {
    addCard(cards, used, {
      issueType: "Weak Grouping Logic",
      severity: "Critical",
      criteria: ["Task Achievement", "Coherence & Cohesion"],
      framework: ["Grouping Logic", "Comparison Precision"],
      paragraphLocation: vagueGrouping.location,
      exactSentence: vagueGrouping.sentence,
      sentenceFunction: "This sentence is trying to summarize or compare trends.",
      whyItLimitsBand: "คำว่า some subjects / many changes กว้างเกินไป ทำให้ examiner ไม่เห็นว่าคุณ group data จากภาพอย่างไร.",
      kruPomDiagnosis: "Task 1 ต้อง group by meaningful pattern เช่น highest/lowest, increase/decrease, stable/fluctuating, or similar categories.",
      targetedRevision: "Overall, science and business attracted stronger interest by 2020, whereas arts showed a noticeable decline.",
      whyRevisionIsStronger: "เวอร์ชันใหม่ระบุกลุ่มข้อมูลและทิศทางของการเปลี่ยนแปลงชัดกว่า.",
      studentAction: "Name the categories you are grouping. Do not write 'some increased and some decreased' without saying which ones."
    });
  }

  const opinionSentence = records.find((record) => /\bimportant\b|\bimprovement\b|\bbetter\b|\bbecause students like\b|\bthis shows why\b/i.test(record.sentence));
  if (opinionSentence) {
    addCard(cards, used, {
      issueType: "Subjective Task 1 Tone",
      severity: "Needs Work",
      criteria: ["Task Achievement", "Lexical Resource"],
      framework: ["Report Tone Control", "Task 1 Objective Reporting"],
      paragraphLocation: opinionSentence.location,
      exactSentence: opinionSentence.sentence,
      sentenceFunction: "This sentence is trying to explain the meaning of the data.",
      whyItLimitsBand: "Task 1 Academic ต้องรายงานข้อมูลที่เห็น ไม่ควรใส่ opinion, explanation, prediction, or interpretation ที่ภาพไม่ได้บอก.",
      kruPomDiagnosis: "นี่ไม่ใช่ grammar problem เป็น tone-control problem: ต้อง objective, not explanatory.",
      targetedRevision: "The proportion for science increased, while the figure for arts declined over the same period.",
      whyRevisionIsStronger: "เวอร์ชันใหม่รายงานสิ่งที่เห็นจาก visual โดยไม่เดาเหตุผลของข้อมูล.",
      studentAction: "Remove opinion words such as important, better, improvement, and because unless the visual directly supports them."
    });
  }

  const guardrail = detectTask1StrictGuardrail(payload, cards);
  if (guardrail.strictModeApplied) {
    addOrUpdateTask1GuardrailCard(cards, used, guardrail);
  }

  return buildAnalysisFromCards({
    payload,
    cards,
    criteriaNames: ["Task Achievement", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"],
    frameworkNames: [
      "Visual Understanding",
      "Prompt Coverage",
      "Overview Quality",
      "Data Selection",
      "Grouping Logic",
      "Data Accuracy",
      "Comparison Precision",
      "Report Tone Control",
      "Task 1 Objective Reporting",
      "LFC CPC Control",
      "Vocabulary Precision",
      "Grammar Risk"
    ],
    mainScoreLimitingFactor: "Task 1 overview and grouping need to be more precise, with objective reporting instead of broad interpretation.",
    mostUrgentRepair: "Repair the overview first, then group body paragraphs by clear visual patterns.",
    visualType: payload.visualType
  });
}

function isTask1IntroTooCloseToPrompt(prompt, introduction) {
  const promptTokens = contentTokens(prompt);
  const introTokens = contentTokens(introduction);
  if (promptTokens.length < 6 || introTokens.length < 6) return false;

  const introSet = new Set(introTokens);
  const promptSet = new Set(promptTokens);
  const shared = promptTokens.filter((token) => introSet.has(token));
  const promptOverlap = shared.length / Math.max(1, promptTokens.length);
  const introOverlap = introTokens.filter((token) => promptSet.has(token)).length / Math.max(1, introTokens.length);
  const onlyVerbSwap = /\b(show|shows|showing)\b/i.test(prompt) &&
    /\b(illustrate|illustrates|depict|depicts|present|presents)\b/i.test(introduction);

  return promptOverlap >= 0.62 && introOverlap >= 0.62 && (onlyVerbSwap || Math.abs(promptTokens.length - introTokens.length) <= 5);
}

function isTask1IntroVisualTypeMismatch(payload, introduction) {
  const expected = canonicalTask1VisualType(payload.visualType || payload.prompt);
  const actual = canonicalTask1VisualType(introduction);
  return Boolean(expected && actual && expected !== actual);
}

function canonicalTask1VisualType(value) {
  const text = String(value || "").toLowerCase();
  if (/\bline graph\b/.test(text)) return "line graph";
  if (/\bbar chart\b/.test(text)) return "bar chart";
  if (/\bpie charts?\b/.test(text)) return "pie chart";
  if (/\btables?\b/.test(text)) return "table";
  if (/\bmaps?|plans?\b/.test(text)) return "map";
  if (/\bprocess\b/.test(text)) return "process";
  if (/\bdiagrams?\b/.test(text)) return "diagram";
  return "";
}

function contentTokens(value) {
  const stopWords = new Set([
    "the", "a", "an", "below", "above", "given", "this", "these", "that", "those",
    "show", "shows", "showing", "illustrate", "illustrates", "depict", "depicts",
    "chart", "charts", "graph", "graphs", "diagram", "diagrams", "table", "tables",
    "map", "maps", "bar", "line", "pie", "and", "or", "of", "to", "in", "on", "for",
    "with", "by", "from", "between", "how", "can", "be", "used", "use", "it", "its"
  ]);

  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function isTask1MapPayload(payload) {
  return payload.taskType === "Task 1" && /map/i.test(String(payload.visualType || ""));
}

function buildTask1IntroDiagnosis(payload) {
  const visualType = canonicalTask1VisualType(payload.visualType || payload.prompt) || "visual type";
  const items = extractShortTask1ItemList(payload.prompt);
  const count = extractTask1CategoryCount(payload.prompt);
  const countText = count?.value ? `${numberWord(count.value)} categories/groups` : "the exact category count";
  const itemText = items.length >= 2 && items.length <= 4 ? ` + short list (${formatInlineList(items)})` : "";

  if (visualType === "line graph") {
    return `Task 1 intro must follow the Kru Pom formula: visual type + reporting verb + exact metric/unit + ${countText}${itemText} + timeframe. For a line graph, use a changes-over-time frame and do not replace the metric with vague words like popularity.`;
  }

  if (visualType === "map") {
    return "Task 1 map intro must identify the maps, place, layout/land use, and timeframe without adding reasons or overview trends.";
  }

  return `Task 1 intro must follow the Kru Pom formula: visual type + reporting verb + exact metric/unit + ${countText}${itemText} + location/timeframe where supplied. Precision is more important than decorative paraphrasing.`;
}

function buildTask1IntroWhyStronger(payload) {
  const visualType = canonicalTask1VisualType(payload.visualType || payload.prompt);
  const items = extractShortTask1ItemList(payload.prompt);
  const frequency = extractTask1FrequencyQualifier(payload.prompt);

  if (visualType === "bar chart" && /marriage\s+and\s+divorce\s+rates?/i.test(String(payload.prompt || ""))) {
    return "This version identifies the two bar charts correctly, states the exact subject and measurement unit, lists the five countries clearly and preserves the two comparison years without using an unnatural relative clause.";
  }

  if (visualType === "line graph" && /goods/i.test(String(payload.prompt || "")) && /transport/i.test(String(payload.prompt || ""))) {
    return "It identifies the line graph, states the exact quantity and measurement unit, lists the four transport modes, names the location and preserves the timeframe without copying the prompt structure.";
  }

  if (visualType === "line graph") {
    return [
      "It corrects the visual type, uses a changes-over-time frame, keeps the exact metric/unit,",
      items.length ? `names the short category list (${formatInlineList(items)}),` : "keeps the category count clear,",
      frequency ? `preserves the exact qualifier "${frequency}",` : "does not invent an unverified frequency qualifier,",
      "and keeps the timeframe precise."
    ].join(" ");
  }

  if (visualType === "map") {
    return "It names the maps, place, layout/land-use focus and timeframe without adding purpose, trend language or body-level detail.";
  }

  if (visualType === "process" || visualType === "diagram") {
    return "It names the diagram type, keeps the technical nouns, and frames the task as stages, structure or mechanism instead of chart trends.";
  }

  return "It follows the Kru Pom introduction formula by naming the visual type, exact subject, unit or data type, category scope and timeframe without forcing unsafe synonyms.";
}

function buildTask1IntroStudentAction(payload) {
  const visualType = canonicalTask1VisualType(payload.visualType || payload.prompt);

  if (visualType === "line graph") {
    return "Use this intro checklist: line graph + compares changes in + exact metric/unit + exact group count + short group list if there are 2-4 labels + exact timeframe. Keep body grouping advice for the overview/body plan, not the introduction.";
  }

  if (visualType === "map") {
    return "Use this intro checklist: maps + compare changes in layout/land use + place + exact years. Do not add reasons, purposes or overview transformation in the introduction.";
  }

  return "Use this intro checklist: visual type + reporting verb + exact subject/metric + unit if useful + exact category count/list when manageable + location/timeframe.";
}

function buildTask1IntroTargetedRevision(payload) {
  const visualType = String(payload.visualType || "").toLowerCase();
  const promptText = String(payload.prompt || "");
  const prompt = promptText.toLowerCase();

  if (/solar panel|heat air|heat water|warm air|warm water/.test(prompt)) {
    return "The diagrams compare the basic components of a solar panel and illustrate how the device can warm air and water.";
  }

  if (/dance class/.test(prompt) && /pie chart/.test(prompt) && /bar chart/.test(prompt)) {
    return "The pie chart illustrates the proportion of dance classes held in four different locations in an Australian town, while the bar chart compares the numbers of young people attending ballet, tap and modern dance classes across two age groups: under 11 and 11-16.";
  }

  if (/map/.test(visualType)) {
    return buildMapIntroRevision(promptText);
  }

  if (/process|cycle|cyclical|natural|manufacturing/.test(visualType)) {
    return buildProcessIntroRevision(promptText);
  }

  if (/diagram|structure|mechanism/.test(visualType)) {
    return buildDiagramIntroRevision(promptText);
  }

  if (/mixed|combination|multiple/.test(visualType) || (/pie chart/.test(prompt) && /bar chart/.test(prompt))) {
    return buildMixedIntroRevision(promptText);
  }

  if (/pie/.test(visualType)) {
    return buildPieIntroRevision(promptText);
  }

  if (/table/.test(visualType)) {
    return buildTableIntroRevision(promptText);
  }

  if (/line/.test(visualType)) {
    return buildLineIntroRevision(promptText);
  }

  return buildBarIntroRevision(promptText, payload);
}

function buildMixedIntroRevision(prompt) {
  const clean = compactTask1Prompt(prompt);
  const hasPie = /pie chart/i.test(prompt);
  const hasBar = /bar chart/i.test(prompt);
  const hasLine = /line graph/i.test(prompt);
  const hasTable = /\btable\b/i.test(prompt);

  if (hasPie && hasBar) {
    const pieSubject = /dance class/i.test(prompt)
      ? "the proportion of dance classes held in different locations"
      : "the proportions shown in the first visual";
    const barSubject = /dance class/i.test(prompt)
      ? "the numbers of participants across the relevant categories and age groups"
      : "the figures compared in the second visual";
    return `The pie chart illustrates ${pieSubject}, while the bar chart compares ${barSubject}.`;
  }

  if (hasLine && hasBar) {
    return `The line graph illustrates changes over time, while the bar chart compares the related category figures for ${clean}.`;
  }

  if (hasTable && (hasBar || hasLine || hasPie)) {
    return `The chart and table present related information about ${clean}, with one visual comparing the main figures and the other providing supporting category data.`;
  }

  return `The combined visuals present related information about ${clean}, with each visual contributing a different comparison.`;
}

function buildLineIntroRevision(prompt) {
  if (/cinema/i.test(prompt) && /age group/i.test(prompt)) {
    const groups = extractAgeGroupLabels(prompt);
    const period = extractTimePeriod(prompt);
    const frequency = extractTask1FrequencyQualifier(prompt);
    const groupPhrase = groups.length >= 2 && groups.length <= 4
      ? ` across ${numberWord(groups.length)} distinct age groups - ${formatInlineList(groups)} -`
      : " across the given age groups";
    const frequencyPhrase = frequency ? ` ${frequency}` : "";
    const periodSuffix = period ? ` ${period}` : "";
    return `The line graph compares changes in the percentage of people${groupPhrase} who attended the cinema${frequencyPhrase}${periodSuffix}.`;
  }

  if (/goods/i.test(prompt) && /transport/i.test(prompt) && /road/i.test(prompt) && /pipeline/i.test(prompt)) {
    const modes = extractTransportModes(prompt);
    const period = extractTimePeriod(prompt);
    const unit = extractMeasurementUnit(prompt) || "million tonnes";
    const location = extractLocationPhrase(prompt) || "the United Kingdom";
    const modePhrase = modes.length >= 2 && modes.length <= 4
      ? ` by ${numberWord(modes.length)} different modes - ${formatInlineList(modes)} -`
      : "";
    const periodSuffix = period ? ` ${period}` : "";
    return `The line graph illustrates the quantity of goods, measured in ${unit}, transported${modePhrase} in ${location}${periodSuffix}.`;
  }

  const subject = compactTask1Prompt(prompt);
  const period = extractTimePeriod(prompt);
  const periodSuffix = period && !subject.toLowerCase().includes(period.toLowerCase()) ? ` ${period}` : "";
  return `The line graph compares changes in ${subject}${periodSuffix}.`;
}

function buildBarIntroRevision(prompt, payload = {}) {
  const context = `${prompt || ""} ${payload.writing || ""}`;
  if (/marriage\s+and\s+divorce\s+rates?/i.test(context)) {
    const descriptor = getTask1VisualDescriptor(payload, "bar chart");
    const verb = descriptor.plural ? "compare" : "compares";
    const unit = extractMeasurementUnit(context);
    const countries = extractTask1Countries(context);
    const years = Array.from(new Set(extractYears(context))).slice(0, 2);
    const unitPhrase = unit ? `, measured ${unit.startsWith("per ") ? unit : `in ${unit}`},` : "";
    const countriesPhrase = countries.length
      ? ` in ${formatCountryList(countries)}`
      : " in the countries shown";
    const yearsPhrase = years.length === 2
      ? ` in ${years[0]} and ${years[1]}`
      : "";
    return `The ${descriptor.noun} ${verb} marriage and divorce rates${unitPhrase}${countriesPhrase}${yearsPhrase}.`;
  }

  const subject = compactTask1Prompt(prompt);
  const dynamic = extractYears(prompt).length >= 2 || /\b(?:from|between)\b/i.test(prompt);
  const descriptor = getTask1VisualDescriptor(payload, "bar chart");
  const verb = descriptor.plural ? "compare" : "compares";
  return dynamic
    ? `The ${descriptor.noun} ${verb} figures for ${subject}.`
    : `The ${descriptor.noun} ${verb} figures for ${subject}.`;
}

function buildPieIntroRevision(prompt) {
  const subject = compactTask1Prompt(prompt);
  const count = extractTask1CategoryCount(prompt);
  const countPhrase = count && count.value <= 8 ? ` across ${numberWord(count.value)} categories` : "";
  return `The pie chart illustrates the proportions of ${subject}${countPhrase}.`;
}

function buildTableIntroRevision(prompt) {
  const subject = compactTask1Prompt(prompt);
  return `The table compares figures for ${subject}.`;
}

function buildMapIntroRevision(prompt) {
  const years = extractYears(prompt);
  const place = extractMapPlace(prompt);
  if (place && years.length >= 2) {
    return `The maps compare changes in the layout and land use of ${place} between ${years[0]} and ${years[1]}.`;
  }
  if (place) return `The maps compare changes in the layout and land use of ${place} at the given stages.`;
  return "The maps compare changes in the layout and land use of the area at the given stages.";
}

function buildProcessIntroRevision(prompt) {
  const subject = compactTask1Prompt(prompt);
  if (/life cycle/i.test(prompt)) return `The diagram depicts the life cycle of ${subject}.`;
  return `The diagram illustrates the stages involved in ${subject}.`;
}

function buildDiagramIntroRevision(prompt) {
  const subject = compactTask1Prompt(prompt);
  return `The diagrams present the main components of ${subject} and explain how the system functions.`;
}

function compactTask1Prompt(prompt) {
  const cleaned = String(prompt || "")
    .replace(/summari[sz]e the information.*$/i, "")
    .replace(/selecting and reporting.*$/i, "")
    .replace(/make comparisons.*$/i, "")
    .replace(/^the\s+(?:line graphs?|bar charts?|pie charts?|tables?|maps?|plans?|diagrams?)\s+(?:below\s+)?(?:shows?|show|illustrates?|illustrate|compares?|compare|gives?|give|presents?|present|provides?\s+information\s+about|provide\s+information\s+about)\s+/i, "")
    .replace(/^how\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  return cleaned || "the given data";
}

function extractYears(value) {
  return String(value || "").match(/\b(?:18|19|20)\d{2}\b/g) || [];
}

function extractTimePeriod(value) {
  const text = String(value || "");
  const fromTo = text.match(/\bfrom\s+((?:18|19|20)\d{2})\s+to\s+((?:18|19|20)\d{2})\b/i);
  if (fromTo) return `from ${fromTo[1]} to ${fromTo[2]}`;
  const betweenAnd = text.match(/\bbetween\s+((?:18|19|20)\d{2})\s+and\s+((?:18|19|20)\d{2})\b/i);
  if (betweenAnd) return `between ${betweenAnd[1]} and ${betweenAnd[2]}`;
  return "";
}

function extractMeasurementUnit(value) {
  const text = String(value || "");
  const perThousand = text.match(/\bper\s+(?:one\s+)?thousand\s+people\b|\bper\s+1,?000\s+people\b/i);
  if (perThousand) return "per thousand people";
  const measuredIn = text.match(/\bmeasured in\s+([^,.;]+)/i);
  if (measuredIn) return measuredIn[1].trim();
  const units = [
    "million tonnes",
    "millions of cubic meters",
    "millions of cubic metres",
    "percentage",
    "percentages",
    "pounds sterling",
    "kilometres",
    "kilometers",
    "hours",
    "minutes"
  ];
  return units.find((unit) => new RegExp(`\\b${escapeRegExp(unit)}\\b`, "i").test(text)) || "";
}

function extractTask1Countries(value) {
  const text = String(value || "");
  const candidates = [
    { label: "the USA", pattern: /\b(?:the\s+)?USA\b|\bUnited States(?: of America)?\b/i },
    { label: "the UK", pattern: /\b(?:the\s+)?UK\b|\bUnited Kingdom\b/i },
    { label: "Japan", pattern: /\bJapan\b/i },
    { label: "Germany", pattern: /\bGermany\b/i },
    { label: "Denmark", pattern: /\bDenmark\b/i },
    { label: "Australia", pattern: /\bAustralia\b/i },
    { label: "Canada", pattern: /\bCanada\b/i },
    { label: "France", pattern: /\bFrance\b/i },
    { label: "India", pattern: /\bIndia\b/i }
  ];
  return candidates.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function formatCountryList(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function getTask1VisualDescriptor(payload = {}, fallbackType = "bar chart") {
  const context = `${payload.prompt || ""} ${payload.visualType || ""}`;
  const normalizedType = canonicalTask1VisualType(fallbackType) || fallbackType;
  const nounByType = {
    "bar chart": "bar chart",
    "line graph": "line graph",
    "pie chart": "pie chart",
    map: "map",
    diagram: "diagram",
    process: "process",
    table: "table"
  };
  const pluralNounByType = {
    "bar chart": "bar charts",
    "line graph": "line graphs",
    "pie chart": "pie charts",
    map: "maps",
    diagram: "diagrams",
    process: "processes",
    table: "tables"
  };
  const singular = nounByType[normalizedType] || normalizedType;
  const pluralNoun = pluralNounByType[normalizedType] || `${singular}s`;
  const escapedPlural = escapeRegExp(pluralNoun);
  const plural = new RegExp(`\\b(?:two|three|four|five|multiple)\\s+${escapedPlural}\\b|\\b${escapedPlural}\\s+(?:below|above|show|compare|illustrate|provide|present)`, "i").test(context);
  return {
    noun: plural ? pluralNoun : singular,
    singular,
    plural
  };
}

function extractLocationPhrase(value) {
  const text = String(value || "");
  const inLocation = text.match(/\bin\s+(the\s+United Kingdom|the\s+UK|Australia|Britain|Turkey|India|Canada|Japan|Germany|France|Langley(?:\s+Village)?|City\s+[A-Z])\b/i);
  if (!inLocation) return "";
  return normalizeKnownLocation(inLocation[1]);
}

function normalizeKnownLocation(value) {
  const text = String(value || "").trim();
  if (/^the\s+UK$/i.test(text)) return "the United Kingdom";
  return text;
}

function extractTask1CategoryCount(value) {
  const text = String(value || "");
  const match = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:different\s+|distinct\s+|key\s+)?(?:age groups?|groups?|categories|countries|modes|sectors|types|classes|locations)\b/i);
  if (!match) return null;
  const valueNumber = parseCountWord(match[1]);
  return valueNumber ? { value: valueNumber, label: match[0] } : null;
}

function parseCountWord(value) {
  const text = String(value || "").toLowerCase();
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };
  return words[text] || Number.parseInt(text, 10) || 0;
}

function numberWord(value) {
  return {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten"
  }[value] || String(value);
}

function extractShortTask1ItemList(prompt) {
  const ageGroups = extractAgeGroupLabels(prompt);
  if (ageGroups.length >= 2 && ageGroups.length <= 4) return ageGroups;

  const modes = extractTransportModes(prompt);
  if (modes.length >= 2 && modes.length <= 4) return modes;

  const danceTypes = extractKnownItems(prompt, ["ballet", "tap", "modern dance"]);
  if (danceTypes.length >= 2 && danceTypes.length <= 4) return danceTypes;

  return [];
}

function extractAgeGroupLabels(value) {
  const text = String(value || "");
  const labels = [
    { label: "7-14", pattern: /\b7\s*[-–]\s*14\b|\b7\s+to\s+14\b/i },
    { label: "15-24", pattern: /\b15\s*[-–]\s*24\b|\b15\s+to\s+24\b/i },
    { label: "25-34", pattern: /\b25\s*[-–]\s*34\b|\b25\s+to\s+34\b/i },
    { label: "35 and over", pattern: /\b35\s*(?:\+|and\s+over|or\s+over|and\s+above)\b/i }
  ];
  return labels.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function extractTransportModes(value) {
  return extractKnownItems(value, ["road", "water", "rail", "pipeline"]);
}

function extractKnownItems(value, candidates) {
  const text = String(value || "");
  return candidates.filter((item) => new RegExp(`\\b${escapeRegExp(item)}\\b`, "i").test(text));
}

function formatInlineList(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function extractTask1FrequencyQualifier(value) {
  const text = String(value || "");
  const patterns = [
    /\bmore than once a month\b/i,
    /\bat least once a month\b/i,
    /\bonce a month or more\b/i,
    /\bonce a month\b/i,
    /\bper household\b/i,
    /\bper person\b/i,
    /\bannually\b/i,
    /\bdaily\b/i,
    /\bmonthly\b/i,
    /\baverage\b/i,
    /\btotal\b/i,
    /\bprojected\b/i,
    /\bactual\b/i
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match ? match[0].trim() : "";
}

function hasLineGraphDynamicFrame(value) {
  return /\b(changes?|trends?|changed|over time|movement|variation|fluctuation)\b/i.test(String(value || ""));
}

function revisionContainsAllItems(revision, items) {
  const normalized = normalizeEvidenceText(revision).replace(/[–—]/g, "-");
  return items.every((item) => normalized.includes(normalizeEvidenceText(item).replace(/[–—]/g, "-")));
}

function revisionContainsCategoryCount(revision, count) {
  if (!count?.value) return true;
  const text = normalizeEvidenceText(revision);
  return new RegExp(`\\b(?:${count.value}|${numberWord(count.value)})\\b`, "i").test(text);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMapPlace(value) {
  const text = String(value || "");
  const ofPlace = text.match(/\b(?:changes in|layout of|town of|village of)\s+([^,.]+?)(?:\s+(?:between|in|from)\b|[,.]|$)/i);
  if (ofPlace) return ofPlace[1].trim();
  const namedPlace = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Village|Town|Centre|Center)\b/);
  return namedPlace ? namedPlace[0].trim() : "";
}

function applyTask1RevisionQualityGuard(analysis, payload) {
  if (payload.taskType !== "Task 1") return analysis;

  const feedbackCards = Array.isArray(analysis.feedbackCards)
    ? analysis.feedbackCards.map((card) => repairTask1FeedbackCardRevision(card, payload))
    : [];

  return {
    ...analysis,
    feedbackCards
  };
}

function repairTask1FeedbackCardRevision(card, payload) {
  if (!card || typeof card !== "object") return card;

  const baseCard = isTask1IntroductionCard(card, payload) ? sanitizeTask1IntroFeedback(card) : card;
  const revision = String(baseCard.targetedRevision || "").trim();
  const cardText = [
    baseCard.issueType,
    baseCard.paragraphLocation,
    baseCard.sentenceFunction,
    baseCard.whyItLimitsBand,
    baseCard.kruPomDiagnosis
  ].filter(Boolean).join(" ");
  const isIntro = isTask1IntroductionCard(baseCard, payload);
  const isOverview = /\boverview\b/i.test(cardText);
  const isProcess = /process|cycle|manufactur|natural/i.test(String(payload.visualType || ""));
  let replacement = "";
  let reason = "";
  let action = "";

  if (isIntro && shouldRepairTask1IntroRevision(payload, revision)) {
    replacement = buildTask1IntroTargetedRevision(payload);
    reason = buildTask1IntroWhyStronger(payload);
    action = buildTask1IntroStudentAction(payload);
  } else if (isOverview && shouldRepairTask1OverviewRevision(payload, revision)) {
    replacement = buildTask1OverviewTargetedRevision(payload);
    reason = "This overview model is safer because it uses visual-type-appropriate language and avoids unsupported causes, purposes, benefits, or predictions.";
    action = "For Task 1 overviews, report only the safest dominant pattern, key contrast, or transformation before adding body details.";
  } else if (isProcess && /\bmain trends?\b/i.test(revision)) {
    replacement = buildTask1OverviewTargetedRevision(payload);
    reason = "This revision is safer because process diagrams need stages, sequence, mechanism, or endpoint language rather than trend language.";
    action = "For process diagrams, label the start, main stages, and endpoint; do not use chart words such as trend, highest, or lowest.";
  }

  if (!replacement || normalizeEvidenceText(replacement) === normalizeEvidenceText(revision)) {
    return baseCard;
  }

  return {
    ...baseCard,
    targetedRevision: replacement,
    kruPomDiagnosis: isIntro
      ? appendGuidance(baseCard.kruPomDiagnosis, buildTask1IntroDiagnosis(payload), /Kru Pom formula|Task 1 intro must/i)
      : baseCard.kruPomDiagnosis,
    whyRevisionIsStronger: isIntro
      ? reason
      : appendGuidance(baseCard.whyRevisionIsStronger, reason, /changes-over-time frame|visual-type-appropriate|process diagrams need stages|exact metric\/unit/i),
    studentAction: appendGuidance(baseCard.studentAction, action, /intro checklist|Task 1 introductions|Task 1 overviews|process diagrams/i)
  };
}

function isTask1IntroductionCard(card, payload) {
  const text = [card.issueType, card.paragraphLocation, card.sentenceFunction].filter(Boolean).join(" ");
  if (/\bintro(?:duction)?\b|paraphrase/i.test(text)) return true;

  const firstSentence = getSentenceRecords(payload.writing)[0]?.sentence || "";
  return Boolean(firstSentence && normalizeEvidenceText(firstSentence) === normalizeEvidenceText(card.exactSentence));
}

function sanitizeTask1IntroFeedback(card) {
  return {
    ...card,
    kruPomDiagnosis: removeTask1BodyStrategyFromIntro(card.kruPomDiagnosis),
    whyRevisionIsStronger: removeTask1BodyStrategyFromIntro(card.whyRevisionIsStronger),
    studentAction: removeTask1BodyStrategyFromIntro(card.studentAction)
  };
}

function removeTask1BodyStrategyFromIntro(value) {
  return String(value || "")
    .replace(/\s*Next-time line graph strategy:\s*group lines with similar trends and compare start\/end positions, major changes, and standout contrasts instead of describing every year\./gi, "")
    .replace(/\s*Before writing,\s*group the lines into similar trend groups, then choose only the start, end, peak\/low point, and biggest contrast\./gi, "")
    .replace(/\s*This strategy helps the overview and body paragraphs show the main movement clearly\./gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldRepairTask1IntroRevision(payload, revision) {
  if (!revision) return true;
  if (!TASK1_VISUAL_TYPE_PATTERN.test(revision)) return true;
  if (TASK1_PROMPT_LEAKAGE_PATTERN.test(revision)) return true;
  if (hasRepeatedVisualPhrase(revision)) return true;
  if (validateTask1VisualNumberAgreement(revision, payload).length) return true;
  if (hasTask1PromptOverlapRisk(payload.prompt, revision)) return true;
  if (TASK1_VAGUE_REVISION_PATTERN.test(revision) && !isTask1RevisionSpecific(revision)) return true;
  if (isMixedTask1Payload(payload) && /\b(the visuals|the charts|the figures|the information)\b/i.test(revision) && !hasMultipleVisualFunctions(revision)) return true;
  if (/process|cycle|manufactur|natural/i.test(String(payload.visualType || "")) && /\btrend|highest|lowest\b/i.test(revision)) return true;
  if (/map|plan/i.test(String(payload.visualType || "")) && /\btrend|percentage|figure\b/i.test(revision)) return true;
  if (/line/i.test(String(payload.visualType || "")) && !hasLineGraphDynamicFrame(revision)) return true;

  const items = extractShortTask1ItemList(payload.prompt);
  if (items.length >= 2 && items.length <= 4 && !revisionContainsAllItems(revision, items)) return true;

  const categoryCount = extractTask1CategoryCount(payload.prompt);
  if (categoryCount && categoryCount.value <= 8 && !revisionContainsCategoryCount(revision, categoryCount)) return true;

  const qualifier = extractTask1FrequencyQualifier(payload.prompt);
  if (qualifier && !normalizeEvidenceText(revision).includes(normalizeEvidenceText(qualifier))) return true;

  return false;
}

function shouldRepairTask1OverviewRevision(payload, revision) {
  if (!revision) return false;
  if (/process|cycle|manufactur|natural/i.test(String(payload.visualType || "")) && /\bmain trends?\b/i.test(revision)) return true;
  if (/map|plan/i.test(String(payload.visualType || "")) && /\b(to improve|because|in order to|so that|trend|percentage)\b/i.test(revision)) return true;
  return TASK1_VAGUE_REVISION_PATTERN.test(revision) && !isTask1RevisionSpecific(revision);
}

function isTask1RevisionSpecific(revision) {
  const text = String(revision || "");
  return TASK1_VISUAL_TYPE_PATTERN.test(text) && TASK1_MEASUREMENT_PATTERN.test(text) && text.split(/\s+/).length >= 9;
}

function hasMultipleVisualFunctions(revision) {
  return /\b(pie chart|bar chart|line graph|table|map|diagram)\b/i.test(revision) &&
    /\bwhile\b/i.test(revision) &&
    /\b(proportion|proportions|share|shares|number|numbers|compares?|illustrates?|presents?)\b/i.test(revision);
}

function isMixedTask1Payload(payload) {
  const text = `${payload.visualType || ""} ${payload.prompt || ""}`;
  const visualMatches = text.match(/\b(line graph|bar chart|pie chart|table|map|diagram|chart)\b/gi) || [];
  return /mixed|combination|multiple/i.test(String(payload.visualType || "")) || new Set(visualMatches.map((item) => item.toLowerCase())).size >= 2;
}

function hasTask1PromptOverlapRisk(prompt, revision) {
  const promptTokens = contentTokens(prompt);
  const revisionTokens = contentTokens(revision);
  if (promptTokens.length < 5 || revisionTokens.length < 5) return false;

  const promptSet = new Set(promptTokens);
  const revisionSet = new Set(revisionTokens);
  const sharedPromptRatio = promptTokens.filter((token) => revisionSet.has(token)).length / promptTokens.length;
  const sharedRevisionRatio = revisionTokens.filter((token) => promptSet.has(token)).length / revisionTokens.length;
  const onlyReportingVerbChanged = /\b(show|shows|showing)\b/i.test(String(prompt || "")) &&
    /\b(illustrate|illustrates|depict|depicts|present|presents|show|shows)\b/i.test(String(revision || ""));

  return sharedPromptRatio >= 0.78 && sharedRevisionRatio >= 0.68 && onlyReportingVerbChanged;
}

function buildTask1OverviewTargetedRevision(payload) {
  const visualType = String(payload.visualType || "").toLowerCase();

  if (/map|plan/.test(visualType)) {
    return "Overall, the area changed noticeably, with the main visible transformation coming from the replacement or addition of major features rather than from any stated reason for the changes.";
  }

  if (/process|cycle|manufactur|natural/.test(visualType)) {
    return "Overall, the process follows a clear sequence of stages, beginning with the initial input or material and ending with the final product or output shown in the diagram.";
  }

  if (/diagram|structure|mechanism/.test(visualType)) {
    return "Overall, the diagram highlights the main components of the system and shows how those parts work together to perform the stated function.";
  }

  if (/mixed|combination|multiple/.test(visualType)) {
    return "Overall, the report should summarise one safe main feature from each visual and connect them only where the relationship is directly supported.";
  }

  return "Overall, the strongest overview should identify the dominant category, the main increase or decrease, and the most important contrast without listing raw figures.";
}

function buildAnalysisFromCards({ payload, cards, criteriaNames, frameworkNames, mainScoreLimitingFactor, mostUrgentRepair, essayType, visualType }) {
  const normalizedCards = cards.length ? cards : [buildFallbackEvidenceCard(payload)];
  const criticalCount = normalizedCards.filter((card) => card.severity === "Critical").length;
  const estimatedBandRange = criticalCount >= 3 ? "5.5-6.0" : criticalCount >= 1 ? "6.0-6.5" : "6.5-7.0";
  const top3Issues = normalizedCards.slice(0, 3).map((card, index) => ({
    issueType: card.issueType,
    severity: card.severity,
    summary: `${card.paragraphLocation}: ${card.issueType} - ${card.exactSentence}`,
    feedbackCardId: `card-${index + 1}`,
    exactSentence: card.exactSentence,
    paragraphLocation: card.paragraphLocation
  }));

  return {
    taskType: payload.taskType,
    essayType,
    visualType,
    targetBand: payload.targetBand,
    generatedAt: new Date().toISOString(),
    estimatedBandRange,
    mainScoreLimitingFactor,
    mostUrgentRepair,
    criteriaScores: buildCriteriaScores(criteriaNames, normalizedCards, estimatedBandRange),
    kruPomScores: buildKruPomScores(frameworkNames, normalizedCards),
    top3Issues,
    feedbackCards: normalizedCards,
    paragraphFeedback: buildParagraphFeedback(payload.writing, normalizedCards),
    practicePlan: buildPracticePlan(payload.taskType, normalizedCards),
    disclaimer: DISCLAIMER,
    thaiDisclaimer: THAI_DISCLAIMER
  };
}

function buildCriteriaScores(criteriaNames, cards, fallbackRange) {
  const result = {};

  for (const name of criteriaNames) {
    const linkedCards = cards.filter((card) => (card.criteria || []).includes(name));
    const critical = linkedCards.some((card) => card.severity === "Critical");
    const needsWork = linkedCards.some((card) => card.severity === "Needs Work" || card.severity === "Moderate");
    const evidence = linkedCards[0]?.exactSentence || cards[0]?.exactSentence || "";

    result[name] = {
      range: critical ? "6.0-6.5" : needsWork ? "6.5" : fallbackRange,
      diagnosis: critical
        ? "คะแนนส่วนนี้ถูกจำกัดเพราะมีปัญหาหลักที่เห็นจากประโยคจริงของนักเรียน"
        : needsWork
          ? "ส่วนนี้พอใช้ได้ แต่ยังต้องเพิ่มความแม่นยำและ control"
          : "No major evidence issue was detected in this diagnostic pass.",
      evidence
    };
  }

  return result;
}

function buildKruPomScores(frameworkNames, cards) {
  const result = {};

  for (const name of frameworkNames) {
    const linkedCards = cards.filter((card) => (card.framework || []).some((item) => item.includes(name) || name.includes(item)));
    const critical = linkedCards.some((card) => card.severity === "Critical");
    const needsWork = linkedCards.length > 0;

    result[name] = {
      status: critical ? "Critical" : needsWork ? "Needs Work" : "Needs Verification",
      diagnosis: linkedCards[0]?.kruPomDiagnosis || "This framework item needs a full diagnostic review before it can be marked Strong."
    };
  }

  return result;
}

function buildParagraphFeedback(writing, cards) {
  const paragraphs = getParagraphs(writing);

  return paragraphs.map((paragraph, index) => {
    const paragraphCards = cards.filter((card) => card.paragraphLocation.startsWith(paragraphName(index, paragraphs.length)));
    const evidence = paragraphCards[0]?.exactSentence || splitSentences(paragraph)[0] || paragraph.slice(0, 160);

    return {
      paragraphLocation: paragraphName(index, paragraphs.length),
      exactEvidence: evidence,
      diagnosis: paragraphCards[0]?.kruPomDiagnosis || "คุณทำได้ดีที่มีย่อหน้านี้ชัดเจน แต่ยังควรตรวจ route, evidence, and link back ก่อนส่งงานจริง.",
      action: paragraphCards[0]?.studentAction || "Check whether this paragraph has a clear function: topic sentence, explanation, evidence, and link back."
    };
  });
}

function normalizeParagraphFeedback(items, payload, fallbackCards) {
  const normalized = Array.isArray(items)
    ? items.map((item) => normalizeParagraphItem(item)).filter(Boolean)
    : [];

  return normalized.length ? normalized : buildParagraphFeedback(payload.writing, fallbackCards);
}

function normalizeParagraphItem(item) {
  if (!item || typeof item !== "object") return null;

  const paragraphLocation = firstText(
    item.paragraphLocation,
    item.location,
    item.paragraph,
    item.paragraphName,
    item.section
  );
  const exactEvidence = firstText(
    item.exactEvidence,
    item.exactSentence,
    item.exactSentenceOrPhrase,
    item.exactPhrase,
    item.evidence,
    item.sentence
  );
  const diagnosis = firstText(
    item.diagnosis,
    item.kruPomDiagnosis,
    item.feedback,
    item.comment,
    item.routeDiagnosis,
    item.issue
  );
  const action = firstText(
    item.action,
    item.studentAction,
    item.repairAction,
    item.nextStep,
    item.suggestion
  );

  if (!exactEvidence || (!diagnosis && !action)) return null;

  return {
    paragraphLocation: paragraphLocation || "Paragraph",
    exactEvidence,
    diagnosis: diagnosis || "This paragraph needs a clearer route and function check.",
    action: action || "Review this paragraph's topic sentence, evidence, and link back."
  };
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function buildPracticePlan(taskType, cards) {
  const issueTypes = cards.map((card) => card.issueType).join(" | ");
  const isTask1 = taskType === "Task 1";

  const plan = [
    issueTypes.includes("Thesis")
      ? ["Rewrite thesis route", "Rewrite the thesis using the exact essay-type formula and make Body 1 / Body 2 route visible."]
      : issueTypes.includes("Overview") || isTask1
        ? ["Repair overview", "Rewrite the overview without raw data and show only the biggest visual patterns."]
        : ["Map the writing route", "Identify the main function of each paragraph and write a one-line route before editing."],
    issueTypes.includes("Topic Sentence") || issueTypes.includes("Grouping")
      ? ["Fix paragraph route", "Check topic sentences or grouping logic against the prompt and remove broad labels."]
      : ["Check paragraph function", "Label each paragraph as introduction, overview/thesis, body data/argument, or conclusion."],
    issueTypes.includes("Explanation")
      ? ["Add mechanism language", "Rewrite the weakest explanation using cause, process, and result language."]
      : ["Strengthen core explanation", "Choose one broad sentence and add specific academic details."],
    issueTypes.includes("SAR")
      ? ["Upgrade example with SAR", "Rewrite the weakest example using Specific Situation, Action, and Result."]
      : ["Add precise evidence", "Replace one vague example or data sentence with concrete evidence."],
    issueTypes.includes("Link") || issueTypes.includes("Tone")
      ? ["Repair closing control", "Rewrite paragraph endings so they link back to the argument or report data objectively."]
      : ["Improve cohesion", "Add one precise link sentence that connects the paragraph back to the main route."],
    issueTypes.includes("Vocabulary") || issueTypes.includes("Tone") || issueTypes.includes("Grouping")
      ? ["Revise lexical precision", "Remove vague or subjective wording and replace it with accurate academic wording."]
      : ["Polish vocabulary", "Replace repeated broad nouns with more precise IELTS topic vocabulary."],
    ["Rewrite and compare", "Rewrite the full response, then compare it with this diagnostic report before resubmitting."]
  ];

  return plan.map(([title, task], index) => ({ day: index + 1, title, task }));
}

function buildFallbackEvidenceCard(payload) {
  const first = getSentenceRecords(payload.writing)[0] || {
    location: "Paragraph 1, Sentence 1",
    sentence: payload.writing.slice(0, 160)
  };

  return {
    issueType: "Evidence-Based Route Check",
    severity: "Needs Work",
    criteria: payload.taskType === "Task 1" ? ["Task Achievement"] : ["Task Response"],
    framework: payload.taskType === "Task 1" ? ["Prompt Coverage"] : ["Prompt Coverage"],
    paragraphLocation: first.location,
    exactSentence: first.sentence,
    sentenceFunction: "This sentence is part of the student's response and needs route checking.",
    whyItLimitsBand: "The basic evidence check did not detect a stronger rule-based issue, so this sentence is flagged for teacher-style route review.",
    kruPomDiagnosis: "This sentence should be reviewed for route control, evidence quality, and link back before final submission.",
    targetedRevision: "Connect this sentence more directly to the prompt and make its function clear.",
    whyRevisionIsStronger: "A sentence with a clear function helps the examiner follow the route of the response.",
    studentAction: "Ask Kru Pom IELTS for a deeper evidence-based review if you need a more detailed diagnosis."
  };
}

function addCard(cards, used, card) {
  if (!card.exactSentence || used.has(card.exactSentence)) return;
  used.add(card.exactSentence);
  cards.push(card);
}

function applyTask1StrictGuardrails(analysis, payload) {
  if (payload.taskType !== "Task 1") return analysis;

  const feedbackCards = Array.isArray(analysis.feedbackCards) ? [...analysis.feedbackCards] : [];
  const guardrail = detectTask1StrictGuardrail(payload, feedbackCards);
  const providerCapInconsistent = isTask1ProviderCapInconsistent(analysis, feedbackCards);
  const sourceAnalysis = providerCapInconsistent ? removeTask1InconsistentCapFields(analysis) : analysis;
  const providerStrictMode = Boolean(sourceAnalysis.strictModeApplied || sourceAnalysis.taskAchievementCapReason);
  const strictModeApplied = providerStrictMode || guardrail.strictModeApplied;
  let top3Issues = sourceAnalysis.top3Issues;

  if (guardrail.strictModeApplied) {
    const cardResult = addOrUpdateTask1GuardrailCard(feedbackCards, new Set(feedbackCards.map((card) => card.exactSentence)), guardrail);
    if (cardResult.inserted && !hasTask1CapIssue(top3Issues)) top3Issues = [];
  }

  const next = {
    ...sourceAnalysis,
    feedbackCards: providerCapInconsistent ? downgradeInconsistentTask1CapCards(feedbackCards) : feedbackCards,
    taskAchievementCapReason: firstText(sourceAnalysis.taskAchievementCapReason, strictModeApplied ? guardrail.taskAchievementCapReason : ""),
    overviewAccuracyStatus: firstText(sourceAnalysis.overviewAccuracyStatus, guardrail.overviewAccuracyStatus),
    criticalOverviewError: Boolean(sourceAnalysis.criticalOverviewError || guardrail.criticalOverviewError),
    mainTrendRecognition: firstText(sourceAnalysis.mainTrendRecognition, guardrail.mainTrendRecognition),
    dataSelectionQuality: firstText(sourceAnalysis.dataSelectionQuality, guardrail.dataSelectionQuality),
    unsafeGeneralisationDetected: Boolean(sourceAnalysis.unsafeGeneralisationDetected || guardrail.unsafeGeneralisationDetected),
    majorOmissionDetected: Boolean(sourceAnalysis.majorOmissionDetected || guardrail.majorOmissionDetected),
    contradictionDetected: Boolean(sourceAnalysis.contradictionDetected || guardrail.contradictionDetected),
    dataAccuracyRisk: firstText(sourceAnalysis.dataAccuracyRisk, guardrail.dataAccuracyRisk),
    groupingLogicStatus: firstText(sourceAnalysis.groupingLogicStatus, guardrail.groupingLogicStatus),
    recommendedTaskAchievementRange: firstText(sourceAnalysis.recommendedTaskAchievementRange, guardrail.recommendedTaskAchievementRange),
    overallBandCap: firstText(sourceAnalysis.overallBandCap, guardrail.overallBandCap),
    strictModeApplied,
    top3Issues
  };

  if (!strictModeApplied) {
    return reconcileTask1UncappedConsistency(next, {
      providerCapInconsistent
    });
  }

  const recommendedRange = next.recommendedTaskAchievementRange || guardrail.recommendedTaskAchievementRange || "5.5-6.0";
  next.estimatedBandRange = chooseConservativeRange(next.estimatedBandRange, recommendedRange);
  next.estimatedBandRange = applyOverallBandCap(next.estimatedBandRange, next.overallBandCap);
  next.criteriaScores = {
    ...(next.criteriaScores || {}),
    "Task Achievement": buildCappedTaskAchievementScore(next.criteriaScores?.["Task Achievement"], recommendedRange, guardrail)
  };

  if (!String(next.mainScoreLimitingFactor || "").includes("overview")) {
    next.mainScoreLimitingFactor = `${next.taskAchievementCapReason} ${next.mainScoreLimitingFactor || ""}`.trim();
  }

  next.warnings = [
    ...(Array.isArray(next.warnings) ? next.warnings : []),
    "Task 1 strict overview and data-accuracy guardrail applied."
  ].filter((warning, index, list) => list.indexOf(warning) === index);

  return alignTask1CappedConsistency(next, guardrail);
}

function isTask1ProviderCapInconsistent(analysis = {}, cards = []) {
  const hasProviderCap = Boolean(
    analysis.strictModeApplied ||
    analysis.taskAchievementCapReason ||
    analysis.overallBandCap ||
    hasTask1CapLanguage(analysis.mainScoreLimitingFactor) ||
    hasTask1CapLanguage(analysis.mainScoreLimitingIssue) ||
    hasTask1CapLanguage(analysis.criteriaScores?.["Task Achievement"]?.diagnosis)
  );

  if (!hasProviderCap) return false;

  const overviewAccurate = isTask1OverviewAccurate(analysis.overviewAccuracyStatus);
  const overviewStrong = /^strong$/i.test(getTask1FrameworkStatus(analysis, "Overview Quality"));
  const criteriaHigh = areTask1CriteriaAtLeast(analysis.criteriaScores, 7);
  const lowOverall = Number.isFinite(getRangeMax(analysis.estimatedBandRange)) && getRangeMax(analysis.estimatedBandRange) <= 5.5;
  const hasValidCriticalEvidence = cards.some((card) => isTask1CriticalEvidenceCard(card));

  return !hasValidCriticalEvidence &&
    (criteriaHigh || (overviewAccurate && overviewStrong) || (lowOverall && (overviewAccurate || overviewStrong)));
}

function removeTask1InconsistentCapFields(analysis = {}) {
  const mainScoreLimitingFactor = cleanTask1CapLanguage(analysis.mainScoreLimitingFactor);
  const mainScoreLimitingIssue = cleanTask1CapLanguage(analysis.mainScoreLimitingIssue);

  return {
    ...analysis,
    mainScoreLimitingFactor: mainScoreLimitingFactor || TASK1_HIGH_BAND_LIMITER_MESSAGE,
    mainScoreLimitingIssue: mainScoreLimitingIssue || mainScoreLimitingFactor || TASK1_HIGH_BAND_LIMITER_MESSAGE,
    criteriaScores: cleanTask1CriteriaCaps(analysis.criteriaScores),
    top3Issues: filterTask1CapItems(analysis.top3Issues),
    taskAchievementCapReason: "",
    criticalOverviewError: false,
    recommendedTaskAchievementRange: "",
    overallBandCap: "",
    strictModeApplied: false,
    capsApplied: [],
    criticalFlags: [],
    severitySummary: "Only moderate Task 1 high-band limiters were detected; no critical overview cap is justified.",
    warnings: [
      ...(Array.isArray(analysis.warnings) ? analysis.warnings : []),
      "Task 1 consistency validator removed an inconsistent overview cap."
    ].filter((warning, index, list) => list.indexOf(warning) === index)
  };
}

function reconcileTask1UncappedConsistency(analysis = {}, options = {}) {
  const feedbackCards = Array.isArray(analysis.feedbackCards)
    ? analysis.feedbackCards
    : [];
  const hasValidCriticalEvidence = feedbackCards.some((card) => isTask1CriticalEvidenceCard(card));
  const criteriaHigh = areTask1CriteriaAtLeast(analysis.criteriaScores, 7);
  const currentMax = getRangeMax(analysis.estimatedBandRange);
  const next = {
    ...analysis,
    feedbackCards,
    taskAchievementCapReason: "",
    criticalOverviewError: false,
    recommendedTaskAchievementRange: "",
    overallBandCap: "",
    strictModeApplied: false,
    capsApplied: [],
    criticalFlags: filterTask1CapItems(analysis.criticalFlags),
    highBandLimiters: mergeUniqueArrays(
      analysis.highBandLimiters,
      collectTask1HighBandLimiters(feedbackCards, options.providerCapInconsistent)
    ),
    severitySummary: options.providerCapInconsistent
      ? "The Task 1 cap was removed because the report evidence supports only moderate high-band limiters, not a critical overview failure."
      : analysis.severitySummary
  };

  if (criteriaHigh && !hasValidCriticalEvidence && (!Number.isFinite(currentMax) || currentMax < 7)) {
    next.estimatedBandRange = deriveTask1RangeFromCriteria(next.criteriaScores);
  }

  if (options.providerCapInconsistent) {
    next.mainScoreLimitingFactor = TASK1_HIGH_BAND_LIMITER_MESSAGE;
    next.mainScoreLimitingIssue = TASK1_HIGH_BAND_LIMITER_MESSAGE;
    next.mostUrgentRepair = firstText(
      next.mostUrgentRepair,
      "Remove unsupported purpose language and make map-change verbs safer."
    );
  }

  return next;
}

function alignTask1CappedConsistency(analysis = {}, guardrail = {}) {
  const recommendedRange = analysis.recommendedTaskAchievementRange || guardrail.recommendedTaskAchievementRange || "5.5-6.0";
  const cap = analysis.overallBandCap || recommendedRange;
  const capReason = analysis.taskAchievementCapReason || TASK1_CAP_MESSAGE;

  return {
    ...analysis,
    taskAchievementCapReason: capReason,
    criticalOverviewError: true,
    strictModeApplied: true,
    capsApplied: [{
      criterion: "Task Achievement",
      reason: capReason,
      cap
    }],
    criticalFlags: mergeUniqueArrays(
      analysis.criticalFlags,
      ["Task 1 overview or data-accuracy cap"]
    ),
    severitySummary: "A critical or serious Task 1 overview/data-accuracy issue is present, so the Task Achievement cap must control the final range."
  };
}

function downgradeInconsistentTask1CapCards(cards = []) {
  return cards.map((card) => {
    if (!hasTask1CapLanguage(task1CardText(card)) || isTask1CriticalEvidenceCard(card)) {
      return card;
    }

    return {
      ...card,
      issueType: /overview accuracy cap|task achievement cap/i.test(String(card.issueType || ""))
        ? "Task 1 Map Precision Limiter"
        : card.issueType,
      severity: String(card.severity || "").toLowerCase() === "critical" ? "Moderate" : card.severity,
      whyItLimitsBand: cleanTask1CapLanguage(card.whyItLimitsBand) ||
        "This is a high-band precision or objective-reporting limiter, not a critical overview cap by itself.",
      kruPomDiagnosis: cleanTask1CapLanguage(card.kruPomDiagnosis) ||
        "Keep the feedback strict, but treat this as map-language precision unless the sentence clearly changes the main visual story."
    };
  });
}

function cleanTask1CriteriaCaps(criteriaScores = {}) {
  const cleaned = {};
  for (const [name, value] of Object.entries(criteriaScores || {})) {
    if (value && typeof value === "object") {
      cleaned[name] = {
        ...value,
        diagnosis: cleanTask1CapLanguage(value.diagnosis) || value.diagnosis
      };
      if (name === "Task Achievement" && hasTask1CapLanguage(value.diagnosis)) {
        cleaned[name].diagnosis = "Task Achievement is supported by an accurate overview and clear grouping; remaining issues are precision repairs rather than a critical cap.";
      }
    } else {
      cleaned[name] = value;
    }
  }
  return cleaned;
}

function collectTask1HighBandLimiters(cards = [], includeFallback = false) {
  const limiters = cards
    .filter((card) => !isTask1CriticalEvidenceCard(card))
    .filter((card) => !/^strong$/i.test(String(card.severity || "")))
    .slice(0, 4)
    .map((card) => {
      const issue = card.issueType || "Task 1 precision repair";
      const evidence = card.exactSentence ? `: ${truncate(card.exactSentence, 140)}` : "";
      return `${issue}${evidence}`;
    });

  if (!limiters.length && includeFallback) return [TASK1_HIGH_BAND_LIMITER_MESSAGE];
  return Array.from(new Set(limiters));
}

function deriveTask1RangeFromCriteria(criteriaScores = {}) {
  const ranges = TASK1_CRITERIA_NAMES.map((name) => criteriaScores?.[name]?.range || criteriaScores?.[name]);
  const mins = ranges.map(getRangeMin).filter((value) => Number.isFinite(value));
  const maxes = ranges.map(getRangeMax).filter((value) => Number.isFinite(value));
  if (mins.length !== TASK1_CRITERIA_NAMES.length || maxes.length !== TASK1_CRITERIA_NAMES.length) return "7.0";
  const lowestMin = Math.min(...mins);
  const lowestMax = Math.min(...maxes);

  if (lowestMin >= 7 && lowestMax >= 7.5) return "7.0-7.5";
  if (lowestMin >= 7) return "7.0";
  if (lowestMin >= 6.5 && lowestMax >= 7) return "6.5-7.0";
  return `${lowestMin.toFixed(1)}-${lowestMax.toFixed(1)}`;
}

function areTask1CriteriaAtLeast(criteriaScores = {}, threshold = 7) {
  return TASK1_CRITERIA_NAMES.every((name) => {
    const value = criteriaScores?.[name];
    const range = value && typeof value === "object" ? value.range : value;
    const min = getRangeMin(range);
    return Number.isFinite(min) && min >= threshold;
  });
}

function getTask1FrameworkStatus(analysis = {}, name) {
  const value = analysis.kruPomScores?.[name];
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return firstText(value.status, value.rating, value.level);
  return "";
}

function isTask1OverviewAccurate(status) {
  const text = String(status || "").toLowerCase();
  return /\baccurate\b/.test(text) && !/\b(inaccurate|incorrect|unsafe|missing|vague|limited|incomplete|weak|verification)\b/.test(text);
}

function isTask1CriticalEvidenceCard(card = {}) {
  const severity = String(card.severity || "").toLowerCase();
  if (!["critical", "serious"].includes(severity)) return false;

  const text = cleanTask1CapLanguage(task1CardText(card))
    .replace(/overview accuracy cap|task achievement cap/gi, " ")
    .toLowerCase();

  return /missing overview|wrong dominant|dominant transformation|contradict|major omission|major area|wrong time period|invent(?:ed|s)? major|not a proper task 1|false claim|misidentif|visual misunderstanding|data accuracy failure|major data|fails? to identify|does not identify the main|commercial.*residential|residential.*commercial|several .*distort|distort(?:s|ed)? the changes|vague overview/.test(text);
}

function task1CardText(card = {}) {
  return [
    card.issueType,
    card.severity,
    card.criteria,
    card.framework,
    card.exactSentence,
    card.whyItLimitsBand,
    card.kruPomDiagnosis,
    card.sentenceFunction,
    card.studentAction
  ].flat().filter(Boolean).join(" ");
}

function hasTask1CapLanguage(value) {
  const text = String(value || "");
  return text.includes(TASK1_CAP_MESSAGE) ||
    /task achievement.{0,40}cap|overview accuracy cap|critical overview|overview contains inaccurate|strict overview/i.test(text);
}

function cleanTask1CapLanguage(value) {
  return String(value || "")
    .replaceAll(TASK1_CAP_MESSAGE, "")
    .replace(/The main score-limiting issue is not grammar\. It is the inaccurate overview \/ visual interpretation\./gi, "")
    .replace(/\bTask Achievement (?:is )?cap(?:ped)?[^.]*\./gi, "")
    .replace(/\boverview accuracy cap\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function filterTask1CapItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !hasTask1CapLanguage(typeof item === "string" ? item : [
    item.issueType,
    item.title,
    item.summary,
    item.whyItLimitsBand,
    item.reason,
    item.cap
  ].filter(Boolean).join(" ")));
}

function detectTask1StrictGuardrail(payload, cards = []) {
  const records = getSentenceRecords(payload.writing);
  const overview = findTask1Overview(records);
  const secondSentence = records[1] || records[0];
  const unsafeOverview = overview && TASK1_UNSAFE_GENERALISATION_PATTERN.test(overview.sentence) ? overview : null;
  const unsafeRecord = unsafeOverview || records.find((record) => record !== overview && TASK1_NON_OVERVIEW_UNSAFE_GENERALISATION_PATTERN.test(record.sentence));
  const vagueOverview = overview && TASK1_VAGUE_OVERVIEW_PATTERN.test(overview.sentence) ? overview : null;
  const unsupportedMapOverviewInference = isTask1MapPayload(payload) && overview && TASK1_MAP_UNSUPPORTED_PURPOSE_PATTERN.test(overview.sentence)
    ? overview
    : null;
  const overviewIssueCards = cards.filter((card) => isTask1OverviewIssue(card));
  const criticalOverviewIssues = overviewIssueCards.filter((card) => card.severity === "Critical").length;
  const missingOverview = !overview;
  const unsafeGeneralisationDetected = Boolean(unsafeRecord);
  const vagueOverviewDetected = Boolean(vagueOverview);
  const unsupportedMapOverviewInferenceDetected = Boolean(unsupportedMapOverviewInference);
  const multipleIssues = criticalOverviewIssues >= 2 || (unsafeGeneralisationDetected && overviewIssueCards.length >= 1);
  const criticalOverviewError = missingOverview || unsafeGeneralisationDetected || multipleIssues || criticalOverviewIssues > 0;
  const strictModeApplied = criticalOverviewError || vagueOverviewDetected || unsupportedMapOverviewInferenceDetected;
  const evidenceRecord = unsafeRecord || unsupportedMapOverviewInference || vagueOverview || overview || secondSentence || records[0] || null;

  if (!strictModeApplied) {
    return {
      strictModeApplied: false,
      taskAchievementCapReason: "",
      overviewAccuracyStatus: payload.image ? "No major overview cap detected" : "Limited without image",
      criticalOverviewError: false,
      mainTrendRecognition: payload.image ? "Clear or not flagged" : "Limited without image",
      dataSelectionQuality: payload.image ? "Adequate" : "Limited without image",
      unsafeGeneralisationDetected: false,
      majorOmissionDetected: false,
      contradictionDetected: false,
      dataAccuracyRisk: payload.image ? "Low" : "Limited without image",
      groupingLogicStatus: "No major grouping cap detected",
      recommendedTaskAchievementRange: "",
      overallBandCap: "",
      evidenceRecord
    };
  }

  const recommendedTaskAchievementRange = missingOverview
    ? "5.0-5.5"
    : multipleIssues
      ? "5.0-5.5"
      : unsafeGeneralisationDetected
      ? "5.0-5.5"
      : vagueOverviewDetected
        ? "5.5-6.0"
        : unsupportedMapOverviewInferenceDetected
          ? "6.0-6.5"
          : "6.0-6.5";

  const overallBandCap = missingOverview || multipleIssues || unsafeGeneralisationDetected
    ? "5.5"
    : vagueOverviewDetected
      ? "6.0"
      : unsupportedMapOverviewInferenceDetected
        ? "6.5"
        : "6.5";

  const overviewAccuracyStatus = missingOverview
    ? "Missing overview"
    : unsafeGeneralisationDetected
      ? "Unsafe / needs verification"
      : unsupportedMapOverviewInferenceDetected
        ? "Unsafe / needs verification"
      : vagueOverviewDetected
        ? "Vague overview"
        : "Mostly accurate but incomplete or weakly grouped";

  const dataAccuracyRisk = missingOverview || multipleIssues || unsafeGeneralisationDetected
    ? "High"
    : payload.image
      ? "Medium"
      : "Limited without image";

  return {
    strictModeApplied: true,
    taskAchievementCapReason: TASK1_CAP_MESSAGE,
    overviewAccuracyStatus,
    criticalOverviewError,
    mainTrendRecognition: missingOverview
      ? "Missing"
      : unsafeGeneralisationDetected
        ? "Incorrect or unsafe"
        : unsupportedMapOverviewInferenceDetected
          ? "Partly recognized but unsafe"
        : vagueOverviewDetected
          ? "Vague"
          : "Partly recognized",
    dataSelectionQuality: missingOverview || unsafeGeneralisationDetected
      ? "Missing key data"
      : unsupportedMapOverviewInferenceDetected
        ? "Needs visible old-to-new evidence"
      : vagueOverviewDetected
        ? "Too general"
        : "Needs verification",
    unsafeGeneralisationDetected,
    majorOmissionDetected: missingOverview || vagueOverviewDetected,
    contradictionDetected: unsafeGeneralisationDetected && !payload.image,
    dataAccuracyRisk,
    groupingLogicStatus: overviewIssueCards.some((card) => /grouping|mechanical/i.test(card.issueType || ""))
      ? "Weak"
      : vagueOverviewDetected
        ? "Weak"
        : "Needs verification",
    recommendedTaskAchievementRange,
    overallBandCap,
    evidenceRecord
  };
}

function findTask1Overview(records) {
  const explicitOverview = records.find((record) => /^(overall|in general|generally|it is clear|it can be seen|as a whole)/i.test(record.sentence));
  if (explicitOverview) return explicitOverview;

  return records.find((record) =>
    record.paragraphIndex <= 1 &&
    record.sentenceIndex <= 1 &&
    /^(most|the most noticeable|the main|a major|the area|the town|the village|by the end|there was|there were)\b/i.test(record.sentence) &&
    /\b(changed|transformed|replaced|developed|expanded|removed|became|converted|redeveloped|increased|decreased|rose|fell|highest|lowest|largest|smallest)\b/i.test(record.sentence)
  );
}

function isTask1OverviewIssue(card) {
  const text = [
    card.issueType,
    card.whyItLimitsBand,
    card.kruPomDiagnosis,
    ...(Array.isArray(card.framework) ? card.framework : []),
    ...(Array.isArray(card.criteria) ? card.criteria : [])
  ].filter(Boolean).join(" ").toLowerCase();

  return text.includes("overview") ||
    text.includes("grouping") ||
    text.includes("data accuracy") ||
    text.includes("unsafe") ||
    text.includes("visual understanding") ||
    text.includes("comparison precision");
}

function addOrUpdateTask1GuardrailCard(cards, used, guardrail) {
  const exactSentence = guardrail.evidenceRecord?.sentence || "";
  if (!exactSentence) return { inserted: false };

  const existing = cards.find((card) => card.exactSentence === exactSentence && normalizeArray(card.criteria).includes("Task Achievement"));
  if (existing) {
    if (guardrail.criticalOverviewError) existing.severity = "Critical";
    existing.whyItLimitsBand = addCapMessage(existing.whyItLimitsBand);
    existing.criteria = mergeUniqueArrays(existing.criteria, ["Task Achievement"]);
    existing.framework = mergeUniqueArrays(existing.framework, ["Overview Quality", "Data Accuracy"]);
    return { inserted: false };
  }

  const card = {
    issueType: "Overview Accuracy Cap",
    severity: guardrail.criticalOverviewError ? "Critical" : "Needs Work",
    criteria: ["Task Achievement"],
    framework: ["Overview Quality", "Data Accuracy", "Comparison Precision"],
    paragraphLocation: guardrail.evidenceRecord.location || "Overview",
    exactSentence,
    sentenceFunction: "This sentence is trying to summarize the safest visible pattern in the visual.",
    whyItLimitsBand: `${TASK1_CAP_MESSAGE} The main score-limiting issue is not grammar. It is the inaccurate overview / visual interpretation.`,
    kruPomDiagnosis: "The overview must report only the safest visible main patterns. Avoid absolute claims unless every part of the visual clearly supports them.",
    targetedRevision: "Overall, the safest visible pattern is that the main categories move in different directions, so the overview should name only the clearly supported highest, lowest, or strongest changes.",
    whyRevisionIsStronger: "This revision avoids unsupported absolute language and focuses on visible Task 1 patterns.",
    studentAction: "Rewrite the overview by checking: highest, lowest, biggest change, exception, and whether any absolute claim is fully supported by the visual."
  };

  addCard(cards, used, card);
  return { inserted: true };
}

function addCapMessage(value) {
  const text = String(value || "").trim();
  if (text.includes(TASK1_CAP_MESSAGE)) return text;
  return `${TASK1_CAP_MESSAGE} ${text}`.trim();
}

function buildCappedTaskAchievementScore(value, recommendedRange, guardrail) {
  const score = typeof value === "object" && value
    ? { ...value }
    : { range: typeof value === "string" ? value : "" };

  score.range = chooseConservativeRange(score.range, recommendedRange);
  score.diagnosis = addCapMessage(score.diagnosis || "Overview/data accuracy limits Task Achievement in this Task 1 report.");
  score.evidence = firstText(score.evidence, guardrail.evidenceRecord?.sentence);
  return score;
}

function chooseConservativeRange(currentRange, capRange) {
  const currentMax = getRangeMax(currentRange);
  const capMax = getRangeMax(capRange);
  if (!Number.isFinite(currentMax) || !Number.isFinite(capMax)) return capRange || currentRange || "";
  return currentMax > capMax ? capRange : currentRange;
}

function applyOverallBandCap(currentRange, overallBandCap) {
  const capMax = getRangeMax(overallBandCap);
  if (!Number.isFinite(capMax)) return currentRange;

  const currentMax = getRangeMax(currentRange);
  if (Number.isFinite(currentMax) && currentMax <= capMax) return currentRange;

  const lower = Math.max(0, capMax - 0.5).toFixed(1);
  return `${lower}-${capMax.toFixed(1)}`;
}

function getRangeMax(value) {
  const numbers = String(value || "")
    .replace(/[–—−]/g, "-")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((number) => Number.isFinite(number)) || [];

  if (!numbers.length) return Number.NaN;
  return numbers.length === 1 ? numbers[0] : Math.max(...numbers);
}

function getRangeMin(value) {
  const numbers = String(value || "")
    .replace(/[–—−]/g, "-")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((number) => Number.isFinite(number)) || [];

  if (!numbers.length) return Number.NaN;
  return numbers.length === 1 ? numbers[0] : Math.min(...numbers);
}

function mergeUniqueArrays(...values) {
  return Array.from(new Set(values.flatMap((value) => normalizeArray(value))));
}

function hasTask1CapIssue(issues) {
  return Array.isArray(issues) && issues.some((issue) => {
    const text = [issue.issueType, issue.title, issue.summary, issue.whyItLimitsBand].filter(Boolean).join(" ");
    return text.includes(TASK1_CAP_MESSAGE) || /overview accuracy cap/i.test(text);
  });
}

function applyTask2StrictGuardrails(analysis, payload) {
  if (payload.taskType !== "Task 2") return analysis;

  const feedbackCards = Array.isArray(analysis.feedbackCards) ? [...analysis.feedbackCards] : [];
  const guardrail = detectTask2StrictGuardrail(payload, feedbackCards);
  const providerSeverity = classifyProviderTask2Severity(analysis, feedbackCards);
  const capSeverity = strongestSeverity(providerSeverity.capSeverity, guardrail.capSeverity);
  const strictModeApplied = shouldCapTask2Severity(capSeverity);
  const capReason = firstText(analysis.taskResponseCapReason, guardrail.taskResponseCapReason, providerSeverity.capReason, TASK2_CAP_MESSAGE);
  const highBandLimiters = mergeUniqueArrays(
    guardrail.highBandLimiters,
    providerSeverity.highBandLimiters
  );
  const capsApplied = strictModeApplied
    ? [{
      criterion: capSeverity === "critical" ? "Overall / Task Response" : "Task Response",
      reason: capReason,
      cap: firstText(analysis.overallBandCap, guardrail.overallBandCap, guardrail.recommendedTaskResponseRange)
    }]
    : [];

  const next = {
    ...analysis,
    feedbackCards,
    promptCoverageStatus: firstText(analysis.promptCoverageStatus, guardrail.promptCoverageStatus),
    thesisRouteStatus: firstText(analysis.thesisRouteStatus, guardrail.thesisRouteStatus),
    brokenPromiseDetected: Boolean(analysis.brokenPromiseDetected || guardrail.brokenPromiseDetected),
    bodyRouteAlignmentStatus: firstText(analysis.bodyRouteAlignmentStatus, guardrail.bodyRouteAlignmentStatus),
    SARExampleStatus: firstText(analysis.SARExampleStatus, guardrail.SARExampleStatus),
    intruderSentenceDetected: Boolean(analysis.intruderSentenceDetected || guardrail.intruderSentenceDetected),
    conclusionClosureStatus: firstText(analysis.conclusionClosureStatus, guardrail.conclusionClosureStatus),
    taskResponseCapReason: strictModeApplied ? capReason : "",
    overallBandCap: strictModeApplied ? firstText(analysis.overallBandCap, guardrail.overallBandCap) : "",
    strictModeApplied,
    taskRouteDiagnosis: guardrail.taskRouteDiagnosis,
    criticalFlags: guardrail.criticalFlags,
    capsApplied,
    severitySummary: guardrail.severitySummary,
    highBandLimiters,
    topRepairPriority: firstText(analysis.topRepairPriority, analysis.mostUrgentRepair, guardrail.topRepairPriority)
  };

  if (!strictModeApplied) {
    if (isTask2Band7Candidate(payload, next, guardrail)) {
      return applyTask2Band7Calibration(next, guardrail);
    }
    return next;
  }

  const recommendedRange = guardrail.recommendedTaskResponseRange || "6.0-6.5";
  next.estimatedBandRange = chooseConservativeRange(next.estimatedBandRange, recommendedRange);
  next.estimatedBandRange = applyOverallBandCap(next.estimatedBandRange, next.overallBandCap);
  next.criteriaScores = {
    ...(next.criteriaScores || {}),
    "Task Response": buildCappedTaskResponseScore(next.criteriaScores?.["Task Response"], recommendedRange, guardrail)
  };

  if (guardrail.coherenceCapRange) {
    next.criteriaScores["Coherence & Cohesion"] = buildCappedCoherenceScore(next.criteriaScores?.["Coherence & Cohesion"], guardrail.coherenceCapRange, guardrail);
  }

  next.warnings = [
    ...(Array.isArray(next.warnings) ? next.warnings : []),
    "Task 2 strict task-route guardrail applied."
  ].filter((warning, index, list) => list.indexOf(warning) === index);

  return next;
}

function detectTask2StrictGuardrail(payload, cards = []) {
  const records = getSentenceRecords(payload.writing);
  const paragraphs = getParagraphs(payload.writing);
  const introduction = records.filter((record) => record.paragraphIndex === 0);
  const thesisCandidate = introduction.at(-1)?.sentence || "";
  const writing = String(payload.writing || "");
  const promptAndType = `${payload.prompt || ""} ${payload.essayType || ""}`;
  const requiresOpinion = /\b(do you agree|to what extent|your opinion|give your own opinion|do you think|agree or disagree|opinion essay)\b/i.test(promptAndType);
  const hasPosition = /\b(i believe|i think|i agree|i disagree|in my view|in my opinion|my opinion|i would argue|i support|outweigh|do not outweigh|are more significant|is more beneficial)\b/i.test(writing);
  const missingPosition = requiresOpinion && !hasPosition;
  const bodyParagraphCount = Math.max(0, paragraphs.length - 2);
  const promisesMultipleParts = /\b(both views|advantages and disadvantages|problems and solutions|causes and solutions|three reasons|3 reasons|several reasons)\b/i.test(thesisCandidate);
  const brokenPromiseDetected = promisesMultipleParts && bodyParagraphCount < 2;
  const thesisRouteProblem = cards.some((card) => /thesis route|prompt coverage|missing position/i.test(card.issueType || ""));
  const bodyMisalignment = cards.some((card) => /body paragraph route|route alignment/i.test(card.issueType || ""));
  const topicSentenceRouteIssue = cards.some((card) => /topic sentence route/i.test(card.issueType || ""));
  const genericSar = cards.some((card) => /sar example|generic example|example failure/i.test(card.issueType || ""));
  const intruderSentenceDetected = records.some((record) => record.paragraphIndex > 0 && /\b(another point|another reason|also important is|new issue is)\b/i.test(record.sentence));
  const conclusion = records.filter((record) => record.paragraphIndex === paragraphs.length - 1 && paragraphs.length > 2);
  const conclusionNewIdea = conclusion.some((record) => /\bmoreover|in addition|another important|new solution|new reason\b/i.test(record.sentence));
  const repeatedDevelopmentFailure = countCards(cards, /explanation too general|sar example|generic example|example failure/i) >= 3;
  const seriousBodyRouteFailure = bodyMisalignment && !topicSentenceRouteIssue;
  const seriousTaskFailure = missingPosition || brokenPromiseDetected || seriousBodyRouteFailure || repeatedDevelopmentFailure;
  const capSeverity = missingPosition ? "critical" : seriousTaskFailure ? "serious" : "none";
  const strictModeApplied = shouldCapTask2Severity(capSeverity);

  const recommendedTaskResponseRange = missingPosition
    ? "5.5-6.0"
    : brokenPromiseDetected || seriousBodyRouteFailure
      ? "6.0-6.5"
      : repeatedDevelopmentFailure
        ? "6.0-6.5"
        : "";

  const overallBandCap = missingPosition || brokenPromiseDetected
    ? "6.0"
    : seriousBodyRouteFailure || repeatedDevelopmentFailure
      ? "6.5"
      : "";
  const highBandLimiters = [
    genericSar ? "Weak SAR / generic example is a high-band limiter, but it does not by itself cap a strong Task 2 essay below Band 7." : "",
    intruderSentenceDetected ? "One intruder sentence is a coherence limiter, but it is not a critical task-route failure by itself." : "",
    conclusionNewIdea ? "A new or broad final idea in the conclusion limits closure, but only caps if it disrupts the task route." : "",
    topicSentenceRouteIssue ? "A broad topic sentence needs repair, but one broad opener does not automatically block Band 7." : ""
  ].filter(Boolean);
  const criticalFlags = [
    missingPosition ? "Missing position" : "",
    brokenPromiseDetected ? "Broken promise" : "",
    seriousBodyRouteFailure ? "Body route misalignment" : "",
    repeatedDevelopmentFailure ? "Repeated underdevelopment" : ""
  ].filter(Boolean);

  return {
    strictModeApplied,
    capSeverity,
    promptCoverageStatus: missingPosition ? "Partially covered" : thesisRouteProblem ? "Needs verification" : "No major prompt omission detected",
    thesisRouteStatus: missingPosition ? "Missing position" : brokenPromiseDetected ? "Broken promise" : thesisRouteProblem ? "Weak" : "No major thesis cap detected",
    brokenPromiseDetected,
    bodyRouteAlignmentStatus: seriousBodyRouteFailure ? "Misaligned" : topicSentenceRouteIssue ? "Partly aligned" : "No major body-route cap detected",
    SARExampleStatus: genericSar ? "Relevant but underdeveloped" : "No major SAR cap detected",
    intruderSentenceDetected,
    conclusionClosureStatus: conclusionNewIdea ? "New idea introduced" : "No major conclusion cap detected",
    taskResponseCapReason: seriousTaskFailure
      ? TASK2_CAP_MESSAGE
      : "",
    recommendedTaskResponseRange,
    coherenceCapRange: seriousBodyRouteFailure ? "6.0-6.5" : "",
    overallBandCap,
    highBandLimiters,
    criticalFlags,
    severitySummary: strictModeApplied
      ? "Serious or critical score-limiting issue detected; a task response cap is justified."
      : highBandLimiters.length
        ? "Only minor/moderate high-band limiters detected; keep strict feedback, but do not cap below Band 7 solely for these issues."
        : "No major Task 2 route cap detected.",
    taskRouteDiagnosis: {
      promptCoverage: missingPosition ? "A required position is missing or unclear." : "No major prompt omission detected by the local guardrail.",
      thesisRoute: brokenPromiseDetected ? "The thesis promises more than the body delivers." : "No serious thesis-route cap detected.",
      bodyRoute: seriousBodyRouteFailure ? "Body route is misaligned with the thesis." : "Body route is acceptable unless provider evidence shows repeated failure.",
      development: repeatedDevelopmentFailure ? "Development is repeatedly generic or unsupported." : "Development may need high-band repair without automatic sub-7 cap."
    },
    topRepairPriority: highBandLimiters[0] || "Keep the position, paragraph route, and examples aligned with the prompt.",
    evidenceRecord: records.find((record) => /this essay|i believe|i think|for example|another point|moreover|in addition/i.test(record.sentence)) || records[0] || null
  };
}

function classifyProviderTask2Severity(analysis = {}, cards = []) {
  const statusText = [
    analysis.promptCoverageStatus,
    analysis.thesisRouteStatus,
    analysis.bodyRouteAlignmentStatus,
    analysis.SARExampleStatus,
    analysis.conclusionClosureStatus,
    analysis.taskResponseCapReason,
    analysis.overallBandCap,
    analysis.mainScoreLimitingFactor
  ].filter(Boolean).join(" ");
  const lower = statusText.toLowerCase();
  const highBandLimiters = [];
  let capSeverity = "none";

  if (/missing position|off-topic|memorized|not adapted|very limited prompt coverage/i.test(statusText)) {
    capSeverity = "critical";
  } else if (/broken promise|major part omitted|misaligned|direct question.*one question|only one question|mostly generic|repeated/i.test(statusText)) {
    capSeverity = "serious";
  }

  if (/sar|generic example|intruder|link-back|link back|conclusion|high-band|band 8/i.test(lower)) {
    highBandLimiters.push("Provider identified a high-band repair issue; it should not create a sub-7 cap unless it is repeated or route-breaking.");
    if (!/missing position|broken promise|major part omitted|misaligned|off-topic|memorized|mostly generic|repeated/i.test(lower)) {
      capSeverity = "none";
    }
  }

  for (const card of cards) {
    if (isModerateTask2Card(card)) {
      highBandLimiters.push(`${card.issueType || "Moderate issue"} is a high-band limiter, not an automatic sub-7 cap.`);
      continue;
    }
    if (isSeriousTask2Card(card)) {
      capSeverity = strongestSeverity(capSeverity, String(card.severity || "").toLowerCase() === "critical" ? "serious" : "moderate");
    }
  }

  return {
    capSeverity,
    capReason: shouldCapTask2Severity(capSeverity)
      ? TASK2_CAP_MESSAGE
      : "",
    highBandLimiters: Array.from(new Set(highBandLimiters))
  };
}

function isTask2Band7Candidate(payload, analysis, guardrail) {
  if (payload.taskType !== "Task 2") return false;
  if (shouldCapTask2Severity(guardrail.capSeverity)) return false;
  if (guardrail.criticalFlags?.length) return false;

  const writing = String(payload.writing || "");
  const paragraphs = getParagraphs(writing);
  const wordCount = writing.trim().split(/\s+/).filter(Boolean).length;
  const promptAndType = `${payload.prompt || ""} ${payload.essayType || ""}`;
  const isOutweigh = /advantage|disadvantage|outweigh/i.test(promptAndType);
  const hasClearPosition = /\b(i believe|i strongly believe|i firmly believe|i agree|i disagree|outweigh|do not outweigh|are more significant|is more beneficial)\b/i.test(writing);
  const hasConclusion = /\bin conclusion\b/i.test(writing);
  const hasExample = /\bfor example|for instance|such as\b/i.test(writing);
  const hasBodyRoute = isOutweigh
    ? /\badvantage|benefit|flexibility|personalized|disadvantage|drawback|sociali[sz]ation|character|development\b/i.test(writing)
    : paragraphs.length >= 4;
  const seriousCards = (analysis.feedbackCards || []).some((card) => isSeriousTask2Card(card));
  const alreadyHigh = getRangeMax(analysis.estimatedBandRange) >= 7 && getRangeMin(analysis.estimatedBandRange) >= 7;

  return !seriousCards &&
    hasClearPosition &&
    hasConclusion &&
    hasBodyRoute &&
    hasExample &&
    paragraphs.length >= 4 &&
    wordCount >= 230 &&
    (alreadyHigh || getRangeMax(analysis.estimatedBandRange) <= 7);
}

function applyTask2Band7Calibration(analysis, guardrail) {
  const feedbackCards = recalibrateTask2FeedbackCards(analysis.feedbackCards || []);
  const criteriaScores = {
    ...(analysis.criteriaScores || {})
  };

  criteriaScores["Task Response"] = ensureCriterionAtLeast(
    criteriaScores["Task Response"],
    "7.0-7.5",
    "Task Response reaches Band 7 range because the position, task route, prompt coverage, and main body development are clear; remaining issues are high-band repair points rather than serious task failure."
  );
  criteriaScores["Coherence & Cohesion"] = ensureCriterionAtLeast(
    criteriaScores["Coherence & Cohesion"],
    "7.0",
    "Paragraph progression is clear enough for Band 7; any weak link-back or isolated intruder sentence should be treated as a high-band limiter, not a sub-7 cap."
  );
  criteriaScores["Lexical Resource"] = ensureCriterionAtLeast(
    criteriaScores["Lexical Resource"],
    "7.0-7.5",
    "Vocabulary is strong enough for Band 7 range, with remaining word-choice issues treated as repair points."
  );
  criteriaScores["Grammatical Range & Accuracy"] = ensureCriterionAtLeast(
    criteriaScores["Grammatical Range & Accuracy"],
    "7.0-7.5",
    "Grammar is mostly controlled enough for Band 7 range, despite minor slips."
  );

  return {
    ...analysis,
    estimatedBandRange: ensureRangeAtLeast(analysis.estimatedBandRange, "7.0-7.5"),
    mainScoreLimitingFactor: guardrail.highBandLimiters?.[0] || "No serious Task Response cap was detected; remaining issues are high-band repair priorities.",
    mostUrgentRepair: guardrail.topRepairPriority || analysis.mostUrgentRepair,
    criteriaScores,
    feedbackCards,
    top3Issues: [],
    taskResponseCapReason: "",
    overallBandCap: "",
    strictModeApplied: false,
    capsApplied: [],
    highBandLimiters: guardrail.highBandLimiters || [],
    severitySummary: guardrail.severitySummary,
    warnings: [
      ...(Array.isArray(analysis.warnings) ? analysis.warnings : []),
      "Task 2 calibration applied: strict repair feedback was kept, but no serious task-response cap was applied."
    ].filter((warning, index, list) => list.indexOf(warning) === index)
  };
}

function recalibrateTask2FeedbackCards(cards) {
  return cards.map((card) => {
    if (!isModerateTask2Card(card)) return card;
    return {
      ...card,
      severity: String(card.severity || "").toLowerCase() === "critical" ? "Moderate" : card.severity
    };
  });
}

function ensureCriterionAtLeast(value, minimumRange, diagnosis) {
  const score = typeof value === "object" && value ? { ...value } : { range: "" };
  score.range = ensureRangeAtLeast(score.range, minimumRange);
  if (!score.diagnosis || /cap|capped|limited|จำกัด/i.test(score.diagnosis)) {
    score.diagnosis = diagnosis;
  }
  return score;
}

function ensureRangeAtLeast(currentRange, minimumRange) {
  const currentMin = getRangeMin(currentRange);
  const currentMax = getRangeMax(currentRange);
  const minimumMin = getRangeMin(minimumRange);

  if (!Number.isFinite(currentMin) || !Number.isFinite(currentMax)) return minimumRange;
  if (currentMin < minimumMin || currentMax < minimumMin) return minimumRange;
  return currentRange;
}

function isModerateTask2Card(card = {}) {
  const text = [card.issueType, card.framework, card.whyItLimitsBand, card.kruPomDiagnosis]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /sar example|generic example|example failure|weak link|link back|intruder|conclusion closure|topic sentence route|vocabulary|grammar|word choice|preposition/.test(text) &&
    !/missing position|broken promise|off-topic|memorized|prompt coverage failure|major part omitted/.test(text);
}

function isSeriousTask2Card(card = {}) {
  const severity = String(card.severity || "").toLowerCase();
  if (!["critical", "serious"].includes(severity)) return false;
  if (isModerateTask2Card(card)) return false;
  const text = [card.issueType, card.framework, card.whyItLimitsBand, card.kruPomDiagnosis]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /thesis route|prompt coverage|missing position|broken promise|body paragraph route|route alignment|off-topic|memorized|underdevelopment|explanation too general/.test(text);
}

function countCards(cards, pattern) {
  return cards.filter((card) => pattern.test(String(card.issueType || ""))).length;
}

function shouldCapTask2Severity(severity) {
  return ["serious", "critical"].includes(String(severity || "").toLowerCase());
}

function strongestSeverity(...values) {
  const rank = { none: 0, minor: 1, moderate: 2, serious: 3, critical: 4 };
  return values
    .map((value) => String(value || "none").toLowerCase())
    .sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0] || "none";
}

function buildCappedTaskResponseScore(value, recommendedRange, guardrail) {
  const score = typeof value === "object" && value
    ? { ...value }
    : { range: typeof value === "string" ? value : "" };

  score.range = chooseConservativeRange(score.range, recommendedRange);
  score.diagnosis = addTask2CapMessage(
    score.diagnosis || "Task Response is limited by route, prompt coverage, or development control.",
    guardrail.taskResponseCapReason
  );
  score.evidence = firstText(score.evidence, guardrail.evidenceRecord?.sentence);
  return score;
}

function buildCappedCoherenceScore(value, recommendedRange, guardrail) {
  const score = typeof value === "object" && value
    ? { ...value }
    : { range: typeof value === "string" ? value : "" };

  score.range = chooseConservativeRange(score.range, recommendedRange);
  score.diagnosis = `${score.diagnosis || "Coherence is limited by paragraph route or closure control."} Route control affects progression.`;
  score.evidence = firstText(score.evidence, guardrail.evidenceRecord?.sentence);
  return score;
}

function addTask2CapMessage(value, message = TASK2_CAP_MESSAGE) {
  const text = String(value || "").trim();
  if (text.includes(message)) return text;
  return `${message} ${text}`.trim();
}

function enrichFeedbackStrategies(cards = [], payload = {}) {
  const isTask1 = payload.taskType === "Task 1";
  return cards.map((card) => {
    const strategy = buildNextTimeStrategy(payload, card);
    if (!strategy) return isTask1 ? normalizeGeneratedFeedbackCard(card) : card;

    const append = isTask1 ? appendUniqueGuidance : appendGuidance;

    const enriched = {
      ...card,
      kruPomDiagnosis: append(card.kruPomDiagnosis, strategy.diagnosis, strategy.marker),
      whyRevisionIsStronger: append(card.whyRevisionIsStronger, strategy.why, strategy.marker),
      studentAction: append(card.studentAction, strategy.action, strategy.marker)
    };
    return isTask1 ? normalizeGeneratedFeedbackCard(enriched) : enriched;
  });
}

function enrichParagraphStrategies(items = [], payload = {}) {
  return items.map((item) => {
    const strategy = buildNextTimeStrategy(payload, {
      issueType: item.diagnosis,
      paragraphLocation: item.paragraphLocation,
      exactSentence: item.exactEvidence
    });
    if (!strategy) return item;
    const action = appendGuidance(item.action, strategy.action, strategy.marker);
    return {
      ...item,
      action: payload.taskType === "Task 1" ? dedupeGeneratedText(action) : action
    };
  });
}

function enrichPracticePlan(plan = [], payload = {}, cards = []) {
  const strategy = buildNextTimeStrategy(payload, cards[0] || {});
  if (!strategy) return plan;

  const planText = plan.map((item) => `${item.title || ""} ${item.task || item.action || ""}`).join(" ");
  if (strategy.marker.test(planText)) return plan;

  return [
    {
      day: 1,
      title: payload.taskType === "Task 1" ? "Next-time Task 1 strategy" : "Next-time essay strategy",
      task: strategy.action
    },
    ...plan
  ].slice(0, 7).map((item, index) => ({
    ...item,
    day: index + 1
  }));
}

function buildNextTimeStrategy(payload = {}, card = {}) {
  if (payload.taskType === "Task 1") return buildTask1NextTimeStrategy(payload, card);
  if (payload.taskType === "Task 2") {
    const essayType = String(payload.essayType || "Task 2").trim() || "Task 2";
    return {
      marker: /next-time essay strategy|thesis route|body route|SAR/i,
      diagnosis: `Next-time essay strategy: plan the ${essayType} route before writing, so the thesis promise, Body 1 route, Body 2 route, and conclusion closure all match.`,
      why: "This strategy improves the next essay because the examiner can see one controlled argument route rather than separate corrected sentences.",
      action: "Before writing, write a one-line thesis route, one Body 1 route, one Body 2 route, and one SAR example check; then remove any sentence that does not serve that route."
    };
  }
  return null;
}

function buildTask1NextTimeStrategy(payload = {}, card = {}) {
  const visualType = String(payload.visualType || "").toLowerCase();
  const context = `${payload.prompt || ""} ${payload.writing || ""}`;
  const exact = String(card.exactSentence || "");
  const cardContext = `${card.issueType || ""} ${card.paragraphLocation || ""} ${card.sentenceFunction || ""} ${card.whyItLimitsBand || ""} ${card.kruPomDiagnosis || ""}`;

  if (isTask1IntroductionCard(card, payload)) {
    return {
      marker: /intro checklist|Kru Pom formula|Task 1 intro must/i,
      diagnosis: buildTask1IntroDiagnosis(payload),
      why: buildTask1IntroWhyStronger(payload),
      action: buildTask1IntroStudentAction(payload)
    };
  }

  if (/map/.test(visualType)) {
    const isLangley = /langley/i.test(context);
    const hasPurposeInference = TASK1_MAP_UNSUPPORTED_PURPOSE_PATTERN.test(exact);
    return {
      marker: /old feature|location\/function|western\/northern|next-time map strategy/i,
      diagnosis: "Next-time map strategy: chronological organisation is understandable and not automatically wrong, but a stronger Band 7+ map report usually groups changes by location/function or old feature -> new feature so each body paragraph compares the two maps directly.",
      why: "This strategy makes the comparison visible to the examiner and prevents the body from reading like a list of old-year features followed by new-year features.",
      action: [
        "Before writing, make a quick Old Feature -> New Feature table, then choose body groups by location/function when that creates clearer comparison.",
        isLangley ? "For this Langley map, plan Body 1: western/northern residential redevelopment; Body 2: central/southern recreational changes plus eastern commercial expansion." : "",
        hasPurposeInference ? "Avoid purpose phrases unless the map explicitly gives the reason." : "Check each body paragraph contains direct old -> new comparison, not only separate year description."
      ].filter(Boolean).join(" ")
    };
  }

  if (/process/.test(visualType)) {
    return {
      marker: /process strategy|stages|endpoint/i,
      diagnosis: "Next-time process strategy: organise the report by stages or phases, identify the start point, main stages, and endpoint, and use process language rather than chart trend language.",
      why: "This strategy makes the mechanism and sequence clearer than a sentence-by-sentence correction.",
      action: "Before writing, label the start, phase 1, phase 2, and endpoint; avoid words like trend or main trends for a process."
    };
  }

  if (/line/.test(visualType)) {
    return {
      marker: /line graph strategy|similar trend|start\/end/i,
      diagnosis: "Next-time line graph strategy: group lines with similar trends and compare start/end positions, major changes, and standout contrasts instead of describing every year.",
      why: "This strategy helps the overview and body paragraphs show the main movement clearly.",
      action: "Before writing, group the lines into similar trend groups, then choose only the start, end, peak/low point, and biggest contrast."
    };
  }

  if (/bar/.test(visualType)) {
    if (/grammar|grammatical|word form|agreement|passive|tense|fragment|sentence boundar|collocation/i.test(cardContext)) {
      return null;
    }

    if (/overview/i.test(cardContext)) {
      return {
        marker: /dominant pattern|exception or contrast|overview strategy/i,
        diagnosis: "Next-time bar-chart overview strategy: identify the dominant pattern, the clearest exception and the broadest contrast without listing raw figures.",
        why: "This revision is stronger because it reports the dominant pattern and the necessary exception without turning the overview into a list of individual bars.",
        action: "Before writing the overview, note the main direction and one meaningful exception or contrast for each chart."
      };
    }

    if (/omission|coverage|data selection|grouping|comparison precision|country|category/i.test(cardContext)) {
      return {
        marker: /all major patterns, contrasts and exceptions|remaining categories when they are necessary/i,
        diagnosis: "Next-time bar-chart coverage strategy: ensure that all major patterns, contrasts and exceptions are represented. Include the remaining categories when they are necessary to complete the comparison.",
        why: "This revision is stronger because it completes the comparison through meaningful groups without requiring a mechanical bar-by-bar list.",
        action: "Group the remaining categories by increase, decrease, stability, ranking or contrast when they are needed to complete the visual comparison."
      };
    }

    return {
      marker: /bar chart strategy|ranking|outlier/i,
      diagnosis: "Next-time bar chart strategy: group categories by ranking, similarity, or contrast, identify leaders/outliers, and avoid listing every bar mechanically.",
      why: "This strategy makes the dominant category and key comparisons easier for the examiner to follow.",
      action: "Before writing, mark the highest, lowest, biggest gap, and any exception; build Body 1 and Body 2 around those groups."
    };
  }

  if (/pie/.test(visualType)) {
    return {
      marker: /pie chart strategy|major vs minor/i,
      diagnosis: "Next-time pie chart strategy: group major vs minor shares and, when there are multiple years, compare share increases/decreases safely.",
      why: "This strategy prevents over-reporting small slices and keeps the overview selective.",
      action: "Before writing, separate the largest shares from minor shares, then decide which changes are important enough to report."
    };
  }

  if (/table/.test(visualType)) {
    return {
      marker: /table strategy|row|column/i,
      diagnosis: "Next-time table strategy: identify highest/lowest figures and group rows or columns by pattern instead of reading the table cell by cell.",
      why: "This strategy turns dense data into controlled comparisons.",
      action: "Before writing, circle the highest/lowest values and group rows or columns that behave similarly."
    };
  }

  if (/mixed/.test(visualType)) {
    return {
      marker: /mixed graph strategy|relationship/i,
      diagnosis: "Next-time mixed graph strategy: decide whether to group by visual, variable, category, or relationship, and connect visuals only where the relationship is real.",
      why: "This strategy avoids overstuffed paragraphs and protects data precision.",
      action: "Before writing, choose one organising logic for Body 1 and Body 2, then add cross-visual links only when the data supports them."
    };
  }

  if (/diagram|structure/.test(visualType)) {
    return {
      marker: /diagram strategy|structure|mechanism/i,
      diagnosis: "Next-time diagram strategy: separate structure from mechanism, explain components and function, and avoid inventing purpose beyond what the diagram shows.",
      why: "This strategy keeps the report objective and prevents prompt-copying or invented explanation.",
      action: "Before writing, label the components first, then write the mechanism in sequence using only visible information."
    };
  }

  return {
    marker: /task 1 strategy|visual type/i,
    diagnosis: "Next-time Task 1 strategy: choose the body grouping from the visual type before writing, then make each paragraph serve that grouping.",
    why: "This strategy improves the next report because the examiner sees selection and comparison, not only corrected sentences.",
    action: "Before writing, identify the visual type, choose two body groups, and check that every body sentence belongs to one of those groups."
  };
}

function appendGuidance(value, addition, marker) {
  const text = String(value || "").trim();
  const extra = String(addition || "").trim();
  if (!extra) return text;
  if (marker?.test(text)) return text;
  return `${text}${text ? " " : ""}${extra}`.trim();
}

function appendUniqueGuidance(value, addition, marker) {
  const text = String(value || "").trim();
  const extra = String(addition || "").trim();
  if (!extra) return text;
  if (marker?.test(text)) return text;
  if (normalizeEvidenceText(text).includes(normalizeEvidenceText(extra))) return text;
  return `${text}${text ? " " : ""}${extra}`.trim();
}

function normalizeGeneratedFeedbackCard(card = {}) {
  return {
    ...card,
    targetedRevision: dedupeGeneratedText(card.targetedRevision),
    whyRevisionIsStronger: dedupeGeneratedText(card.whyRevisionIsStronger),
    kruPomDiagnosis: dedupeGeneratedText(card.kruPomDiagnosis),
    studentAction: dedupeGeneratedText(card.studentAction)
  };
}

function dedupeGeneratedText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const unique = [];
  const seen = new Set();
  for (const sentence of sentences) {
    const clean = sentence.trim();
    const key = normalizeEvidenceText(clean).replace(/[.!?]+$/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
  }
  return unique.join(" ").trim();
}

function normalizeAnalysis(analysis, payload) {
  const cards = Array.isArray(analysis.feedbackCards)
    ? analysis.feedbackCards.filter((card) => card?.exactSentence && card?.paragraphLocation)
    : [];

  const fallback = cards.length ? cards : [buildFallbackEvidenceCard(payload)];
  const guardedAnalysis = applyTask1RevisionQualityGuard(applyTask2StrictGuardrails(applyTask1StrictGuardrails({
    ...analysis,
    feedbackCards: fallback
  }, payload), payload), payload);
  const feedbackCards = enrichFeedbackStrategies(guardedAnalysis.feedbackCards || fallback, payload);
  const mainScoreLimitingFactor = reconcileTask1ExecutiveSummary(
    guardedAnalysis.mainScoreLimitingFactor,
    guardedAnalysis.criteriaScores,
    feedbackCards,
    guardedAnalysis,
    payload
  );
  const top3Issues = normalizeTopIssues(guardedAnalysis.top3Issues, feedbackCards);
  const paragraphFeedback = enrichParagraphStrategies(
    normalizeParagraphFeedback(guardedAnalysis.paragraphFeedback, payload, feedbackCards),
    payload
  );
  const practicePlan = enrichPracticePlan(
    Array.isArray(guardedAnalysis.practicePlan) && guardedAnalysis.practicePlan.length
      ? guardedAnalysis.practicePlan
      : buildPracticePlan(payload.taskType, feedbackCards),
    payload,
    feedbackCards
  );

  return {
    taskType: payload.taskType,
    essayType: guardedAnalysis.essayType || payload.essayType,
    visualType: guardedAnalysis.visualType || payload.visualType,
    targetBand: guardedAnalysis.targetBand || payload.targetBand,
    generatedAt: guardedAnalysis.generatedAt || new Date().toISOString(),
    analysisMode: guardedAnalysis.analysisMode || "Full diagnostic engine",
    estimatedBandRange: guardedAnalysis.estimatedBandRange || "6.0-6.5",
    mainScoreLimitingFactor: payload.taskType === "Task 1"
      ? dedupeGeneratedText(mainScoreLimitingFactor || "The main limiting factor needs evidence-based review.")
      : (mainScoreLimitingFactor || "The main limiting factor needs evidence-based review."),
    mostUrgentRepair: payload.taskType === "Task 1"
      ? dedupeGeneratedText(guardedAnalysis.mostUrgentRepair || "Repair the highest-severity exact-sentence issue first.")
      : (guardedAnalysis.mostUrgentRepair || "Repair the highest-severity exact-sentence issue first."),
    criteriaScores: guardedAnalysis.criteriaScores || {},
    kruPomScores: guardedAnalysis.kruPomScores || {},
    taskAchievementCapReason: guardedAnalysis.taskAchievementCapReason || "",
    overviewAccuracyStatus: guardedAnalysis.overviewAccuracyStatus || "",
    criticalOverviewError: Boolean(guardedAnalysis.criticalOverviewError),
    mainTrendRecognition: guardedAnalysis.mainTrendRecognition || "",
    dataSelectionQuality: guardedAnalysis.dataSelectionQuality || "",
    unsafeGeneralisationDetected: Boolean(guardedAnalysis.unsafeGeneralisationDetected),
    majorOmissionDetected: Boolean(guardedAnalysis.majorOmissionDetected),
    contradictionDetected: Boolean(guardedAnalysis.contradictionDetected),
    dataAccuracyRisk: guardedAnalysis.dataAccuracyRisk || "",
    groupingLogicStatus: guardedAnalysis.groupingLogicStatus || "",
    recommendedTaskAchievementRange: guardedAnalysis.recommendedTaskAchievementRange || "",
    promptCoverageStatus: guardedAnalysis.promptCoverageStatus || "",
    thesisRouteStatus: guardedAnalysis.thesisRouteStatus || "",
    brokenPromiseDetected: Boolean(guardedAnalysis.brokenPromiseDetected),
    bodyRouteAlignmentStatus: guardedAnalysis.bodyRouteAlignmentStatus || "",
    SARExampleStatus: guardedAnalysis.SARExampleStatus || "",
    intruderSentenceDetected: Boolean(guardedAnalysis.intruderSentenceDetected),
    conclusionClosureStatus: guardedAnalysis.conclusionClosureStatus || "",
    taskResponseCapReason: guardedAnalysis.taskResponseCapReason || "",
    overallBandCap: guardedAnalysis.overallBandCap || "",
    strictModeApplied: Boolean(guardedAnalysis.strictModeApplied),
    mainScoreLimitingIssue: guardedAnalysis.mainScoreLimitingIssue || mainScoreLimitingFactor || "",
    taskRouteDiagnosis: guardedAnalysis.taskRouteDiagnosis || {},
    criticalFlags: Array.isArray(guardedAnalysis.criticalFlags) ? guardedAnalysis.criticalFlags : [],
    capsApplied: Array.isArray(guardedAnalysis.capsApplied) ? guardedAnalysis.capsApplied : [],
    severitySummary: guardedAnalysis.severitySummary || "",
    highBandLimiters: Array.isArray(guardedAnalysis.highBandLimiters) ? guardedAnalysis.highBandLimiters : [],
    topRepairPriority: guardedAnalysis.topRepairPriority || guardedAnalysis.mostUrgentRepair || "",
    top3Issues,
    feedbackCards,
    paragraphFeedback,
    revisedThesis: guardedAnalysis.revisedThesis || "",
    revisedParagraphSuggestions: guardedAnalysis.revisedParagraphSuggestions || [],
    practicePlan,
    warnings: guardedAnalysis.warnings || [],
    disclaimer: guardedAnalysis.disclaimer || DISCLAIMER,
    thaiDisclaimer: guardedAnalysis.thaiDisclaimer || THAI_DISCLAIMER
  };
}

function reconcileTask1ExecutiveSummary(summary, criteriaScores = {}, cards = [], analysis = {}, payload = {}) {
  const text = String(summary || "").trim();
  if (payload.taskType !== "Task 1") return text;

  const grammarScore = criteriaScores?.["Grammatical Range & Accuracy"];
  const grammarMax = getRangeMax(grammarScore?.range || grammarScore);
  const grammarEvidence = cards.some((card) => /grammar|grammatical|agreement|passive|tense|word form|sentence fragment|sentence boundar/i.test(task1CardText(card)));
  const grammarIsMajor = (Number.isFinite(grammarMax) && grammarMax <= 6.0) || grammarEvidence;
  const coverageIsMajor = Boolean(analysis.majorOmissionDetected) || cards.some((card) => /omission|incomplete|coverage|data selection|overview limitation|missing key|fails? to cover/i.test(task1CardText(card)));
  const dismissesGrammar = /\b(?:main|primary|score-limiting)\b[^.]{0,80}\bnot\s+grammar\b|\bnot\s+grammar\b/i.test(text);

  if (dismissesGrammar && grammarIsMajor && coverageIsMajor) {
    return "The two main score-limiting factors are incomplete coverage of the visual information and inconsistent sentence-level grammar control.";
  }
  if (dismissesGrammar && grammarIsMajor) {
    return "Inconsistent sentence-level grammar control is a main score-limiting factor alongside the task-specific issue identified in the detailed report.";
  }
  return text;
}

export function validateReportOutput(analysis, payload = {}) {
  if (payload.taskType !== "Task 1") return analysis;

  const normalized = {
    ...analysis,
    mainScoreLimitingFactor: dedupeGeneratedText(analysis?.mainScoreLimitingFactor),
    mostUrgentRepair: dedupeGeneratedText(analysis?.mostUrgentRepair),
    feedbackCards: Array.isArray(analysis?.feedbackCards)
      ? analysis.feedbackCards.map(normalizeGeneratedFeedbackCard)
      : []
  };
  const issues = collectTask1ReportOutputIssues(normalized, payload);
  if (issues.length) throw reportOutputValidationError(issues);
  return normalized;
}

function collectTask1ReportOutputIssues(analysis, payload) {
  const issues = [];
  const requiredTopFields = [
    ["Executive Summary", analysis.mainScoreLimitingFactor],
    ["Most Urgent Repair", analysis.mostUrgentRepair]
  ];

  for (const [label, value] of requiredTopFields) {
    if (!isCompleteGeneratedField(value)) issues.push(`${label} is empty, fragmented, or incomplete.`);
    if (hasRepeatedMeaningfulSequence(value)) issues.push(`${label} contains duplicated generated text.`);
  }

  const grammarScore = analysis.criteriaScores?.["Grammatical Range & Accuracy"];
  const grammarMax = getRangeMax(grammarScore?.range || grammarScore);
  const grammarEvidence = analysis.feedbackCards.some((card) => /grammar|grammatical|agreement|passive|tense|word form|fragment|sentence boundar/i.test(task1CardText(card)));
  if (/\bnot\s+grammar\b/i.test(String(analysis.mainScoreLimitingFactor || "")) && ((Number.isFinite(grammarMax) && grammarMax <= 6.0) || grammarEvidence)) {
    issues.push("Executive Summary dismisses grammar despite low grammar control or repeated grammar evidence.");
  }

  for (const [index, card] of analysis.feedbackCards.entries()) {
    const prefix = `Feedback card ${index + 1}`;
    const generatedFields = [
      ["Targeted Revision", card.targetedRevision],
      ["Why This Revision Is Stronger", card.whyRevisionIsStronger],
      ["Kru Pom Diagnosis", card.kruPomDiagnosis],
      ["Student Action", card.studentAction]
    ];

    for (const [label, value] of generatedFields) {
      if (!isCompleteGeneratedField(value)) issues.push(`${prefix} ${label} is empty, fragmented, or incomplete.`);
      if (hasRepeatedMeaningfulSequence(value)) issues.push(`${prefix} ${label} contains duplicated generated text.`);
    }

    if (!isTask1IntroductionCard(card, payload)) continue;
    const revision = String(card.targetedRevision || "");
    if (TASK1_PROMPT_LEAKAGE_PATTERN.test(revision)) issues.push(`${prefix} Targeted Revision contains task-instruction leakage.`);
    if (hasRepeatedVisualPhrase(revision)) issues.push(`${prefix} Targeted Revision repeats a visual-type phrase.`);
    if (!isCompleteRevisionSentence(revision)) issues.push(`${prefix} Targeted Revision is not a complete grammatical sentence.`);
    issues.push(...validateTask1VisualNumberAgreement(revision, payload).map((issue) => `${prefix} ${issue}`));
    issues.push(...validateTask1ExplanationConsistency(card, payload).map((issue) => `${prefix} ${issue}`));
  }

  issues.push(...findRepeatedGenericFields(analysis.feedbackCards));
  return Array.from(new Set(issues));
}

function isCompleteGeneratedField(value) {
  const text = String(value || "").trim();
  if (!text || text.split(/\s+/).length < 4) return false;
  if (/^(?:targeted revision|student action|kru pom diagnosis|why this revision is stronger|executive summary|most urgent repair)\s*:?[.!]?$/i.test(text)) return false;
  if (/^(?:in addition|moreover|however|regarding|with regard to|on the other hand)[,.:;\s]*$/i.test(text)) return false;
  return true;
}

function isCompleteRevisionSentence(value) {
  const text = String(value || "").trim();
  if (!isCompleteGeneratedField(text) || !/[.!?]["']?$/.test(text)) return false;
  return /\b(?:is|are|was|were|has|have|had|shows?|show|compares?|compare|illustrates?|illustrate|presents?|present|depicts?|depict|reports?|report|rose|fell|declined|increased|decreased|remained|stayed|accounted|made|uses?|use|consists?|consist|follows?|follow|identifies?|identify|includes?|include|describes?|describe|provides?|provide|indicates?|indicate|changed|replaced|built|removed|converted|transported|attended)\b/i.test(text);
}

function hasRepeatedVisualPhrase(value) {
  const matches = String(value || "").match(TASK1_VISUAL_NOUN_PATTERN) || [];
  const counts = new Map();
  for (const match of matches) {
    const canonical = canonicalTask1VisualType(match) || match.toLowerCase().replace(/s$/, "");
    counts.set(canonical, (counts.get(canonical) || 0) + 1);
  }
  return Array.from(counts.values()).some((count) => count > 1);
}

function hasRepeatedMeaningfulSequence(value, size = 8) {
  const tokens = String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  if (tokens.length < size * 2) return false;
  const seen = new Map();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    const sequence = tokens.slice(index, index + size).join(" ");
    if (seen.has(sequence) && index - seen.get(sequence) >= size) return true;
    if (!seen.has(sequence)) seen.set(sequence, index);
  }
  return false;
}

function validateTask1VisualNumberAgreement(revision, payload) {
  const expected = getTask1VisualDescriptor(payload, canonicalTask1VisualType(payload.visualType || payload.prompt) || "bar chart");
  if (!expected.plural) return [];
  const singularPattern = new RegExp(`^\\s*The\\s+${escapeRegExp(expected.singular)}\\s+`, "i");
  if (singularPattern.test(revision)) return [`Targeted Revision uses singular ${expected.singular} although the task contains multiple visuals.`];
  return [];
}

function validateTask1ExplanationConsistency(card, payload) {
  const issues = [];
  const revision = normalizeEvidenceText(card.targetedRevision);
  const explanation = String(card.whyRevisionIsStronger || "");
  const context = `${payload.prompt || ""} ${payload.writing || ""}`;
  const unit = extractMeasurementUnit(context);
  const countries = extractTask1Countries(context);
  const years = Array.from(new Set(extractYears(payload.prompt || ""))).slice(0, 4);

  if (/\b(?:integrates?|includes?|keeps?|states?|gives?)\s+(?:the\s+)?(?:exact\s+)?(?:measurement\s+)?unit\b|\bunit\s+(?:clear|smoothly|correctly)\b/i.test(explanation)) {
    if (!unit || !revision.includes(normalizeEvidenceText(unit))) issues.push("Why This Revision Is Stronger claims a unit that the revision does not contain.");
  }
  if (/\b(?:lists?|names?|gives?|includes?)\s+(?:the\s+)?(?:five\s+)?countries\b/i.test(explanation) && countries.length) {
    const missing = countries.filter((country) => !revision.includes(normalizeEvidenceText(country).replace(/^the\s+/, "")));
    if (missing.length) issues.push("Why This Revision Is Stronger claims country coverage that the revision does not contain.");
  }
  if (/\b(?:two|both)\s+(?:bar\s+)?charts\b/i.test(explanation) && !/\bbar charts\b/i.test(card.targetedRevision)) {
    issues.push("Why This Revision Is Stronger claims two charts but the revision does not name plural bar charts.");
  }
  if (/\b(?:timeframe|years?|comparison years)\b/i.test(explanation) && years.length && years.some((year) => !revision.includes(year))) {
    issues.push("Why This Revision Is Stronger claims a timeframe that the revision does not fully contain.");
  }
  if (/changes-over-time frame|dynamic frame/i.test(explanation) && !hasLineGraphDynamicFrame(card.targetedRevision)) {
    issues.push("Why This Revision Is Stronger claims dynamic framing that the revision does not contain.");
  }
  return issues;
}

function findRepeatedGenericFields(cards = []) {
  const issues = [];
  for (const field of ["kruPomDiagnosis", "whyRevisionIsStronger", "studentAction"]) {
    const counts = new Map();
    for (const card of cards) {
      const value = normalizeEvidenceText(card?.[field]);
      if (value.split(/\s+/).length < 8) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    if (Array.from(counts.values()).some((count) => count >= 3)) {
      issues.push(`${field} repeats identical generic guidance across multiple feedback cards.`);
    }
  }
  return issues;
}

function reportOutputValidationError(issues) {
  const error = new Error(REPORT_OUTPUT_VALIDATION_MESSAGE);
  error.statusCode = 502;
  error.errorCode = "REPORT_OUTPUT_VALIDATION_FAILED";
  error.validationIssues = issues;
  error.debugHint = `Report output quality gate failed (${issues.slice(0, 8).join(" | ")}).`;
  return error;
}

function normalizeTopIssues(issues, feedbackCards) {
  const sourceIssues = Array.isArray(issues) ? issues.slice(0, 3) : [];
  const source = sourceIssues.length ? sourceIssues : feedbackCards.slice(0, 3);

  return source.map((issue, index) => {
    const card = feedbackCards[index] || {};
    const issueObject = issue && typeof issue === "object" ? issue : {};
    const issueType = firstText(
      issueObject.issueType,
      issueObject.title,
      issueObject.issue,
      card.issueType
    ) || "Evidence-based issue";
    const summary = firstText(
      issueObject.summary,
      issueObject.whyItLimitsBand,
      issueObject.whyItMatters,
      card.whyItLimitsBand,
      card.kruPomDiagnosis
    ) || "Click to view the exact sentence and diagnostic explanation.";
    const severity = firstText(issueObject.severity, card.severity) || "Needs Work";
    const criteria = normalizeArray(issueObject.criteria).length
      ? normalizeArray(issueObject.criteria)
      : normalizeArray(card.criteria);

    return {
      issueType,
      title: issueType,
      severity,
      criteria,
      summary,
      feedbackCardId: issueObject.feedbackCardId || `card-${index + 1}`,
      exactSentence: firstText(issueObject.exactSentence, card.exactSentence),
      paragraphLocation: firstText(issueObject.paragraphLocation, card.paragraphLocation),
      whyItLimitsBand: firstText(issueObject.whyItLimitsBand, card.whyItLimitsBand)
    };
  }).filter((issue) => issue.issueType || issue.summary);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }

  return parts.join("\n");
}

function parseJsonResponse(text, payload = null) {
  const raw = String(text || "");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Fall through to the structured provider parse error below.
      }
    }

    throw providerError("PROVIDER_JSON_PARSE_ERROR", {
      statusCode: 502,
      rawOutputPreview: truncate(raw, 1000),
      debugHint: `Provider returned text that could not be parsed as diagnostic JSON: ${error?.message || "JSON parse failed"}`,
      payload
    });
  }
}

function getParagraphs(writing) {
  return String(writing || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getSentenceRecords(writing) {
  const paragraphs = getParagraphs(writing);
  return paragraphs.flatMap((paragraph, paragraphIndex) => {
    return splitSentences(paragraph).map((sentence, sentenceIndex) => ({
      paragraphIndex,
      sentenceIndex,
      location: `${paragraphName(paragraphIndex, paragraphs.length)}, Sentence ${sentenceIndex + 1}`,
      sentence
    }));
  });
}

function paragraphName(index, total) {
  if (index === 0) return "Introduction";
  if (index === total - 1 && total > 2) return "Conclusion";
  return `Body Paragraph ${index}`;
}

function splitSentences(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return [];
  return compact.match(/[^.!?]+[.!?]+["”']?|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [compact];
}
