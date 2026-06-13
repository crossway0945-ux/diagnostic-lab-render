import { buildPrompt } from "./promptBuilder.js";
import { buildDiagnosticResponseFormat } from "./diagnosticResponseSchema.js";

const DISCLAIMER = "This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners.";
const THAI_DISCLAIMER = "รายงานนี้เป็นการประเมินเชิง diagnostic ตาม IELTS Writing Criteria และ framework ของ Kru Pom IELTS ไม่ใช่คะแนนทางการจาก IELTS examiner";
const TASK1_CAP_MESSAGE = "Task Achievement is capped because the overview contains inaccurate or unsafe main trends.";
const TASK1_UNSAFE_GENERALISATION_PATTERN = /\b(across all groups|all countries|every category|the least preferred overall|the most common in all groups|the lowest across all groups|the highest in every case|always|never|completely|entirely)\b/i;
const TASK1_VAGUE_OVERVIEW_PATTERN = /\b(many changes|figures changed over time|changed over time|different trends|various changes|several changes|some (?:categories|figures|subjects|groups).*(?:increased|rose).*some (?:categories|figures|subjects|groups).*(?:decreased|fell)|shows? different trends)\b/i;
const TASK2_CAP_MESSAGE = "Task Response is capped because the response does not fully deliver the promised task route.";
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
  const parsed = extractParsedResponse(data) || parseJsonResponse(text, payload);
  const evidenceChecked = enforceEvidenceIntegrity(parsed, payload);

  return normalizeAnalysis({
    ...evidenceChecked,
    analysisMode: payload.image?.dataUrl ? "Full diagnostic engine with Task 1 image input" : "Full diagnostic engine",
    warnings: evidenceChecked.warnings || []
  }, payload);
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
  const providerStrictMode = Boolean(analysis.strictModeApplied || analysis.taskAchievementCapReason);
  const strictModeApplied = providerStrictMode || guardrail.strictModeApplied;
  let top3Issues = analysis.top3Issues;

  if (guardrail.strictModeApplied) {
    const cardResult = addOrUpdateTask1GuardrailCard(feedbackCards, new Set(feedbackCards.map((card) => card.exactSentence)), guardrail);
    if (cardResult.inserted && !hasTask1CapIssue(top3Issues)) top3Issues = [];
  }

  const next = {
    ...analysis,
    feedbackCards,
    taskAchievementCapReason: firstText(analysis.taskAchievementCapReason, strictModeApplied ? guardrail.taskAchievementCapReason : ""),
    overviewAccuracyStatus: firstText(analysis.overviewAccuracyStatus, guardrail.overviewAccuracyStatus),
    criticalOverviewError: Boolean(analysis.criticalOverviewError || guardrail.criticalOverviewError),
    mainTrendRecognition: firstText(analysis.mainTrendRecognition, guardrail.mainTrendRecognition),
    dataSelectionQuality: firstText(analysis.dataSelectionQuality, guardrail.dataSelectionQuality),
    unsafeGeneralisationDetected: Boolean(analysis.unsafeGeneralisationDetected || guardrail.unsafeGeneralisationDetected),
    majorOmissionDetected: Boolean(analysis.majorOmissionDetected || guardrail.majorOmissionDetected),
    contradictionDetected: Boolean(analysis.contradictionDetected || guardrail.contradictionDetected),
    dataAccuracyRisk: firstText(analysis.dataAccuracyRisk, guardrail.dataAccuracyRisk),
    groupingLogicStatus: firstText(analysis.groupingLogicStatus, guardrail.groupingLogicStatus),
    recommendedTaskAchievementRange: firstText(analysis.recommendedTaskAchievementRange, guardrail.recommendedTaskAchievementRange),
    overallBandCap: firstText(analysis.overallBandCap, guardrail.overallBandCap),
    strictModeApplied,
    top3Issues
  };

  if (!strictModeApplied) return next;

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

  return next;
}

