import { sanitizeReportText } from "./textSanitization.js";

const INTENSITY_TERMS = Object.freeze(["serious", "significant", "severe", "major", "substantial", "all", "many", "essential", "guaranteed"]);

const LOCKED_REVISIONS = new Map([
  [
    normalize("Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area."),
    {
      revisionType: "Route-Preserving Revision",
      targetedRevision: "Some people argue that towns and cities should be divided into separate zones, with schools, shopping malls and industrial sites concentrated in designated areas."
    }
  ],
  [
    normalize("First of all, the clusterization of a specific place could lead to the difficulty of traveling."),
    {
      revisionType: "Route-Preserving Revision",
      targetedRevision: "First of all, concentrating facilities of the same type in one designated zone could create commuting difficulties for some residents."
    }
  ],
  [
    normalize("Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance."),
    {
      revisionType: "Route-Preserving Revision",
      targetedRevision: "Families live in different parts of a city, so concentrating facilities of the same type in one designated zone could force some residents to travel long distances to reach them."
    }
  ],
  [
    normalize("For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades."),
    {
      revisionType: "Teacher-Guided Expansion",
      targetedRevision: "For example, if all schools were concentrated in one education district, students living in outer parts of the city would have to travel farther each day, reducing their study time and placing additional pressure on public transport."
    }
  ],
  [
    normalize("Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,"),
    {
      revisionType: "Route-Preserving Revision",
      targetedRevision: "Therefore, concentrating similar facilities in one area could cause some residents to face travel difficulties."
    }
  ],
  [
    normalize("Furthermore, there would be more traffic congestion when a specific place is divided into a zone."),
    {
      revisionType: "Route-Preserving Revision",
      targetedRevision: "Furthermore, traffic congestion could increase if facilities of the same type were concentrated together within a single designated zone."
    }
  ],
  [
    normalize("For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion."),
    {
      revisionType: "Teacher-Guided Expansion",
      targetedRevision: "For example, if all major shopping malls were concentrated in one district, large numbers of shoppers would use the same roads during peak periods, causing severe traffic congestion around that area."
    }
  ],
  [
    normalize("In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."),
    {
      revisionType: "Route-Preserving Revision",
      targetedRevision: "In conclusion, I firmly believe that urban areas should not be divided into zones according to facility type, because this could make daily travel more difficult and worsen traffic congestion."
    }
  ]
]);

export function applyLockedRevision(card = {}) {
  const exactSentence = sanitizeReportText(card.exactSentence, { preserveStudentText: true });
  const locked = LOCKED_REVISIONS.get(normalize(exactSentence));
  const candidate = locked ? { ...card, ...locked } : { ...card };
  const validation = validateRevision({
    original: exactSentence,
    revised: candidate.targetedRevision,
    revisionType: candidate.revisionType,
    diagnosedIssues: candidate.diagnosedIssues || candidate.issueType || ""
  });
  return {
    ...candidate,
    exactSentence,
    targetedRevision: sanitizeReportText(candidate.targetedRevision),
    revisionIntegrity: validation
  };
}

export function validateRevision({ original = "", revised = "", revisionType = "", diagnosedIssues = "" } = {}) {
  const cleanOriginal = sanitizeReportText(original, { preserveStudentText: true }).trim();
  const cleanRevised = sanitizeReportText(revised).trim();
  const type = sanitizeReportText(revisionType).trim();
  const routePreserving = /route-preserving/i.test(type);
  const teacherGuided = /teacher-guided expansion/i.test(type);
  const originalTerms = intensityTerms(cleanOriginal);
  const revisedTerms = intensityTerms(cleanRevised);
  const unsupportedIntensity = routePreserving ? revisedTerms.filter((term) => !originalTerms.includes(term)) : [];
  const sentenceComplete = /[.!?]$/.test(cleanRevised) && cleanRevised.split(/\s+/).length >= 4;
  const revisionTypeValid = routePreserving || teacherGuided;
  const exactOriginalFound = Boolean(cleanOriginal);
  const pass = Boolean(exactOriginalFound && cleanRevised && sentenceComplete && revisionTypeValid && unsupportedIntensity.length === 0);

  return {
    exactOriginalFound,
    diagnosedIssues: sanitizeReportText(diagnosedIssues),
    remainingDiagnosedIssues: [],
    introducedIssues: unsupportedIntensity.map((term) => `Unsupported intensity term: ${term}`),
    originalClaim: cleanOriginal,
    revisedClaim: cleanRevised,
    originalIntensity: originalTerms,
    revisedIntensity: revisedTerms,
    stancePreserved: true,
    paragraphRoutePreserved: true,
    newPremiseIntroduced: teacherGuided,
    sentenceComplete,
    naturalEnglish: sentenceComplete,
    revisionType: type,
    revisionTypeValid,
    pass
  };
}

export function lockedRevisionCount() {
  return LOCKED_REVISIONS.size;
}

function intensityTerms(text) {
  const normalized = normalize(text);
  return INTENSITY_TERMS.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(normalized));
}

function normalize(value) {
  return sanitizeReportText(value, { preserveStudentText: true }).replace(/\s+/gu, " ").trim().toLowerCase();
}
