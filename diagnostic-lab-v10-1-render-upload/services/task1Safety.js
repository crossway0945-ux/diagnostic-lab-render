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

const AUTO_DETECT = "Not Sure / Auto-detect";

export function normalizeTask1PublicVisualType(value) {
  const text = String(value || "").normalize("NFKC").trim().toLowerCase();
  if (!text || /not sure|auto.?detect/.test(text)) return AUTO_DETECT;
  if (/mixed|combination|multiple/.test(text)) return "Mixed / Combination Visuals";
  if (/process|structural|mechanism|diagram/.test(text)) return "Diagram";
  if (/line/.test(text)) return "Line Graph";
  if (/bar/.test(text)) return "Bar Chart";
  if (/pie/.test(text)) return "Pie Chart";
  if (/table/.test(text)) return "Table";
  if (/map|plan/.test(text)) return "Map";
  return "";
}

export function classifyTask1Visual(payload = {}) {
  const selectedInput = String(payload.selectedVisualType || payload.visualType || "").trim();
  const selectedPublicVisualType = normalizeTask1PublicVisualType(selectedInput);
  const prompt = String(payload.prompt || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const lower = prompt.toLowerCase();
  const signals = [];
  const candidates = [];
  const add = (publicVisualType, internalVisualSubtype, pattern, evidence) => {
    if (!pattern.test(lower)) return;
    candidates.push({ publicVisualType, internalVisualSubtype, evidence });
    signals.push(evidence);
  };

  const explicitVisuals = [
    ["Line Graph", /\bline (?:graph|chart)s?\b/, "prompt says line graph"],
    ["Bar Chart", /\bbar (?:graph|chart)s?\b/, "prompt says bar chart"],
    ["Pie Chart", /\bpie (?:graph|chart)s?\b/, "prompt says pie chart"],
    ["Table", /\btables?\b/, "prompt says table"],
    ["Map", /\b(?:maps?|plans?)\b/, "prompt says map/plan"]
  ];
  for (const [type, pattern, evidence] of explicitVisuals) add(type, "", pattern, evidence);

  const processSignal = /\b(?:process|stages?|steps?|cycle|recycl|manufactur|production|produced|how .{0,45}(?:is made|is produced|is recycled))\b/.test(lower);
  const structuralSignal = /\b(?:components?|parts?|structure|structural|mechanism|device|apparatus|cross[- ]section|how .{0,45}(?:works?|operates?|functions?))\b/.test(lower);
  const diagramNoun = /\bdiagrams?\b/.test(lower);
  if (processSignal) add("Diagram", "process", /./, "prompt describes stages, a cycle, or transformation");
  else if (structuralSignal) add("Diagram", "structural-mechanism", /./, "prompt describes components or how a mechanism works");
  else if (diagramNoun) add("Diagram", "unresolved-diagram", /./, "prompt says diagram without a reliable subtype signal");

  const distinctPublic = [...new Set(candidates.map((item) => item.publicVisualType))];
  const explicitMixed = /\b(?:mixed|combination|combined|two different visuals?|three different visuals?)\b/.test(lower);
  let detected;
  if (explicitMixed || distinctPublic.length >= 2) {
    detected = {
      publicVisualType: "Mixed / Combination Visuals",
      internalVisualSubtype: distinctPublic.map(slugify).sort().join("+") || "mixed-visuals",
      evidence: explicitMixed ? "prompt explicitly describes combined visuals" : `prompt identifies ${distinctPublic.join(" + ")}`
    };
  } else {
    detected = candidates[0] || null;
  }

  let confidence = "low";
  if (detected && (explicitMixed || distinctPublic.length >= 2 || candidates.some((item) => !/unresolved/.test(item.internalVisualSubtype)))) {
    confidence = "high";
  } else if (detected) {
    confidence = "medium";
  }

  const autoSelected = selectedPublicVisualType === AUTO_DETECT;
  const classificationMatch = autoSelected || !detected || selectedPublicVisualType === detected.publicVisualType;
  return {
    selectedPublicVisualType,
    publicVisualType: detected?.publicVisualType || (autoSelected ? "" : selectedPublicVisualType),
    internalVisualSubtype: detected?.internalVisualSubtype || internalSubtypeFromLegacy(selectedInput, selectedPublicVisualType),
    confidence,
    evidence: [...new Set([...(detected?.evidence ? [detected.evidence] : []), ...signals])],
    classificationMatch,
    autoSelected,
    requiresConfirmation: autoSelected && confidence !== "high"
  };
}

export function task1DiagnosticVisualType(classification = {}) {
  if (classification.publicVisualType === "Diagram") {
    return classification.internalVisualSubtype === "process" ? "Process Diagram" : "Structural Diagram";
  }
  if (classification.publicVisualType === "Mixed / Combination Visuals") return "Mixed Graph";
  return classification.publicVisualType;
}

function internalSubtypeFromLegacy(value, publicType) {
  const text = String(value || "").toLowerCase();
  if (publicType !== "Diagram") return "";
  if (/process|cycle|manufactur/.test(text)) return "process";
  if (/structural|mechanism/.test(text)) return "structural-mechanism";
  return "unresolved-diagram";
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