function detectTask1StrictGuardrail(payload, cards = []) {
  const records = getSentenceRecords(payload.writing);
  const overview = findTask1Overview(records);
  const secondSentence = records[1] || records[0];
  const unsafeOverview = overview && TASK1_UNSAFE_GENERALISATION_PATTERN.test(overview.sentence) ? overview : null;
  const unsafeRecord = unsafeOverview || records.find((record) => TASK1_UNSAFE_GENERALISATION_PATTERN.test(record.sentence));
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
  const providerStrictMode = Boolean(analysis.strictModeApplied || analysis.taskResponseCapReason || analysis.overallBandCap);
  const strictModeApplied = providerStrictMode || guardrail.strictModeApplied;

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
    taskResponseCapReason: firstText(analysis.taskResponseCapReason, strictModeApplied ? guardrail.taskResponseCapReason : ""),
    overallBandCap: firstText(analysis.overallBandCap, guardrail.overallBandCap),
    strictModeApplied
  };

  if (!strictModeApplied) return next;

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
  const hasPosition = /\b(i believe|i think|i agree|i disagree|in my view|in my opinion|my opinion|i would argue|i support)\b/i.test(writing);
  const missingPosition = requiresOpinion && !hasPosition;
  const bodyParagraphCount = Math.max(0, paragraphs.length - 2);
  const promisesMultipleParts = /\b(both views|advantages and disadvantages|problems and solutions|causes and solutions|three reasons|3 reasons|several reasons)\b/i.test(thesisCandidate);
  const brokenPromiseDetected = promisesMultipleParts && bodyParagraphCount < 2;
  const thesisRouteProblem = cards.some((card) => /thesis route|prompt coverage|missing position/i.test(card.issueType || ""));
  const bodyMisalignment = cards.some((card) => /topic sentence route|body paragraph route|route alignment/i.test(card.issueType || ""));
  const genericSar = cards.some((card) => /sar example|generic example|example failure/i.test(card.issueType || ""));
  const intruderSentenceDetected = records.some((record) => record.paragraphIndex > 0 && /\b(another point|another reason|also important is|new issue is)\b/i.test(record.sentence));
  const conclusion = records.filter((record) => record.paragraphIndex === paragraphs.length - 1 && paragraphs.length > 2);
  const conclusionNewIdea = conclusion.some((record) => /\bmoreover|in addition|another important|new solution|new reason\b/i.test(record.sentence));
  const strictModeApplied = missingPosition || brokenPromiseDetected || bodyMisalignment || genericSar || intruderSentenceDetected || conclusionNewIdea;
  const severeTaskFailure = missingPosition || brokenPromiseDetected;

  const recommendedTaskResponseRange = missingPosition
    ? "5.5-6.0"
    : brokenPromiseDetected || bodyMisalignment
      ? "6.0"
      : genericSar
        ? "6.0-6.5"
        : "6.0-6.5";

  const overallBandCap = missingPosition || brokenPromiseDetected
    ? "6.0"
    : genericSar
      ? "6.5"
      : "";

  return {
    strictModeApplied,
    promptCoverageStatus: missingPosition ? "Partially covered" : thesisRouteProblem ? "Needs verification" : "No major prompt omission detected",
    thesisRouteStatus: missingPosition ? "Missing position" : brokenPromiseDetected ? "Broken promise" : thesisRouteProblem ? "Weak" : "No major thesis cap detected",
    brokenPromiseDetected,
    bodyRouteAlignmentStatus: bodyMisalignment ? "Misaligned" : "No major body-route cap detected",
    SARExampleStatus: genericSar ? "Generic" : "No major SAR cap detected",
    intruderSentenceDetected,
    conclusionClosureStatus: conclusionNewIdea ? "New idea introduced" : "No major conclusion cap detected",
    taskResponseCapReason: severeTaskFailure
      ? TASK2_CAP_MESSAGE
      : genericSar
        ? "Task Response is capped because examples remain generic and do not fully prove the argument through SAR."
        : "Task Response / Coherence is capped because the essay route is not fully controlled.",
    recommendedTaskResponseRange,
    coherenceCapRange: intruderSentenceDetected || conclusionNewIdea || bodyMisalignment ? "6.0-6.5" : "",
    overallBandCap,
    evidenceRecord: records.find((record) => /this essay|i believe|i think|for example|another point|moreover|in addition/i.test(record.sentence)) || records[0] || null
  };
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
