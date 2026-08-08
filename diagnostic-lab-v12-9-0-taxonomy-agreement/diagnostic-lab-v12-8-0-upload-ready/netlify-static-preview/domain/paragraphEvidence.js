import { normalizeVisibleText } from "./textIntegrity.js";

const CONCLUSION_PATTERN = /^(?:in conclusion|for conclusion|to conclude|to sum up|in summary|overall)\b/i;
const TASK1_OVERVIEW_PATTERN = /^(?:overall|in general|generally|it is clear that|it can be seen that)\b/i;
const TASK2_BODY_OPEN_PATTERN = /^(?:on (?:the )?one hand|first(?:ly| of all)?|to begin with|one (?:main|major|important) (?:reason|advantage|benefit|point))\b/i;
const TASK2_BODY_TRANSITION_PATTERN = /^(?:on the other hand|however|nevertheless|nonetheless|conversely|by contrast|in contrast|despite this|yet|second(?:ly)?|another (?:reason|view|point|issue|disadvantage|advantage))\b/i;
const PARAGRAPH_MAP_VERSION = "authoritative-paragraph-map-v12.9.8";

export function segmentStudentResponse(writing, taskType = "Task 2") {
  return buildAuthoritativeParagraphMap(writing, taskType).paragraphs;
}

export function buildAuthoritativeParagraphMap(writing, taskType = "Task 2") {
  const rawWriting = String(writing ?? "");
  const contentStart = firstNonWhitespaceOffset(rawWriting, 0, rawWriting.length);
  if (contentStart < 0) {
    return {
      version: PARAGRAPH_MAP_VERSION,
      taskType,
      method: "empty",
      confidence: "low",
      rawLength: rawWriting.length,
      paragraphs: [],
      audit: { pass: true, errors: [], paragraphCount: 0, sentenceCount: 0 }
    };
  }
  const contentEnd = lastNonWhitespaceOffset(rawWriting, contentStart, rawWriting.length) + 1;
  const boundaryRecords = collectParagraphBoundaries(rawWriting, contentStart, contentEnd, taskType);
  const boundaries = [...new Set([contentStart, ...boundaryRecords.map((item) => item.offset)])]
    .filter((offset) => offset >= contentStart && offset < contentEnd)
    .sort((left, right) => left - right);
  const spans = boundaries
    .map((startOffset, index) => trimRawSpan(rawWriting, startOffset, boundaries[index + 1] ?? contentEnd))
    .filter((span) => span && span.endOffset > span.startOffset);
  const paragraphTexts = spans.map((span) => rawWriting.slice(span.startOffset, span.endOffset));
  const paragraphs = spans.map((span, paragraphIndex) => {
    const paragraph = rawWriting.slice(span.startOffset, span.endOffset);
    const role = paragraphRole(paragraphTexts, paragraphIndex, taskType);
    let sentenceSearchStart = 0;
    const sentences = splitExactSentences(paragraph).map((sentence, sentenceIndex) => {
      const relativeStart = paragraph.indexOf(sentence, sentenceSearchStart);
      const resolvedRelativeStart = relativeStart >= 0 ? relativeStart : sentenceSearchStart;
      sentenceSearchStart = resolvedRelativeStart + sentence.length;
      const startOffset = span.startOffset + resolvedRelativeStart;
      return {
        sentenceNumber: sentenceIndex + 1,
        sentenceId: `paragraph-${paragraphIndex + 1}-sentence-${sentenceIndex + 1}`,
        exactText: sentence,
        normalizedText: normalizeComparable(sentence),
        startOffset,
        endOffset: startOffset + sentence.length,
        rawStartOffset: startOffset,
        rawEndOffset: startOffset + sentence.length,
        offsetBasis: "raw-writing",
        location: `${role}, Sentence ${sentenceIndex + 1}`
      };
    });
    return {
      paragraphNumber: paragraphIndex + 1,
      paragraphId: `paragraph-${paragraphIndex + 1}`,
      role,
      exactText: paragraph,
      normalizedText: normalizeComparable(paragraph),
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      rawStartOffset: span.startOffset,
      rawEndOffset: span.endOffset,
      offsetBasis: "raw-writing",
      boundaryEvidence: boundaryEvidenceAt(boundaryRecords, span.startOffset, paragraphIndex),
      sentences
    };
  });
  const method = paragraphMapMethod(boundaryRecords, paragraphs.length);
  const hasExplicitParagraphBreak = boundaryRecords.some((item) => item.kind === "blank-line");
  const map = {
    version: PARAGRAPH_MAP_VERSION,
    taskType,
    method,
    // Four coherent roles plus at least one author-supplied paragraph break is high-confidence.
    // A fully collapsed response can still be recovered from discourse markers, but the boundary
    // inference remains medium-confidence because the writer did not preserve paragraph breaks.
    confidence: paragraphs.length >= 4 && hasExplicitParagraphBreak ? "high" : paragraphs.length >= 2 ? "medium" : "low",
    rawLength: rawWriting.length,
    paragraphs
  };
  map.audit = auditParagraphMapConsistency(map, rawWriting, taskType);
  return map;
}

