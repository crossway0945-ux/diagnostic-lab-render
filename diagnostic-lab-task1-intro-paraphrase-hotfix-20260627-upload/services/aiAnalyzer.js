import { buildPrompt } from "./promptBuilder.js";
import { buildDiagnosticResponseFormat } from "./diagnosticResponseSchema.js";

const DISCLAIMER = "This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners.";
const THAI_DISCLAIMER = "รายงานนี้เป็นการประเมินเชิง diagnostic ตาม IELTS Writing Criteria และ framework ของ Kru Pom IELTS ไม่ใช่คะแนนทางการจาก IELTS examiner";
const TASK1_CAP_MESSAGE = "Task Achievement is capped because the overview contains inaccurate or unsafe main trends.";
const TASK1_UNSAFE_GENERALISATION_PATTERN = /\b(across all groups|all countries|every category|the least preferred overall|the most common in all groups|the lowest across all groups|the highest in every case|always|never|completely|entirely)\b/i;
const TASK1_NON_OVERVIEW_UNSAFE_GENERALISATION_PATTERN = /\b(across all groups|all countries|every category|the least preferred overall|the most common in all groups|the lowest across all groups|the highest in every case|always|never)\b/i;
const TASK1_VAGUE_OVERVIEW_PATTERN = /\b(many changes|figures changed over time|changed over time|different trends|various changes|several changes|some (?:categories|figures|subjects|groups).*(?:increased|rose).*some (?:categories|figures|subjects|groups).*(?:decreased|fell)|shows? different trends)\b/i;
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

  return buildLocalAnalysis(payload);
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
    if (error?.errorCode !== "PROVIDER_JSON_PARSE_ERROR") throw error;
    return runOpenAiAnalysisAttempt({
      config: {
        ...config,
        maxOutputTokens: Math.max(config.maxOutputTokens, 5000),
        reasoningEffort: config.reasoningEffort === "minimal" ? "low" : config.reasoningEffort
      },
      payload,
      prompt: buildRetryPrompt(prompt),
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

  return normalizeAnalysis({
    ...evidenceChecked,
    analysisMode: payload.image?.dataUrl ? "Full diagnostic engine with Task 1 image input" : "Full diagnostic engine",
    warnings: [
      ...(evidenceChecked.warnings || []),
      ...(isRetry ? ["The diagnostic engine automatically retried once because the first structured response was incomplete."] : [])
    ]
  }, payload);
}

function buildRetryPrompt(prompt) {
  return `${prompt}

CRITICAL STRUCTURED OUTPUT RETRY:
The previous structured response could not be parsed cleanly by the diagnostic app.
Return exactly one complete JSON object that matches the requested schema.
Do not use markdown fences, comments, prose before JSON, or prose after JSON.
Keep every diagnosis/action concise: 1 focused sentence per field where possible.
Do not omit required top-level fields, criteriaScores, kruPomScores, feedbackCards, paragraphFeedback, or practicePlan.
Use only exact student evidence copied from the student's writing for evidence fields.`;
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
  const overview = records.find((record) => /^(overall|in general|it is clear|it can be seen)/i.test(record.sentence));

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

function buildTask1IntroTargetedRevision(payload) {
  const visualType = String(payload.visualType || "").toLowerCase();
  const prompt = String(payload.prompt || "").toLowerCase();

  if (/solar panel|heat air|heat water|warm air|warm water/.test(prompt)) {
    return "The diagrams compare the basic components of a solar panel and illustrate how the device can warm air and water.";
  }

  if (/map/.test(visualType)) {
    return "The maps compare the layout of the area at the two given points and show the main changes in its development.";
  }

  if (/process/.test(visualType)) {
    return "The diagram illustrates the stages involved in the process and shows how the sequence is completed.";
  }

  if (/diagram|structure/.test(visualType)) {
    return "The diagrams show the main parts of the device and explain how it is used.";
  }

  if (/pie/.test(visualType)) {
    return "The pie charts compare the proportions of the given categories across the specified groups or time periods.";
  }

  if (/table/.test(visualType)) {
    return "The table compares figures for the given categories across the specified groups or time periods.";
  }

  if (/line/.test(visualType)) {
    return "The line graph shows how the given figures changed over the period.";
  }

  if (/mixed/.test(visualType)) {
    return "The visuals present related information about the given topic and compare the main data groups.";
  }

  return "The bar chart compares figures for the given categories across the specified groups or time periods.";
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
  const overviewIssueCards = cards.filter((card) => isTask1OverviewIssue(card));
  const criticalOverviewIssues = overviewIssueCards.filter((card) => card.severity === "Critical").length;
  const missingOverview = !overview;
  const unsafeGeneralisationDetected = Boolean(unsafeRecord);
  const vagueOverviewDetected = Boolean(vagueOverview);
  const multipleIssues = criticalOverviewIssues >= 2 || (unsafeGeneralisationDetected && overviewIssueCards.length >= 1);
  const criticalOverviewError = missingOverview || unsafeGeneralisationDetected || multipleIssues || criticalOverviewIssues > 0;
  const strictModeApplied = criticalOverviewError || vagueOverviewDetected;
  const evidenceRecord = unsafeRecord || vagueOverview || overview || secondSentence || records[0] || null;

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
          : "6.0-6.5";

  const overallBandCap = missingOverview || multipleIssues || unsafeGeneralisationDetected
    ? "5.5"
    : vagueOverviewDetected
      ? "6.0"
      : "6.5";

  const overviewAccuracyStatus = missingOverview
    ? "Missing overview"
    : unsafeGeneralisationDetected
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
        : vagueOverviewDetected
          ? "Vague"
          : "Partly recognized",
    dataSelectionQuality: missingOverview || unsafeGeneralisationDetected
      ? "Missing key data"
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
  return records.find((record) => /^(overall|in general|generally|it is clear|it can be seen|as a whole)/i.test(record.sentence));
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

function normalizeAnalysis(analysis, payload) {
  const cards = Array.isArray(analysis.feedbackCards)
    ? analysis.feedbackCards.filter((card) => card?.exactSentence && card?.paragraphLocation)
    : [];

  const fallback = cards.length ? cards : [buildFallbackEvidenceCard(payload)];
  const guardedAnalysis = applyTask2StrictGuardrails(applyTask1StrictGuardrails({
    ...analysis,
    feedbackCards: fallback
  }, payload), payload);
  const feedbackCards = guardedAnalysis.feedbackCards || fallback;
  const top3Issues = normalizeTopIssues(guardedAnalysis.top3Issues, feedbackCards);

  return {
    taskType: payload.taskType,
    essayType: guardedAnalysis.essayType || payload.essayType,
    visualType: guardedAnalysis.visualType || payload.visualType,
    targetBand: guardedAnalysis.targetBand || payload.targetBand,
    generatedAt: guardedAnalysis.generatedAt || new Date().toISOString(),
    analysisMode: guardedAnalysis.analysisMode || "Full diagnostic engine",
    estimatedBandRange: guardedAnalysis.estimatedBandRange || "6.0-6.5",
    mainScoreLimitingFactor: guardedAnalysis.mainScoreLimitingFactor || "The main limiting factor needs evidence-based review.",
    mostUrgentRepair: guardedAnalysis.mostUrgentRepair || "Repair the highest-severity exact-sentence issue first.",
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
    mainScoreLimitingIssue: guardedAnalysis.mainScoreLimitingIssue || guardedAnalysis.mainScoreLimitingFactor || "",
    taskRouteDiagnosis: guardedAnalysis.taskRouteDiagnosis || {},
    criticalFlags: Array.isArray(guardedAnalysis.criticalFlags) ? guardedAnalysis.criticalFlags : [],
    capsApplied: Array.isArray(guardedAnalysis.capsApplied) ? guardedAnalysis.capsApplied : [],
    severitySummary: guardedAnalysis.severitySummary || "",
    highBandLimiters: Array.isArray(guardedAnalysis.highBandLimiters) ? guardedAnalysis.highBandLimiters : [],
    topRepairPriority: guardedAnalysis.topRepairPriority || guardedAnalysis.mostUrgentRepair || "",
    top3Issues,
    feedbackCards,
    paragraphFeedback: normalizeParagraphFeedback(guardedAnalysis.paragraphFeedback, payload, feedbackCards),
    revisedThesis: guardedAnalysis.revisedThesis || "",
    revisedParagraphSuggestions: guardedAnalysis.revisedParagraphSuggestions || [],
    practicePlan: Array.isArray(guardedAnalysis.practicePlan) && guardedAnalysis.practicePlan.length
      ? guardedAnalysis.practicePlan
      : buildPracticePlan(payload.taskType, feedbackCards),
    warnings: guardedAnalysis.warnings || [],
    disclaimer: guardedAnalysis.disclaimer || DISCLAIMER,
    thaiDisclaimer: guardedAnalysis.thaiDisclaimer || THAI_DISCLAIMER
  };
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
