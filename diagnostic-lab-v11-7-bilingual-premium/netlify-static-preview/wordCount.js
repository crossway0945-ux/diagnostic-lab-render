const WORD_PATTERN = /[\p{L}\p{M}\p{N}]+(?:[.,](?=\p{N})\p{N}+)*(?:['-][\p{L}\p{M}\p{N}]+(?:[.,](?=\p{N})\p{N}+)*)*/gu;

export function normalizeEssayText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim();
}

export function countWords(value) {
  return normalizeEssayText(value).match(WORD_PATTERN)?.length || 0;
}

export function getWordCountMetadata(taskType, writing) {
  const minimumWordCount = taskType === "Task 1" ? 150 : 250;
  const wordCount = countWords(writing);
  const wordShortfall = Math.max(0, minimumWordCount - wordCount);

  return {
    wordCount,
    minimumWordCount,
    wordCountStatus: wordShortfall > 0 ? "below_minimum" : "meets_minimum",
    wordShortfall
  };
}