export function auditParagraphMapConsistency(map = {}, writing = "", taskType = "Task 2") {
  const rawWriting = String(writing ?? "");
  const paragraphs = Array.isArray(map.paragraphs) ? map.paragraphs : [];
  const errors = [];
  let priorEnd = -1;
  const ids = new Set();
  for (const [index, paragraph] of paragraphs.entries()) {
    if (paragraph.paragraphId !== `paragraph-${index + 1}`) errors.push(`PARAGRAPH_ID_SEQUENCE:${paragraph.paragraphId || index}`);
    if (ids.has(paragraph.paragraphId)) errors.push(`DUPLICATE_PARAGRAPH_ID:${paragraph.paragraphId}`);
    ids.add(paragraph.paragraphId);
    if (!Number.isInteger(paragraph.rawStartOffset) || !Number.isInteger(paragraph.rawEndOffset)) {
      errors.push(`RAW_OFFSETS_MISSING:${paragraph.paragraphId}`);
      continue;
    }
    if (paragraph.rawStartOffset < priorEnd || paragraph.rawEndOffset <= paragraph.rawStartOffset) {
      errors.push(`PARAGRAPH_SPAN_OVERLAP:${paragraph.paragraphId}`);
    }
    if (rawWriting.slice(paragraph.rawStartOffset, paragraph.rawEndOffset) !== paragraph.exactText) {
      errors.push(`RAW_SPAN_MISMATCH:${paragraph.paragraphId}`);
    }
    priorEnd = paragraph.rawEndOffset;
    for (const [sentenceIndex, sentence] of (paragraph.sentences || []).entries()) {
      const expectedLocation = `${paragraph.role}, Sentence ${sentenceIndex + 1}`;
      if (sentence.location !== expectedLocation) errors.push(`SENTENCE_LOCATION_MISMATCH:${sentence.sentenceId}`);
      if (rawWriting.slice(sentence.rawStartOffset, sentence.rawEndOffset) !== sentence.exactText) {
        errors.push(`SENTENCE_RAW_SPAN_MISMATCH:${sentence.sentenceId}`);
      }
    }
  }
  if (taskType === "Task 2") {
    const conclusion = paragraphs.find((paragraph) => paragraph.role === "Conclusion");
    const markerParagraph = paragraphs.find((paragraph) => CONCLUSION_PATTERN.test(paragraph.exactText));
    if (markerParagraph && markerParagraph.role !== "Conclusion") errors.push(`CONCLUSION_ROLE_MISMATCH:${markerParagraph.paragraphId}`);
    if (markerParagraph && conclusion !== markerParagraph) errors.push("CONCLUSION_MAP_CONTRADICTION");
  }
  return {
    version: PARAGRAPH_MAP_VERSION,
    pass: errors.length === 0,
    errors,
    paragraphCount: paragraphs.length,
    sentenceCount: paragraphs.reduce((total, paragraph) => total + (paragraph.sentences?.length || 0), 0),
    rawOffsetsPreserved: errors.every((error) => !/RAW_|SPAN_/.test(error))
  };
}

function collectParagraphBoundaries(rawWriting, contentStart, contentEnd, taskType) {
  const records = [];
  const push = (offset, kind, evidence) => {
    const resolved = firstNonWhitespaceOffset(rawWriting, offset, contentEnd);
    if (resolved > contentStart && resolved < contentEnd) records.push({ offset: resolved, kind, evidence });
  };
  const paragraphBreakPattern = /\r?\n[ \t]*(?:\r?\n[ \t]*)+/gu;
  for (const match of rawWriting.slice(contentStart, contentEnd).matchAll(paragraphBreakPattern)) {
    push(contentStart + (match.index || 0) + match[0].length, "blank-line", "explicit blank-line paragraph boundary");
  }
  if (taskType !== "Task 2") return records;

  const sentenceRecords = splitRawSentences(rawWriting, contentStart, contentEnd);
  let bodyOpenSeen = false;
  let bodyTransitionSeen = false;
  let conclusionSeen = false;
  for (const sentence of sentenceRecords) {
    const exact = sentence.exactText;
    // An author-supplied blank line after the introduction establishes that body development has
    // begun even when Body 1 has no stock discourse opener. This permits a later collapsed
    // “However” boundary while preventing an introduction-internal “However, I disagree ...” from
    // being misclassified as the start of Body 1.
    if (!bodyOpenSeen && !CONCLUSION_PATTERN.test(exact) &&
      records.some((record) => record.kind === "blank-line" && record.offset === sentence.startOffset)) {
      bodyOpenSeen = true;
    }
    if (!bodyOpenSeen && TASK2_BODY_OPEN_PATTERN.test(exact)) {
      push(sentence.startOffset, "structural-marker", exact.match(/^[^,.;:!?]+/)?.[0] || "body opening");
      bodyOpenSeen = true;
      continue;
    }
    if (bodyOpenSeen && !bodyTransitionSeen && TASK2_BODY_TRANSITION_PATTERN.test(exact)) {
      push(sentence.startOffset, "structural-marker", exact.match(/^[^,.;:!?]+/)?.[0] || "body transition");
      bodyTransitionSeen = true;
      continue;
    }
    if (!conclusionSeen && CONCLUSION_PATTERN.test(exact)) {
      push(sentence.startOffset, "structural-marker", exact.match(/^[^,.;:!?]+/)?.[0] || "conclusion transition");
      conclusionSeen = true;
    }
  }
  return records;
}

