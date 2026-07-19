import { normalizeVisibleText } from "./textIntegrity.js";

const CONCLUSION_PATTERN = /^(?:in conclusion|to conclude|to sum up|in summary|overall)\b/i;

export function segmentStudentResponse(writing, taskType = "Task 2") {
  const text = normalizeVisibleText(writing).trim();
  if (!text) return [];
  let paragraphs = text.split(/\n\s*\n+/u).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length < 2) {
    const lines = text.split(/\n+/u).map((item) => item.trim()).filter(Boolean);
    if (lines.length >= 3) paragraphs = lines;
  }
  if (!paragraphs.length) paragraphs = [text];
  return paragraphs.map((paragraph, paragraphIndex) => {
    const sentences = splitExactSentences(paragraph).map((sentence, sentenceIndex) => ({
      sentenceNumber: sentenceIndex + 1,
      exactText: sentence,
      location: `${paragraphRole(paragraphs, paragraphIndex, taskType)}, Sentence ${sentenceIndex + 1}`
    }));
    return {
      paragraphNumber: paragraphIndex + 1,
      role: paragraphRole(paragraphs, paragraphIndex, taskType),
      exactText: paragraph,
      sentences
    };
  });
}

export function buildSentenceCoverageAudit(writing, taskType, feedbackCards = [], paragraphFeedback = []) {
  const paragraphs = segmentStudentResponse(writing, taskType);
  const evidence = [...feedbackCards, ...paragraphFeedback]
    .flatMap((item) => [item?.exactSentence, item?.exactEvidence])
    .filter(Boolean)
    .map(normalizeComparable);
  const sentences = paragraphs.flatMap((paragraph) => paragraph.sentences.map((sentence) => ({
    ...sentence,
    paragraphRole: paragraph.role,
    considered: true,
    selectedAsEvidence: evidence.some((item) => item === normalizeComparable(sentence.exactText)),
    assessment: evidence.some((item) => item === normalizeComparable(sentence.exactText)) ? "feedback-evidence" : "reviewed-no-card"
  })));
  const analyticallyImportant = sentences.filter((item, index) => isAnalyticallyImportant(item, index, sentences.length));
  return {
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    importantSentenceCount: analyticallyImportant.length,
    consideredImportantSentenceCount: analyticallyImportant.filter((item) => item.considered).length,
    unconsideredImportantSentences: analyticallyImportant.filter((item) => !item.considered).map((item) => ({
      location: item.location,
      exactSentence: item.exactText
    })),
    sentences
  };
}

function splitExactSentences(value) {
  return String(value || "").match(/[^.!?]+(?:[.!?]+["'\u2019\u201D]?|$)/gu)?.map((item) => item.trim()).filter(Boolean) || [];
}

function paragraphRole(paragraphs, index, taskType) {
  if (index === 0) return "Introduction";
  const finalParagraph = paragraphs.at(-1) || "";
  const hasConclusion = taskType === "Task 2" && (paragraphs.length >= 4 || CONCLUSION_PATTERN.test(finalParagraph));
  if (hasConclusion && index === paragraphs.length - 1) return "Conclusion";
  return `Body Paragraph ${index}`;
}

function isAnalyticallyImportant(item, index, total) {
  if (item.sentenceNumber === 1) return true;
  if (item.paragraphRole === "Introduction" || item.paragraphRole === "Conclusion") return true;
  if (index === total - 1) return true;
  return /\b(?:for example|for instance|because|therefore|thus|hence|as a result|however|although|while|whereas)\b/i.test(item.exactText);
}

function normalizeComparable(value) {
  return normalizeVisibleText(value).replace(/\s+/gu, " ").trim().toLowerCase();
}
