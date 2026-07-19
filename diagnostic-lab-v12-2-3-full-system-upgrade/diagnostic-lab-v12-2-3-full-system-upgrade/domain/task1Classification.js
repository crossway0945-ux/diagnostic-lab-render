export const TASK1_PUBLIC_VISUAL_TYPES = Object.freeze([
  "Line Graph",
  "Bar Chart",
  "Pie Chart",
  "Table",
  "Map",
  "Diagram",
  "Mixed / Combination Visuals",
  "Not Sure / Auto-detect"
]);

export function classifyTask1Visual(payload = {}) {
  const prompt = String(payload.prompt || "").toLowerCase().replace(/\s+/g, " ");
  const selected = normalizeTask1PublicVisualType(payload.publicVisualType || payload.visualType);
  const hits = [];
  const add = (publicVisualType, internalVisualSubtype, pattern, signal) => {
    if (pattern.test(prompt)) hits.push({ publicVisualType, internalVisualSubtype, signal });
  };

  add("Line Graph", "line-graph", /\bline graphs?\b/, "line graph");
  add("Bar Chart", "bar-chart", /\bbar charts?\b/, "bar chart");
  add("Pie Chart", "pie-chart", /\bpie charts?\b/, "pie chart");
  add("Table", "table", /\btables?\b/, "table");
  add("Map", "map", /\bmaps?|plans?\b/, "map or plan");

  const processSignal = /\bprocess(?:es)?\b|\bstages?\b|\bcycle\b|\bhow\s+.+?\s+(?:is|are)\s+(?:made|produced|manufactured|recycled)|\bproduction of\b/.test(prompt);
  const structuralSignal = /\bcomponents?\b|\bparts?\b|\bstructure\b|\bcross[- ]section\b|\bmechanism\b|\bhow\s+(?:a|an|the)\s+.+?\s+works?\b|\bused to (?:heat|warm|operate|generate)\b/.test(prompt);
  if (/\bdiagrams?\b/.test(prompt) || processSignal || structuralSignal) {
    hits.push({
      publicVisualType: "Diagram",
      internalVisualSubtype: processSignal && !structuralSignal ? "process" : "structural-mechanism",
      signal: processSignal ? "process or stage diagram" : structuralSignal ? "structural or mechanism diagram" : "diagram"
    });
  }

  const distinctPublic = [...new Set(hits.map((item) => item.publicVisualType))];
  const detected = distinctPublic.length >= 2
    ? {
        publicVisualType: "Mixed / Combination Visuals",
        internalVisualSubtype: `mixed:${hits.map((item) => item.internalVisualSubtype).filter(Boolean).join("+")}`,
        confidence: "high",
        exactPromptSignals: hits.map((item) => item.signal)
      }
    : hits.length
      ? { ...hits[0], confidence: "high", exactPromptSignals: hits.map((item) => item.signal) }
      : {
          publicVisualType: selected && selected !== "Not Sure / Auto-detect" ? selected : "Not Sure / Auto-detect",
          internalVisualSubtype: selected === "Diagram" ? "structural-mechanism" : task1InternalSubtypeForPublic(selected),
          confidence: payload.image?.dataUrl && selected && selected !== "Not Sure / Auto-detect" ? "medium" : "low",
          exactPromptSignals: payload.image?.dataUrl ? ["uploaded visual present; prompt has no reliable visual-type noun"] : []
        };

  return {
    ...detected,
    selectedPublicVisualType: selected,
    classificationMatch: !selected || selected === "Not Sure / Auto-detect" || selected === detected.publicVisualType,
    mismatchSeverity: detected.confidence === "high" && selected && selected !== "Not Sure / Auto-detect" && selected !== detected.publicVisualType ? "high" : detected.confidence,
    imageProvided: Boolean(payload.image?.dataUrl)
  };
}

export function normalizeTask1PublicVisualType(value) {
  const text = String(value || "").trim();
  if (/not sure|auto[- ]?detect/i.test(text)) return "Not Sure / Auto-detect";
  if (/mixed|combination|multiple/i.test(text)) return "Mixed / Combination Visuals";
  if (/process|structural|diagram|mechanism/i.test(text)) return "Diagram";
  if (/line/i.test(text)) return "Line Graph";
  if (/bar/i.test(text)) return "Bar Chart";
  if (/pie/i.test(text)) return "Pie Chart";
  if (/table/i.test(text)) return "Table";
  if (/map|plan/i.test(text)) return "Map";
  return "";
}

export function task1InternalSubtypeForPublic(publicVisualType) {
  return ({
    "Line Graph": "line-graph",
    "Bar Chart": "bar-chart",
    "Pie Chart": "pie-chart",
    Table: "table",
    Map: "map",
    Diagram: "structural-mechanism",
    "Mixed / Combination Visuals": "mixed"
  })[publicVisualType] || "unresolved";
}