function splitRawSentences(rawWriting, contentStart, contentEnd) {
  const source = rawWriting.slice(contentStart, contentEnd);
  const records = [];
  let searchStart = 0;
  for (const exactText of splitExactSentences(source)) {
    const relativeStart = source.indexOf(exactText, searchStart);
    const resolvedStart = relativeStart >= 0 ? relativeStart : searchStart;
    records.push({
      exactText,
      startOffset: contentStart + resolvedStart,
      endOffset: contentStart + resolvedStart + exactText.length
    });
    searchStart = resolvedStart + exactText.length;
  }
  return records;
}

function trimRawSpan(rawWriting, startOffset, endOffset) {
  const start = firstNonWhitespaceOffset(rawWriting, startOffset, endOffset);
  if (start < 0) return null;
  return { startOffset: start, endOffset: lastNonWhitespaceOffset(rawWriting, start, endOffset) + 1 };
}

function firstNonWhitespaceOffset(value, start, end) {
  for (let index = start; index < end; index += 1) {
    if (!/\s/u.test(value[index])) return index;
  }
  return -1;
}

function lastNonWhitespaceOffset(value, start, end) {
  for (let index = end - 1; index >= start; index -= 1) {
    if (!/\s/u.test(value[index])) return index;
  }
  return -1;
}

function boundaryEvidenceAt(records, offset, paragraphIndex) {
  if (paragraphIndex === 0) return { kind: "response-start", evidence: "first non-whitespace character" };
  const record = records.find((item) => item.offset === offset);
  return record ? { kind: record.kind, evidence: record.evidence } : { kind: "derived", evidence: "authoritative ordered boundary" };
}

function paragraphMapMethod(records, paragraphCount) {
  if (!paragraphCount) return "empty";
  if (records.some((item) => item.kind === "structural-marker")) return "blank lines plus structural discourse markers";
  if (records.some((item) => item.kind === "blank-line")) return "explicit paragraph breaks";
  return "single paragraph fallback";
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
  const text = String(value || "");
  const sentences = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!/[.!?]/.test(text[index])) continue;
    let end = index + 1;
    while (/["'\u2019\u201D)\]]/.test(text[end] || "")) end += 1;
    if (end < text.length && !/\s/u.test(text[end])) continue;
    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    while (/\s/u.test(text[end] || "")) end += 1;
    start = end;
    index = end - 1;
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function paragraphRole(paragraphs, index, taskType) {
  if (index === 0) return "Introduction";
  const finalParagraph = paragraphs.at(-1) || "";
  if (taskType === "Task 1") {
    if (index === paragraphs.length - 1 && CONCLUSION_PATTERN.test(finalParagraph) && !TASK1_OVERVIEW_PATTERN.test(finalParagraph)) {
      return "Task 1 Conclusion";
    }
    const overviewIndex = paragraphs.findIndex((paragraph, paragraphIndex) => paragraphIndex > 0 && TASK1_OVERVIEW_PATTERN.test(paragraph));
    if (index === overviewIndex) return "Overview";
    const priorBodyCount = paragraphs.slice(1, index).filter((paragraph, paragraphIndex) => {
      const absoluteIndex = paragraphIndex + 1;
      return absoluteIndex !== overviewIndex && !(absoluteIndex === paragraphs.length - 1 && CONCLUSION_PATTERN.test(paragraph) && !TASK1_OVERVIEW_PATTERN.test(paragraph));
    }).length;
    return `Body Paragraph ${priorBodyCount + 1}`;
  }
  const explicitConclusionIndex = taskType === "Task 2"
    ? paragraphs.findIndex((paragraph, paragraphIndex) => paragraphIndex > 0 && CONCLUSION_PATTERN.test(paragraph))
    : -1;
  if (explicitConclusionIndex >= 0) {
    if (index === explicitConclusionIndex) return "Conclusion";
    // Content after an explicitly marked conclusion must not steal the Conclusion role. Keeping it
    // visible in the authoritative map lets downstream checks flag or review it without corrupting
    // sentence locations for the real conclusion.
    if (index > explicitConclusionIndex) return `Post-Conclusion Material ${index - explicitConclusionIndex}`;
  }
  const hasImplicitConclusion = taskType === "Task 2" && explicitConclusionIndex < 0 && paragraphs.length >= 4;
  if (hasImplicitConclusion && index === paragraphs.length - 1) return "Conclusion";
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
