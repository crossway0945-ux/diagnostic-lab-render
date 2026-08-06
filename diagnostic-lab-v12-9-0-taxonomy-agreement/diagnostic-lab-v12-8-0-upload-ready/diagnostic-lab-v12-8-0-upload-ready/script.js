import { getWordCountMetadata } from "./wordCount.js";
import { projectCanonicalAnalysis } from "./services/canonicalAnalysis.js";
import { assertStudentReportViewModel } from "./domain/reportViewModels.js";
import { STUDENT_FORBIDDEN_PATTERNS, assertPrintableTextIntegrity, sanitizePrintableText, unicodeIntegrityIssues } from "./domain/textIntegrity.js";
import { groupCardsBySharedSentence } from "./domain/reportDensity.js";
import { runWithSingleTransientPdfRetry } from "./domain/pdfRetry.js";

const views = document.querySelectorAll(".view");
const navLinks = document.querySelectorAll(".nav-link");
const taskTabs = document.querySelectorAll(".task-tab");
const taskPanels = document.querySelectorAll(".task-panel");
const form = document.querySelector("#analysis-form");
const analyzeButton = document.querySelector("#analyze-button");
const loadingState = document.querySelector("#loading-state");
const toast = document.querySelector("#toast");
const formError = document.querySelector("#form-error");
const serviceStatus = document.querySelector("#service-status");
const imageInput = document.querySelector("#task1-image");
const uploadBox = document.querySelector("#upload-box");
const uploadStatus = document.querySelector("#upload-status");
const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const loginError = document.querySelector("#login-error");
const loginUsername = document.querySelector("#login-username");
const loginPassword = document.querySelector("#login-password");
const logoutButton = document.querySelector("#logout-button");
const studentDisplay = document.querySelector("#student-display");
const studentPlan = document.querySelector("#student-plan");
const studentQuota = document.querySelector("#student-quota");
const studentExpiry = document.querySelector("#student-expiry");
const analysisCreditNote = document.querySelector("#analysis-credit-note");
const progressEmpty = document.querySelector("#progress-empty");
const progressContent = document.querySelector("#progress-content");
const progressTabs = document.querySelectorAll(".progress-tab");
const progressPanels = document.querySelectorAll(".progress-panel");
const task1ProgressBody = document.querySelector("#task1-progress-body");
const task2ProgressBody = document.querySelector("#task2-progress-body");
const historyTableBody = document.querySelector("#history-table-body");
const printReport = document.querySelector("#print-report");
const studentProfilePanel = document.querySelector("#student-profile-panel");
const studentProfileSelect = document.querySelector("#student-profile-select");
const studentProfileAdd = document.querySelector("#student-profile-add");
const newStudentName = document.querySelector("#new-student-name");
const addStudentButton = document.querySelector("#add-student-button");
const studentProfileManage = document.querySelector("#student-profile-manage");
const archiveStudentButton = document.querySelector("#archive-student-button");
const archivedStudentLabel = document.querySelector("#archived-student-label");
const archivedStudentSelect = document.querySelector("#archived-student-select");
const restoreStudentButton = document.querySelector("#restore-student-button");
const deleteStudentButton = document.querySelector("#delete-student-button");
const studentProfileError = document.querySelector("#student-profile-error");
const selectedStudent = document.querySelector("#selected-student");
const task1Writing = document.querySelector("#task1-writing");
const task2Writing = document.querySelector("#task2-writing");
const task1WordCount = document.querySelector("#task1-word-count");
const task2WordCount = document.querySelector("#task2-word-count");
const teacherProgressControls = document.querySelector("#teacher-progress-controls");
const progressStudentSearch = document.querySelector("#progress-student-search");
const progressStudentFilter = document.querySelector("#progress-student-filter");
const progressStudentSelect = document.querySelector("#progress-student-select");
const progressStudentList = document.querySelector("#progress-student-list");
const progressEmptyEyebrow = document.querySelector("#progress-empty-eyebrow");
const progressEmptyTitle = document.querySelector("#progress-empty-title");
const progressEmptyText = document.querySelector("#progress-empty-text");
const duplicateAnalysisNotice = document.querySelector("#duplicate-analysis-notice");
const duplicateAnalysisMessage = document.querySelector("#duplicate-analysis-message");
const openExistingReportButton = document.querySelector("#open-existing-report");
const reanalyzeCurrentEngineButton = document.querySelector("#reanalyze-current-engine");
const ACCESS_EXPIRED_MESSAGE = "Your authorised tester access has ended. Please contact Kru Pom IELTS.";
const QUOTA_USED_MESSAGE = "Your analysis allowance for Internal Validation Access has been used. Please contact Kru Pom IELTS.";
const API_DISCONNECTED_MESSAGE = "The diagnostic service could not be reached. Please try again or contact Kru Pom IELTS.";
const ANALYSIS_POLL_INTERVAL_MS = 3000;
const ANALYSIS_POLL_TIMEOUT_MS = 12 * 60 * 1000;

const REPORT_COPY = Object.freeze({
  en: Object.freeze({
    languageName: "English",
    productEyebrow: "Kru Pom IELTS | Evidence-Based Writing Diagnostic",
    reportTitle: "IELTS Writing 7+ Diagnostic Report",
    student: "Student", date: "Date", taskType: "Task Type", essayType: "Essay Type", visualType: "Visual Type", wordCount: "Word Count", reportLanguage: "Report Language", estimatedBandRange: "Estimated Band Range",
    executiveSummary: "Executive Summary", mainLimiter: "Main Score-Limiting Factor", urgentRepair: "Most Urgent Repair", completionStatus: "Completion Status", wordCountStatus: "Word Count Status", taskAchievementCap: "Task Achievement Cap", overviewAccuracy: "Overview Accuracy Status", estimatedNote: "Estimated range, not official IELTS score.",
    positionAndRoute: "Position and Route", route: "Route", detectedRouteLabel: "Detected Route", criteriaBreakdown: "IELTS Criteria Breakdown", frameworkBreakdown: "Kru Pom Framework Breakdown", topIssues: "Top Evidence-Based Issues", detailedFeedback: "Detailed Paragraph Feedback", repairPlan: "Personalized 7-Day Repair Plan", progressSummary: "Progress Summary", disclaimer: "Disclaimer",
    framework: "Kru Pom Framework", evidenceScope: "Evidence Scope", paragraphLocations: "Paragraph Locations", diagnosis: "Diagnosis", studentAction: "Student Action", representativeEvidence: "Representative Evidence", exactSentence: "Exact Sentence Found", sentenceFunction: "What This Sentence Is Trying To Do", whyLimits: "Why This Limits the Band", kruPomDiagnosis: "Kru Pom Diagnosis", revisionType: "Revision Type", targetedRevision: "Targeted Revision", whyStronger: "Why This Revision Is Stronger", paragraphLocation: "Paragraph Location",
    previousSubmissions: "Previous submissions", previousRange: "Previous estimated range", latestRange: "Latest estimated range", currentRepair: "Current main repair", repeatedIssue: "Repeated issue", reportVersions: "Report versions for latest essay", noPrevious: "No previous submission", noRepeated: "No repeated issue identified yet",
    noIssues: "No evidence-based issues found yet.", noFeedback: "No detailed feedback cards available.", day: "Day", footer: "Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | Diagnostic estimate only",
    disclaimerText: "This diagnostic report provides an estimated band range based on IELTS Writing criteria and the Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners."
  }),
  th: Object.freeze({
    languageName: "ไทย",
    productEyebrow: "Kru Pom IELTS | รายงานวินิจฉัยงานเขียนจากหลักฐานจริง",
    reportTitle: "IELTS Writing 7+ Diagnostic Report",
    student: "นักเรียน", date: "วันที่", taskType: "ประเภทงาน", essayType: "ประเภท Essay", visualType: "ประเภท Visual", wordCount: "จำนวนคำ", reportLanguage: "ภาษารายงาน", estimatedBandRange: "ช่วงคะแนนประเมิน",
    executiveSummary: "สรุปผลการวินิจฉัย", mainLimiter: "ปัจจัยหลักที่จำกัดคะแนน", urgentRepair: "จุดที่ต้องซ่อมเร่งด่วนที่สุด", completionStatus: "สถานะความครบถ้วน", wordCountStatus: "สถานะจำนวนคำ", taskAchievementCap: "เหตุผลที่จำกัด Task Achievement", overviewAccuracy: "ความแม่นยำของ Overview", estimatedNote: "เป็นช่วงคะแนนประเมิน ไม่ใช่คะแนน IELTS ทางการ",
    positionAndRoute: "จุดยืนและเส้นทางงานเขียน", route: "เส้นทางงานเขียน", detectedRouteLabel: "เส้นทางที่ตรวจพบ", criteriaBreakdown: "คะแนนแยกตาม IELTS Criteria", frameworkBreakdown: "ผลวิเคราะห์ตาม Kru Pom Framework", topIssues: "ปัญหาหลักที่มีหลักฐานรองรับ", detailedFeedback: "Feedback รายย่อหน้า", repairPlan: "แผนซ่อมงานเขียน 7 วัน", progressSummary: "สรุปพัฒนาการ", disclaimer: "ข้อชี้แจง",
    framework: "Kru Pom Framework", evidenceScope: "ขอบเขตหลักฐาน", paragraphLocations: "ตำแหน่งในงาน", diagnosis: "คำวินิจฉัย", studentAction: "สิ่งที่นักเรียนต้องทำ", representativeEvidence: "ตัวอย่างหลักฐาน", exactSentence: "ประโยคจริงจากงานนักเรียน", sentenceFunction: "ประโยคนี้กำลังพยายามทำหน้าที่อะไร", whyLimits: "เหตุใดจุดนี้จึงจำกัดคะแนน", kruPomDiagnosis: "คำวินิจฉัยของครูปอม", revisionType: "ประเภทการปรับแก้", targetedRevision: "เวอร์ชันปรับแก้", whyStronger: "เหตุใดเวอร์ชันนี้จึงแข็งแรงกว่า", paragraphLocation: "ตำแหน่งย่อหน้า",
    previousSubmissions: "จำนวนงานก่อนหน้า", previousRange: "ช่วงคะแนนก่อนหน้า", latestRange: "ช่วงคะแนนล่าสุด", currentRepair: "จุดซ่อมหลักในปัจจุบัน", repeatedIssue: "ปัญหาที่เกิดซ้ำ", reportVersions: "จำนวนเวอร์ชันของงานล่าสุด", noPrevious: "ยังไม่มีงานก่อนหน้า", noRepeated: "ยังไม่พบปัญหาที่เกิดซ้ำ",
    noIssues: "ยังไม่พบปัญหาที่มีหลักฐานรองรับ", noFeedback: "ยังไม่มี Feedback รายละเอียด", day: "วันที่", footer: "Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | ผลประเมินเชิง Diagnostic เท่านั้น",
    disclaimerText: "รายงานนี้เป็นการประเมินเชิง Diagnostic ตามเกณฑ์ IELTS Writing และกรอบการสอนของ Kru Pom IELTS ไม่ใช่คะแนนทางการจาก IELTS และไม่สามารถใช้แทนการประเมินโดยผู้ตรวจ IELTS ที่ได้รับการรับรอง"
  })
});

function normalizeReportLanguage(value) {
  return String(value || "").toLowerCase() === "th" ? "th" : "en";
}

function getReportCopy(language) {
  return REPORT_COPY[normalizeReportLanguage(language)];
}

function selectedReportLanguage() {
  return normalizeReportLanguage(document.querySelector('input[name="reportLanguage"]:checked')?.value || localStorage.getItem("diagnostic-report-language") || "en");
}

function displayStatus(status, language) {
  if (normalizeReportLanguage(language) !== "th") return status || "Needs Work";
  const map = {
    Strong: "แข็งแรง", Pass: "ผ่าน", Moderate: "ปานกลาง", "Minor Repair": "ต้องซ่อมเล็กน้อย", Major: "ปัญหาหลัก", Critical: "วิกฤต", "Needs Work": "ต้องปรับ", "High-Band Refinement": "ปรับเพื่อ Band สูงขึ้น", Closed: "ปิดงานครบ", Clear: "ชัดเจน", Aligned: "สอดคล้อง"
  };
  return map[status] || status || "ต้องปรับ";
}

let activeTask = "Task 2";
let activeProgressTab = "";
let currentAnalysis = buildSampleAnalysis();
let currentUser = null;
let progressRecords = [];
let currentProgressSummary = null;
let progressSummariesByTask = {};
let studentProfiles = [];
let archivedStudentProfiles = [];
let selectedStudentProfileToken = "";
let progressSelectedStudentToken = "";
let pendingParentReportId = "";
let latestDuplicateRecord = null;

renderAnalysis(currentAnalysis);
checkBackendHealth();
// Signal the startup watchdog only after session bootstrap settles. checkSession always resolves to
// either the app shell or the login screen (both remove auth-loading), so the page can never be left
// on a blank background once the module graph has loaded and executed this far.
checkSession().finally(markApplicationBooted);
updateWordCountPreviews();

task1Writing.addEventListener("input", updateWordCountPreviews);
task2Writing.addEventListener("input", updateWordCountPreviews);

const savedReportLanguage = normalizeReportLanguage(localStorage.getItem("diagnostic-report-language") || "en");
const savedLanguageInput = document.querySelector(`input[name="reportLanguage"][value="${savedReportLanguage}"]`);
if (savedLanguageInput) savedLanguageInput.checked = true;
document.querySelectorAll('input[name="reportLanguage"]').forEach((input) => {
  input.addEventListener("change", () => {
    localStorage.setItem("diagnostic-report-language", normalizeReportLanguage(input.value));
  });
});

studentProfileSelect.addEventListener("change", () => {
  const value = studentProfileSelect.value;
  studentProfileError.textContent = "";
  if (value === "__add__") {
    selectedStudentProfileToken = "";
    studentProfileAdd.hidden = false;
    newStudentName.focus();
  } else {
    selectedStudentProfileToken = value;
    progressSelectedStudentToken = value;
    studentProfileAdd.hidden = true;
    rememberSelectedStudent();
  }
  updateSelectedStudentDisplay();
  updateAnalyzeAvailability();
  loadProgressHistory();
  archiveStudentButton.hidden = !isTeacherAccount(currentUser) || !selectedStudentProfileToken;
});

progressStudentSelect?.addEventListener("change", () => selectStudentForProgress(progressStudentSelect.value));
progressStudentSearch?.addEventListener("input", renderTeacherProgressControls);
progressStudentFilter?.addEventListener("change", renderTeacherProgressControls);
openExistingReportButton?.addEventListener("click", () => showSection("dashboard"));
reanalyzeCurrentEngineButton?.addEventListener("click", () => prepareReanalysis(latestDuplicateRecord));

addStudentButton.addEventListener("click", addStudentProfile);
archiveStudentButton.addEventListener("click", archiveSelectedStudentProfile);
restoreStudentButton.addEventListener("click", restoreSelectedStudentProfile);
deleteStudentButton.addEventListener("click", deleteSelectedStudentProfile);

document.addEventListener("click", (event) => {
  const progressStudentButton = event.target.closest("[data-progress-student]");
  if (progressStudentButton) {
    selectStudentForProgress(progressStudentButton.dataset.progressStudent);
    return;
  }

  const historyReportButton = event.target.closest("[data-history-report]");
  if (historyReportButton) {
    loadHistoryReport(historyReportButton.dataset.historyReport, false);
    return;
  }

  const historyPrintButton = event.target.closest("[data-history-print]");
  if (historyPrintButton) {
    loadHistoryReport(historyPrintButton.dataset.historyPrint, true);
    return;
  }

  const historyInvalidateButton = event.target.closest("[data-history-invalidate]");
  if (historyInvalidateButton) {
    invalidateSubmission(historyInvalidateButton.dataset.historyInvalidate);
    return;
  }

  const historyReanalyzeButton = event.target.closest("[data-history-reanalyze]");
  if (historyReanalyzeButton) {
    prepareReanalysis(progressRecords.find((record) => record.submissionId === historyReanalyzeButton.dataset.historyReanalyze));
    return;
  }

  const startTaskButton = event.target.closest("[data-start-task]");
  if (startTaskButton) {
    setActiveTask(startTaskButton.dataset.startTask === "Task 1" ? "Task 1" : "Task 2");
    showSection("submission");
    return;
  }

  const targetButton = event.target.closest("[data-target]");
  if (targetButton) {
    const targetSection = targetButton.dataset.target;
    if (targetSection === "progress") {
      if (targetButton.dataset.progressTask === "current") {
        activeProgressTab = currentAnalysis.taskType || "Task 2";
      } else {
        activeProgressTab = targetButton.dataset.progressTask || getLatestProgressTask() || "";
      }
    }

    showSection(targetButton.dataset.target, {
      cardId: targetButton.dataset.card,
      focusExport: targetButton.dataset.focus === "export-preview"
    });
    return;
  }

  const toggle = event.target.closest(".feedback-toggle");
  if (toggle) {
    const card = toggle.closest(".feedback-card");
    const isExpanded = card.classList.toggle("expanded");
    toggle.setAttribute("aria-expanded", String(isExpanded));
    card.querySelector(".toggle-symbol").textContent = currentAnalysis?.reportLanguage === "th"
      ? (isExpanded ? "ย่อ" : "ดูรายละเอียด")
      : (isExpanded ? "Collapse" : "Expand");
    return;
  }

  const alertButton = event.target.closest("[data-alert]");
  if (alertButton) {
    if (alertButton.dataset.alert === "pdf") {
      exportDiagnosticPdf(currentAnalysis);
      return;
    }

    copyPracticePlan();
  }
});

taskTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveTask(tab.dataset.task === "task1" ? "Task 1" : "Task 2");
  });
});

progressTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveProgressTab(tab.dataset.progressTab || "Task 2");
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.classList.remove("visible");
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: loginUsername.value.trim(),
        password: loginPassword.value,
        // Carry the requested destination (e.g. ?next=/admin) so the server can decide, AFTER
        // verifying the role it requires, whether to send the user there.
        next: new URLSearchParams(window.location.search).get("next") || ""
      })
    });
    const result = await readJsonResponse(response, "Username or password is incorrect. Please contact Kru Pom IELTS.");

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Username or password is incorrect. Please contact Kru Pom IELTS.");
    }

    loginPassword.value = "";
    setAuthenticatedUser(result.user);
    // The server returns a destination only when it verified the role that destination requires.
    if (result.redirectTo) {
      window.location.assign(result.redirectTo);
      return;
    }
    showSection("start");
  } catch (error) {
    loginError.textContent = error.message || "Username or password is incorrect. Please contact Kru Pom IELTS.";
    loginError.classList.add("visible");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Log In";
  }
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" }).catch(() => null);
  currentUser = null;
  studentProfiles = [];
  archivedStudentProfiles = [];
  selectedStudentProfileToken = "";
  progressSelectedStudentToken = "";
  sessionStorage.removeItem("diagnostic-selected-student");
  document.body.classList.remove("authenticated");
  document.body.classList.remove("auth-loading");
  loginUsername.value = "";
  loginPassword.value = "";
  clearError();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) {
    uploadBox.classList.remove("is-ready");
    uploadStatus.textContent = "Choose an image file for Task 1. JPG, PNG, or WebP up to 5 MB.";
    return;
  }

  const validation = validateImageFile(file);
  if (!validation.ok) {
    imageInput.value = "";
    uploadBox.classList.remove("is-ready");
    uploadStatus.textContent = validation.message;
    showToast(validation.message);
    return;
  }

  uploadBox.classList.add("is-ready");
  uploadStatus.textContent = `${file.name} selected. Image will be sent only with this analysis request.`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  if (!currentUser) {
    showLoginScreen();
    return;
  }

  setLoading(true);

  try {
    const payload = await collectPayload();
    let response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    let result = await readJsonResponse(response, "Analysis could not be completed. Please check your prompt and writing, then try again.");
    if (!response.ok && result.errorCode === "ESSAY_TYPE_CONFIRMATION_REQUIRED") {
      const confirmed = window.confirm(`${result.error}\n\nContinue using ${result.detectedEssayType || payload.essayType}?`);
      if (!confirmed) return;
      payload.options = { ...(payload.options || {}), essayTypeConfirmed: true };
      response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      result = await readJsonResponse(response, "Analysis could not be completed after essay-type confirmation.");
    }
    if (!response.ok && result.errorCode === "VISUAL_TYPE_CONFIRMATION_REQUIRED") {
      const confirmed = window.confirm(`${result.error}\n\nContinue using ${result.detectedVisualType || payload.visualType}?`);
      if (!confirmed) return;
      payload.options = { ...(payload.options || {}), visualTypeConfirmed: true };
      response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      result = await readJsonResponse(response, "Analysis could not be completed after visual-type confirmation.");
    }
    if (response.status === 202 && (result.accepted || result.queued) && result.jobId) {
      showToast(result.duplicate
        ? "This analysis is already running. Reconnecting…"
        : "Analysis started. You can keep this tab open — refreshing is safe.");
      const completed = await waitForAnalysisJob(result.jobId, result.requestId);
      handleCompletedAnalysis(completed, payload);
      return;
    }

    if (!response.ok || !result.ok) {
      const error = new Error(studentMessageForError(result.errorCode, result.error));
      error.status = response.status;
      error.errorCode = result.errorCode;
      error.debugHint = result.debugHint;
      error.requestId = result.requestId;
      error.failureStage = result.failureStage;
      throw error;
    }

    handleCompletedAnalysis(result, payload);
  } catch (error) {
    if (error.message.includes("log in")) {
      showLoginScreen();
      return;
    }
    showError(studentMessageForError(error.errorCode, error.message), {
      requestId: error.requestId,
      errorCode: error.errorCode,
      failureStage: error.failureStage
    });
  } finally {
    setLoading(false);
  }
});

// The active job is remembered locally so a page refresh (or accidental navigation) can reconnect to
// an analysis that is still running server-side, rather than losing it. Scoped by account so one
// browser used by different logins does not cross wires.
function activeJobStorageKey() {
  return `diagnostic-active-job:${currentUser?.username || "anon"}`;
}
function rememberActiveJob(job) {
  try { localStorage.setItem(activeJobStorageKey(), JSON.stringify({ jobId: job.jobId, requestId: job.requestId || "" })); } catch {}
}
function forgetActiveJob() {
  try { localStorage.removeItem(activeJobStorageKey()); } catch {}
}
function recallActiveJob() {
  try { return JSON.parse(localStorage.getItem(activeJobStorageKey()) || "null"); } catch { return null; }
}

async function waitForAnalysisJob(jobId, requestId = "") {
  rememberActiveJob({ jobId, requestId });
  const startedAt = Date.now();
  while (Date.now() - startedAt < ANALYSIS_POLL_TIMEOUT_MS) {
    await sleep(ANALYSIS_POLL_INTERVAL_MS);
    let result;
    try {
      const response = await fetch(`/api/analyze-status/${encodeURIComponent(jobId)}`);
      result = await readJsonResponse(response, "Analysis status could not be checked. Please try again.");
    } catch {
      // Transient network blip while polling: keep the job remembered and keep trying.
      continue;
    }

    // Safe, non-numeric stage label in the aria-live loading region (never a fake percentage).
    if (result.message && loadingState) {
      loadingState.textContent = requestId ? `${result.message}… (Ref ${requestId})` : `${result.message}…`;
    }

    if (result.status === "complete" && result.analysis) {
      forgetActiveJob();
      return result;
    }

    if (["failed", "expired", "cancelled"].includes(result.status) || result.ok === false) {
      forgetActiveJob();
      const error = new Error(studentMessageForError(result.errorCode, result.error));
      error.status = 200;
      error.errorCode = result.errorCode;
      error.requestId = result.requestId || requestId;
      error.failureStage = result.failureStage;
      error.debugHint = result.debugHint;
      throw error;
    }
  }

  // Client patience limit reached; the job may still finish server-side. Keep it remembered so a
  // refresh can resume, and surface a safe, retryable message.
  const error = new Error("The diagnostic service is still processing. Refresh this page to resume, or try again shortly.");
  error.errorCode = "PROVIDER_TIMEOUT";
  error.requestId = requestId;
  throw error;
}

// On load, reconnect to an analysis that was still running when the page was last open (brief §6.7).
async function resumeActiveAnalysisJob() {
  const active = recallActiveJob();
  if (!active?.jobId) return;
  let result;
  try {
    const response = await fetch(`/api/analyze-status/${encodeURIComponent(active.jobId)}`);
    result = await readJsonResponse(response, "");
  } catch {
    return; // network issue on load — leave the job remembered and try again next time
  }
  if (result.status === "complete" && result.analysis) {
    forgetActiveJob();
    handleCompletedAnalysis(result, { taskType: result.analysis?.taskType });
    return;
  }
  if (["failed", "expired", "cancelled"].includes(result.status) || result.ok === false || !result.status) {
    forgetActiveJob(); // do not nag on load about an old failure
    return;
  }
  // Still running → resume the polling UI where we left off.
  setLoading(true);
  showToast("Reconnecting to your analysis in progress…");
  try {
    const completed = await waitForAnalysisJob(active.jobId, active.requestId || result.requestId);
    handleCompletedAnalysis(completed, { taskType: completed.analysis?.taskType });
  } catch (error) {
    showError(studentMessageForError(error.errorCode, error.message), {
      requestId: error.requestId,
      errorCode: error.errorCode,
      failureStage: error.failureStage
    });
  } finally {
    setLoading(false);
  }
}

function handleCompletedAnalysis(result, payload) {
  pendingParentReportId = "";
  currentProgressSummary = result.progressSummary || null;
  if (result.progressSummary?.taskType) progressSummariesByTask[result.progressSummary.taskType] = result.progressSummary;
  renderAnalysis(result.analysis);
  activeProgressTab = normalizeProgressTab(result.analysis?.taskType || payload.taskType || activeTask);
  if (result.user) updateUserPanel(result.user);
  if (result.progressRecord) {
    const existingIndex = progressRecords.findIndex((record) =>
      record.submissionId === result.progressRecord.submissionId ||
      record.id === result.progressRecord.id ||
      (record.clientSubmissionId && record.clientSubmissionId === result.progressRecord.clientSubmissionId) ||
      (record.submissionHash && record.submissionHash === result.progressRecord.submissionHash)
    );
    progressRecords = existingIndex === -1
      ? [...progressRecords, result.progressRecord]
      : progressRecords.map((record, index) => index === existingIndex ? result.progressRecord : record);
    renderProgressTracker();
  }
  showSection("dashboard");
  latestDuplicateRecord = result.duplicateSubmission ? result.progressRecord || null : null;
  duplicateAnalysisNotice?.classList.toggle("hidden", !result.duplicateSubmission);
  if (duplicateAnalysisMessage) duplicateAnalysisMessage.textContent = result.duplicateSubmission ? result.message || "This exact submission has already been analyzed. No credit or daily limit was used. Opening the existing saved report." : "";
  renderTeacherProgressControls();
  showToast(result.duplicateSubmission ? result.message || "This exact submission has already been analyzed. No credit or daily limit was used. Opening the existing saved report." : "Personalized diagnostic analysis is ready.");
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function markApplicationBooted() {
  // Tells the classic startup watchdog in index.html that the module graph loaded and the app
  // reached a safe, rendered state, so no startup-error fallback is needed.
  window.__DIAGNOSTIC_APP_BOOTED__ = true;
}

async function checkSession() {
  try {
    const response = await fetch("/api/session");
    const result = await readJsonResponse(response, "Login session could not be checked. Please log in again.");

    if (response.ok && result.authenticated) {
      setAuthenticatedUser(result.user);
      return;
    }
  } catch {
    // Keep the login screen visible if session cannot be checked.
  }

  showLoginScreen();
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    console.error("Diagnostic Lab API returned non-JSON.", {
      status: response.status,
      contentType,
      preview: text.slice(0, 180)
    });
    const error = new Error(API_DISCONNECTED_MESSAGE);
    error.status = response.status;
    if (isTimeoutLikeResponse(response.status, text)) {
      error.errorCode = "PROVIDER_TIMEOUT";
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(text || "{}");
    if (!response.ok || parsed.ok === false) {
      console.error("Diagnostic Lab API error.", {
        status: response.status,
        errorCode: parsed.errorCode || "",
        debugHint: parsed.debugHint || "",
        message: parsed.error || fallbackMessage
      });
    }
    return parsed;
  } catch (error) {
    console.error("Diagnostic Lab API returned invalid JSON.", {
      status: response.status,
      contentType,
      error,
      preview: text.slice(0, 180)
    });
    throw new Error(fallbackMessage);
  }
}

function isTimeoutLikeResponse(status, text) {
  const preview = String(text || "").toLowerCase();
  return [408, 500, 502, 503, 504].includes(status) &&
    /\b(timeout|timed out|deadline|function invocation|task timed)\b/.test(preview);
}

function studentMessageForError(errorCode, fallbackMessage) {
  const messages = {
    PROVIDER_AUTH_ERROR: "The diagnostic service is not ready yet. Please contact Kru Pom IELTS.",
    PROVIDER_MODEL_ERROR: "The diagnostic service is not configured correctly. Please contact Kru Pom IELTS.",
    PROVIDER_RATE_LIMIT: "The diagnostic service is busy right now. Please try again in a few minutes.",
    PROVIDER_TIMEOUT: "The diagnostic service took too long to respond. Please try again.",
    PROVIDER_JSON_PARSE_ERROR: "Analysis could not be completed cleanly. Please try again or contact Kru Pom IELTS.",
    PAYLOAD_TOO_LARGE: "Submission is too large. Keep Task 1 images under 5 MB."
  };

  return messages[errorCode] || fallbackMessage || "Analysis could not be completed. Please check your prompt and writing, then try again.";
}

function setAuthenticatedUser(user) {
  document.body.classList.add("authenticated");
  document.body.classList.remove("auth-loading");
  updateUserPanel(user);
  loadStudentProfiles();
  // Reconnect to an analysis that was still running when this page was last open (refresh recovery).
  resumeActiveAnalysisJob();
}

function showLoginScreen() {
  currentUser = null;
  progressRecords = [];
  currentProgressSummary = null;
  studentProfiles = [];
  archivedStudentProfiles = [];
  selectedStudentProfileToken = "";
  progressSelectedStudentToken = "";
  renderProgressTracker();
  document.body.classList.remove("authenticated");
  document.body.classList.remove("auth-loading");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateUserPanel(user) {
  const quotaMode = String(user.quotaMode || "limited").toLowerCase();
  const isUnlimited = quotaMode === "unlimited";
  const quota = Number(user.totalQuota ?? user.quota ?? 0);
  const used = Number(user.usedQuota ?? user.used ?? 0);
  const remaining = Number(user.remainingQuota ?? user.remaining ?? quota - used);
  currentUser = {
    ...user,
    role: user.role || "student",
    quotaMode,
    quota: isUnlimited ? null : quota,
    used,
    remaining: isUnlimited ? null : Math.max(0, remaining),
    expiryDate: user.expiryDate || "",
    isExpired: Boolean(user.isExpired || user.accessExpired),
    accessExpired: Boolean(user.isExpired || user.accessExpired),
    dailySafetyLimit: Number(user.dailySafetyLimit || 0),
    dailySafetyUsed: Number(user.dailySafetyUsed || 0),
    dailySafetyRemaining: Number(user.dailySafetyRemaining || 0)
  };
  studentDisplay.textContent = currentUser.displayName || currentUser.username || "-";
  if (isUnlimitedAccount(currentUser)) {
    const roleLabel = currentUser.role === "admin" ? "Admin account" : "Teacher account";
    const safetyText = currentUser.dailySafetyLimit
      ? `Daily safety ${currentUser.dailySafetyRemaining}/${currentUser.dailySafetyLimit} remaining`
      : "Daily safety limit active";
    studentPlan.textContent = `${displayAccessPlan(currentUser.plan, "Internal Use")} (${roleLabel})`;
    studentQuota.textContent = `Internal use. ${safetyText}`;
    if (studentExpiry) studentExpiry.textContent = currentUser.expiryDate || "Internal use";
  } else {
    studentPlan.textContent = displayAccessPlan(currentUser.plan, "-");
    studentQuota.textContent = `${currentUser.remaining} remaining (used ${currentUser.used}/${currentUser.quota})`;
    if (studentExpiry) studentExpiry.textContent = currentUser.expiryDate || "-";
  }
  updateAnalysisCreditNote();
  updateAnalyzeAvailability();
}

function updateAnalyzeAvailability() {
  if (!currentUser) return;
  const studentMissing = isTeacherAccount(currentUser) && !selectedStudentProfileToken;
  analyzeButton.disabled = studentMissing;
  if (studentMissing) {
    analyzeButton.textContent = "Select a Student";
  } else if (!loadingState.classList.contains("visible")) {
    analyzeButton.textContent = "Analyze My Writing";
  }
}

function updateAnalysisCreditNote() {
  if (!analysisCreditNote || !currentUser) return;

  if (currentUser.isExpired || currentUser.accessExpired) {
    analysisCreditNote.textContent = ACCESS_EXPIRED_MESSAGE;
    analysisCreditNote.classList.add("expired");
    return;
  }

  if (isUnlimitedAccount(currentUser)) {
    const safetyText = currentUser.dailySafetyLimit
      ? `Daily safety limit remaining ${currentUser.dailySafetyRemaining}/${currentUser.dailySafetyLimit}.`
      : "Daily safety limit is active.";
    analysisCreditNote.textContent = `Teacher/internal account: no student credit is deducted. ${safetyText}`;
    analysisCreditNote.classList.remove("expired");
    return;
  }

  analysisCreditNote.textContent = `Each successful analysis uses 1 credit. Remaining ${currentUser.remaining}. Used ${currentUser.used}/${currentUser.quota}. Access valid until: ${currentUser.expiryDate || "-"}`;
  analysisCreditNote.classList.remove("expired");
}

function isUnlimitedAccount(user) {
  return String(user?.quotaMode || "limited").toLowerCase() === "unlimited";
}

function displayAccessPlan(value, fallback = "-") {
  const label = String(value || "").trim();
  if (!label) return fallback;
  // Preserve legacy/internal account fields, but never project old promotional plan names into the
  // Stage-0 tester dashboard.
  return /\b(?:early access|founding pilot|founder(?: tutor)? plan|founder|top[ -]?up)\b/i.test(label)
    ? "Internal Validation Access"
    : label;
}

function isTeacherAccount(user) {
  return ["teacher", "admin"].includes(String(user?.role || "student").toLowerCase());
}

async function loadStudentProfiles(preferredToken = "") {
  if (!currentUser) return;
  const canManageStudents = isTeacherAccount(currentUser);
  studentProfilePanel.hidden = !canManageStudents;
  studentProfileSelect.disabled = !canManageStudents;
  studentProfileSelect.required = canManageStudents;
  studentProfileError.textContent = "";

  try {
    const response = await fetch("/api/student-profiles");
    const result = await readJsonResponse(response, "Student profiles could not be loaded.");
    if (!response.ok || !result.ok) throw new Error(result.error || "Student profiles could not be loaded.");
    const profiles = Array.isArray(result.profiles) ? result.profiles : [];
    studentProfiles = profiles.filter((profile) => profile.active !== false);
    archivedStudentProfiles = profiles.filter((profile) => profile.active === false);

    const remembered = preferredToken || sessionStorage.getItem("diagnostic-selected-student") || "";
    if (isTeacherAccount(currentUser)) {
      selectedStudentProfileToken = studentProfiles.some((profile) => profile.profileToken === remembered) ? remembered : "";
    } else {
      selectedStudentProfileToken = studentProfiles[0]?.profileToken || "";
    }
    progressSelectedStudentToken = profiles.some((profile) => profile.profileToken === progressSelectedStudentToken)
      ? progressSelectedStudentToken
      : selectedStudentProfileToken;
    renderStudentProfileOptions();
    rememberSelectedStudent();
    updateSelectedStudentDisplay();
    updateAnalyzeAvailability();
    await loadProgressHistory();
  } catch (error) {
    studentProfiles = [];
    archivedStudentProfiles = [];
    selectedStudentProfileToken = "";
    progressSelectedStudentToken = "";
    studentProfileError.textContent = error.message || "Student profiles could not be loaded.";
    updateSelectedStudentDisplay();
    updateAnalyzeAvailability();
  }
}

function renderStudentProfileOptions() {
  const options = [
    `<option value="">Select a student</option>`,
    ...studentProfiles.map((profile) => `<option value="${escapeHtml(profile.profileToken)}">${escapeHtml(profile.displayName)}</option>`),
    ...(isTeacherAccount(currentUser) ? [`<option value="__add__">+ Add new student</option>`] : [])
  ];
  studentProfileSelect.innerHTML = options.join("");
  studentProfileSelect.value = selectedStudentProfileToken;
  studentProfileAdd.hidden = true;
  const canManage = isTeacherAccount(currentUser);
  studentProfileManage.hidden = !canManage;
  archiveStudentButton.hidden = !canManage || !selectedStudentProfileToken;
  archivedStudentLabel.hidden = !canManage || !archivedStudentProfiles.length;
  restoreStudentButton.hidden = !canManage || !archivedStudentProfiles.length;
  deleteStudentButton.hidden = !canManage || !archivedStudentProfiles.length;
  archivedStudentSelect.innerHTML = archivedStudentProfiles
    .map((profile) => {
      const reportCount = Math.max(0, Number(profile.reportCount) || 0);
      return `<option value="${escapeHtml(profile.profileToken)}">${escapeHtml(profile.displayName)} (${reportCount} report${reportCount === 1 ? "" : "s"})</option>`;
    })
    .join("");
  renderTeacherProgressControls();
}

function renderTeacherProgressControls() {
  if (!teacherProgressControls) return;
  const teacher = isTeacherAccount(currentUser);
  teacherProgressControls.classList.toggle("hidden", !teacher);
  if (!teacher) return;

  const allProfiles = [...studentProfiles, ...archivedStudentProfiles];
  const search = String(progressStudentSearch?.value || "").trim().toLowerCase();
  const filter = progressStudentFilter?.value || "active";
  const filtered = allProfiles.filter((profile) => {
    const statusMatch = filter === "all" || (filter === "archived" ? profile.active === false : profile.active !== false);
    return statusMatch && (!search || profile.displayName.toLowerCase().includes(search));
  });
  progressStudentSelect.innerHTML = [
    '<option value="">Select a student</option>',
    ...filtered.map((profile) => `<option value="${escapeHtml(profile.profileToken)}">${escapeHtml(profile.displayName)}${profile.active === false ? " (archived)" : ""}</option>`)
  ].join("");
  progressStudentSelect.value = filtered.some((profile) => profile.profileToken === progressSelectedStudentToken) ? progressSelectedStudentToken : "";
  progressStudentList.innerHTML = filtered.length
    ? filtered.map((profile) => `<button class="progress-student-row${profile.profileToken === progressSelectedStudentToken ? " selected" : ""}" type="button" data-progress-student="${escapeHtml(profile.profileToken)}">
        <strong>${escapeHtml(profile.displayName)}</strong>
        <span>${profile.active === false ? "Archived" : "Active"}</span>
        <span>Task 1: ${Number(profile.task1ReportCount || 0)}${profile.latestTask1Range ? ` (${escapeHtml(profile.latestTask1Range)})` : ""}</span>
        <span>Task 2: ${Number(profile.task2ReportCount || 0)}${profile.latestTask2Range ? ` (${escapeHtml(profile.latestTask2Range)})` : ""}</span>
        <span>Latest: ${profile.latestActivityAt ? escapeHtml(formatDateTime(profile.latestActivityAt)) : "No valid reports"}</span>
      </button>`).join("")
    : '<p class="progress-note">No students match this search and status filter.</p>';
}

async function selectStudentForProgress(token) {
  progressSelectedStudentToken = token || "";
  const activeProfile = studentProfiles.find((profile) => profile.profileToken === token);
  if (activeProfile) {
    selectedStudentProfileToken = token;
    studentProfileSelect.value = token;
    rememberSelectedStudent();
    updateSelectedStudentDisplay();
    updateAnalyzeAvailability();
  }
  renderTeacherProgressControls();
  await loadProgressHistory();
}

async function addStudentProfile() {
  const displayName = normalizeStudentName(newStudentName.value);
  studentProfileError.textContent = "";
  if (!displayName) {
    studentProfileError.textContent = "Please enter the student's name.";
    return;
  }
  if ([...displayName].length > 80) {
    studentProfileError.textContent = "Student name must be 80 characters or fewer.";
    return;
  }

  addStudentButton.disabled = true;
  try {
    const response = await fetch("/api/student-profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName })
    });
    const result = await readJsonResponse(response, "Student profile could not be added.");
    if (!response.ok || !result.ok) throw new Error(result.error || "Student profile could not be added.");
    newStudentName.value = "";
    await loadStudentProfiles(result.profile?.profileToken || "");
    showToast(`${result.profile?.displayName || displayName} is selected.`);
  } catch (error) {
    const message = error.message || "Student profile could not be added.";
    await loadStudentProfiles();
    studentProfileError.textContent = message;
  } finally {
    addStudentButton.disabled = false;
  }
}

async function archiveSelectedStudentProfile() {
  const profile = selectedStudentProfile();
  if (!profile || !isTeacherAccount(currentUser)) return;
  const confirmed = window.confirm(`Remove ${profile.displayName} from active report selection? Submission history and account credits will be preserved.`);
  if (!confirmed) return;

  archiveStudentButton.disabled = true;
  studentProfileError.textContent = "";
  try {
    const response = await fetch(`/api/student-profiles/${encodeURIComponent(profile.profileToken)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "archive" })
    });
    const result = await readJsonResponse(response, "Student profile could not be removed.");
    if (!response.ok || !result.ok) throw new Error(result.error || "Student profile could not be removed.");
    selectedStudentProfileToken = "";
    progressSelectedStudentToken = profile.profileToken;
    sessionStorage.removeItem("diagnostic-selected-student");
    await loadStudentProfiles();
    showToast(`${profile.displayName} was archived. History and credits were preserved.`);
  } catch (error) {
    studentProfileError.textContent = error.message || "Student profile could not be removed.";
  } finally {
    archiveStudentButton.disabled = false;
  }
}

async function restoreSelectedStudentProfile() {
  const token = archivedStudentSelect.value;
  const profile = archivedStudentProfiles.find((item) => item.profileToken === token);
  if (!profile || !isTeacherAccount(currentUser)) return;

  restoreStudentButton.disabled = true;
  studentProfileError.textContent = "";
  try {
    const response = await fetch(`/api/student-profiles/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore" })
    });
    const result = await readJsonResponse(response, "Student profile could not be restored.");
    if (!response.ok || !result.ok) throw new Error(result.error || "Student profile could not be restored.");
    await loadStudentProfiles(result.profile?.profileToken || "");
    showToast(`${result.profile?.displayName || profile.displayName} was restored and selected.`);
  } catch (error) {
    studentProfileError.textContent = error.message || "Student profile could not be restored.";
  } finally {
    restoreStudentButton.disabled = false;
  }
}

async function deleteSelectedStudentProfile() {
  const token = archivedStudentSelect.value;
  const profile = archivedStudentProfiles.find((item) => item.profileToken === token);
  if (!profile || !isTeacherAccount(currentUser)) return;

  const reportCount = Math.max(0, Number(profile.reportCount) || 0);
  const confirmed = window.confirm(
    `Permanently delete ${profile.displayName} and ${reportCount} saved report${reportCount === 1 ? "" : "s"}? This cannot be undone. Account credits will not change.`
  );
  if (!confirmed) return;
  const typedName = window.prompt(`Type ${profile.displayName} exactly to confirm permanent deletion.`);
  if (typedName === null) return;
  if (normalizeStudentName(typedName) !== profile.displayName) {
    studentProfileError.textContent = `The confirmation did not match ${profile.displayName}. Nothing was deleted.`;
    return;
  }

  deleteStudentButton.disabled = true;
  restoreStudentButton.disabled = true;
  studentProfileError.textContent = "";
  try {
    const response = await fetch(`/api/student-profiles/${encodeURIComponent(token)}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ permanent: true, confirmation: typedName })
    });
    const result = await readJsonResponse(response, "Student profile could not be permanently deleted.");
    if (!response.ok || !result.ok) throw new Error(result.error || "Student profile could not be permanently deleted.");
    await loadStudentProfiles();
    showToast(`${profile.displayName} and ${result.deletedReportCount || 0} saved reports were permanently deleted. Credits were unchanged.`);
  } catch (error) {
    studentProfileError.textContent = error.message || "Student profile could not be permanently deleted.";
  } finally {
    deleteStudentButton.disabled = false;
    restoreStudentButton.disabled = false;
  }
}

function normalizeStudentName(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function rememberSelectedStudent() {
  if (isTeacherAccount(currentUser) && selectedStudentProfileToken) {
    sessionStorage.setItem("diagnostic-selected-student", selectedStudentProfileToken);
  }
}

function selectedStudentProfile() {
  return studentProfiles.find((profile) => profile.profileToken === selectedStudentProfileToken) || null;
}

function updateSelectedStudentDisplay() {
  const profile = selectedStudentProfile();
  selectedStudent.textContent = profile ? `Student: ${profile.displayName}` : "Student: Please select a student";
}

function updateWordCountPreviews() {
  const task1 = getWordCountMetadata("Task 1", task1Writing.value);
  const task2 = getWordCountMetadata("Task 2", task2Writing.value);
  task1WordCount.textContent = formatWordCountPreview(task1);
  task2WordCount.textContent = formatWordCountPreview(task2);
  task1WordCount.classList.toggle("below-minimum", task1.wordCountStatus === "below_minimum");
  task2WordCount.classList.toggle("below-minimum", task2.wordCountStatus === "below_minimum");
}

function formatWordCountPreview(metadata) {
  return metadata.wordCountStatus === "below_minimum"
    ? `Word count: ${metadata.wordCount} | Minimum: ${metadata.minimumWordCount} | Shortfall: ${metadata.wordShortfall}`
    : `Word count: ${metadata.wordCount} | Minimum met (${metadata.minimumWordCount})`;
}

function setActiveTask(taskType) {
  activeTask = taskType === "Task 1" ? "Task 1" : "Task 2";
  const tabKey = activeTask === "Task 1" ? "task1" : "task2";

  taskTabs.forEach((item) => {
    const isActive = item.dataset.task === tabKey;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  taskPanels.forEach((panel) => {
    panel.classList.toggle("active-task", panel.id === `${tabKey}-panel`);
  });
}

function showSection(sectionId, options = {}) {
  if (sectionId === "progress" && currentUser) {
    loadProgressHistory();
  }

  views.forEach((view) => {
    view.classList.toggle("active-view", view.id === sectionId);
  });

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.target === sectionId && !link.dataset.focus);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (options.cardId) {
    window.setTimeout(() => openFeedbackCard(options.cardId), 180);
  }

  if (options.focusExport) {
    window.setTimeout(() => {
      const exportCard = document.querySelector("#export-preview");
      const exportButton = exportCard?.querySelector("[data-alert='pdf']");
      const focusTarget = exportButton || exportCard;
      if (!exportCard || !focusTarget) return;
      exportCard.classList.add("focused");
      focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      if (exportButton) exportButton.focus({ preventScroll: true });
      window.setTimeout(() => exportCard.classList.remove("focused"), 1400);
    }, 180);
  }
}

function openFeedbackCard(cardId) {
  const card = document.querySelector(`#${cardId}`);
  if (!card) return;

  card.classList.add("expanded", "highlight");
  const toggle = card.querySelector(".feedback-toggle");
  const label = card.querySelector(".toggle-symbol");
  toggle.setAttribute("aria-expanded", "true");
  label.textContent = "Collapse";
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => card.classList.remove("highlight"), 1400);
}

async function collectPayload() {
  const isTask1 = activeTask === "Task 1";
  const payload = {
    taskType: activeTask,
    studentProfileToken: selectedStudentProfileToken,
    clientSubmissionId: createClientSubmissionId(),
    prompt: document.querySelector(isTask1 ? "#task1-prompt" : "#task2-prompt").value.trim(),
    writing: document.querySelector(isTask1 ? "#task1-writing" : "#task2-writing").value.trim(),
    targetBand: document.querySelector(isTask1 ? "#task1-target-band" : "#task2-target-band").value,
    reportLanguage: selectedReportLanguage(),
    essayType: document.querySelector("#essay-type").value,
    visualType: document.querySelector("#visual-type").value,
    options: {
      usedTemplate: document.querySelector("#used-template").checked,
      strictFeedback: document.querySelector("#strict-feedback").checked,
      patternRisk: document.querySelector("#pattern-risk").checked,
      ...(pendingParentReportId ? { parentReportId: pendingParentReportId, analysisReason: "explicit-rerun" } : {})
    }
  };

  if (!payload.prompt || !payload.writing) {
    throw new Error("Please provide both the prompt and student writing.");
  }

  if (!payload.studentProfileToken) {
    throw new Error("Please select a student before analyzing.");
  }

  if (isTask1 && imageInput.files?.[0]) {
    const file = imageInput.files[0];
    const validation = validateImageFile(file);
    if (!validation.ok) throw new Error(validation.message);
    payload.image = await readImageFile(file);
  }

  return payload;
}

function createClientSubmissionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const random = Math.random().toString(16).slice(2);
  return `submission-${Date.now()}-${random}`;
}

function validateImageFile(file) {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    return { ok: false, message: "Please upload a PNG, JPG, or WebP image for Task 1." };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, message: "Task 1 image must be 5 MB or smaller." };
  }

  return { ok: true };
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl: reader.result
      });
    };
    reader.onerror = () => reject(new Error("Could not read the Task 1 image. Please try another file."));
    reader.readAsDataURL(file);
  });
}

function applyReportLanguageUi(copy, language) {
  const thai = normalizeReportLanguage(language) === "th";
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value) element.textContent = value;
  };
  setText("#feedback-title", copy.detailedFeedback);
  setText("#plan-title", copy.repairPlan);
  setText("#dashboard .dashboard-grid > div:first-child .block-heading h3", copy.criteriaBreakdown);
  setText("#dashboard .dashboard-grid > div:nth-child(2) .block-heading h3", copy.frameworkBreakdown);
  setText("#dashboard .issues-panel .block-heading h3", copy.topIssues);
  setText("#feedback .paragraph-panel .block-heading h3", thai ? "คำวินิจฉัยรายย่อหน้า" : "Paragraph-by-Paragraph Diagnosis");
  setText("#plan #export-preview > h3", copy.reportTitle);
  const rule = document.querySelector("#feedback .evidence-rule span");
  if (rule) rule.textContent = thai
    ? "ทุกปัญหาต้องแสดงประโยคจริง หน้าที่ของประโยค ผลต่อเกณฑ์ คำวินิจฉัย เวอร์ชันปรับแก้ และสิ่งที่นักเรียนต้องทำ"
    : "No generic feedback. Every issue must show the sentence, the function, the criteria impact, the diagnosis, and the targeted revision.";
}

function renderAnalysis(analysis) {
  currentAnalysis = normalizeClientAnalysis(analysis);
  const copy = getReportCopy(currentAnalysis.reportLanguage);
  applyReportLanguageUi(copy, currentAnalysis.reportLanguage);
  const criteriaEntries = Object.entries(currentAnalysis.criteriaScores || {});
  const kruEntries = Object.entries(currentAnalysis.kruPomScores || {});
  const feedbackCards = currentAnalysis.feedbackCards || [];

  document.querySelector("#task-type-label").textContent = currentAnalysis.taskType || "Task 2";
  document.querySelector("#estimated-band").textContent = currentAnalysis.estimatedBandRange;
  document.querySelector("#main-limiter").textContent = currentAnalysis.mainScoreLimitingFactor;
  document.querySelector("#urgent-repair").textContent = currentAnalysis.mostUrgentRepair;
  document.querySelector("#hero-band").textContent = currentAnalysis.estimatedBandRange;
  document.querySelector("#hero-limiter").textContent = `Score-limiting factor: ${currentAnalysis.mainScoreLimitingFactor}`;

  serviceStatus.textContent = currentAnalysis.reportLanguage === "th" ? "รายงานพร้อมแล้ว" : "Diagnostic report ready";

  document.querySelector("#hero-metrics").innerHTML = criteriaEntries.slice(0, 4).map(([name, value]) => (
    `<span>${escapeHtml(shortCriteria(name))} ${escapeHtml(value.range || "-")}</span>`
  )).join("");

  const analysisNotices = [...(currentAnalysis.warnings || []), ...buildCriticalNotices(currentAnalysis)];
  document.querySelector("#analysis-notices").innerHTML = analysisNotices.map((warning) => (
    `<p class="analysis-warning">${escapeHtml(warning)}</p>`
  )).join("");

  document.querySelector("#criteria-grid").innerHTML = criteriaEntries.map(([name, value]) => (
    `<article class="score-card">
      <span class="criteria-code">${escapeHtml(shortCriteria(name))}</span>
      <h4>${escapeHtml(name)}</h4>
      <strong>${escapeHtml(value.range || currentAnalysis.estimatedBandRange)}</strong>
      <p>${escapeHtml(value.diagnosis || "")}</p>
      ${value.evidence ? `<blockquote>${escapeHtml(value.evidence)}</blockquote>` : ""}
    </article>`
  )).join("");

  document.querySelector("#kru-grid").innerHTML = kruEntries.map(([name, value]) => (
    `<article class="diagnostic-item">
      <div>
        <h4>${escapeHtml(name)}</h4>
        <p>${escapeHtml(value.diagnosis || "")}</p>
      </div>
      <span class="badge ${statusClass(value.status)}">${escapeHtml(displayStatus(value.status || "Needs Work", currentAnalysis.reportLanguage))}</span>
    </article>`
  )).join("");

  const topIssues = buildDashboardIssues(currentAnalysis.top3Issues, feedbackCards);
  document.querySelector("#top-issues").innerHTML = topIssues.length
    ? topIssues.map((issue, index) => renderDashboardIssue(issue, index)).join("")
    : `<p class="issue-empty">No evidence-based issues found yet. Run an analysis to generate exact-sentence feedback.</p>`;

  document.querySelector("#feedback-stack").innerHTML = feedbackCards.map((card, index) => renderFeedbackCard(card, index)).join("");

  const paragraphItems = currentAnalysis.paragraphCoverage?.length
    ? currentAnalysis.paragraphCoverage
    : normalizeParagraphItems(currentAnalysis.paragraphFeedback, feedbackCards);
  document.querySelector("#paragraph-feedback").innerHTML = paragraphItems.map((paragraph) => (
    `<article class="paragraph-card">
      <span>${escapeHtml(paragraph.paragraphLabel || paragraph.paragraphLocation)}</span>
      ${paragraph.status ? `<span class="badge ${statusClass(paragraph.status)}">${escapeHtml(displayStatus(paragraph.status, currentAnalysis.reportLanguage))}</span>` : ""}
      ${paragraph.paragraphFunction ? `<p><strong>${escapeHtml(paragraph.paragraphFunction)}</strong></p>` : ""}
      ${paragraph.exactEvidence ? `<blockquote>${escapeHtml(paragraph.exactEvidence)}</blockquote>` : ""}
      <p>${escapeHtml(paragraph.diagnosis)}</p>
      <strong>${escapeHtml(copy.studentAction)}</strong>
      <p>${escapeHtml(paragraph.priorityRepair || paragraph.action)}</p>
    </article>`
  )).join("");

  document.querySelector("#practice-timeline").innerHTML = (currentAnalysis.practicePlan || []).slice(0, 7).map((item, index) => (
    `<article class="timeline-item">
      <span>${escapeHtml(copy.day)} ${escapeHtml(item.day || index + 1)}</span>
      <p><strong>${escapeHtml(item.title || "")}</strong><br>${escapeHtml(item.task || item.action || "")}</p>
    </article>`
  )).join("");

  document.querySelector("#report-preview").innerHTML = renderReportPreview(currentAnalysis);
  document.querySelector("#report-disclaimer").textContent = currentAnalysis.disclaimer || copy.disclaimerText;
  const thaiPreview = document.querySelector(".report-thai");
  if (thaiPreview) thaiPreview.hidden = true;
}

function renderFeedbackCard(card, index) {
  const id = `card-${index + 1}`;
  const expanded = index === 0 ? "expanded" : "";
  const severity = card.severity || "Needs Work";
  const copy = getReportCopy(currentAnalysis?.reportLanguage);
  const expandLabel = currentAnalysis?.reportLanguage === "th" ? "ดูรายละเอียด" : "Expand";
  const collapseLabel = currentAnalysis?.reportLanguage === "th" ? "ย่อ" : "Collapse";

  return `<article class="feedback-card ${expanded}" id="${id}">
    <button class="feedback-toggle" type="button" aria-expanded="${index === 0 ? "true" : "false"}">
      <span>
        <span class="badge ${statusClass(severity)}">${escapeHtml(displayStatus(severity, currentAnalysis?.reportLanguage))}</span>
        ${escapeHtml(card.issueCategory || card.issueType || "Diagnostic Issue")}
      </span>
      <span class="toggle-symbol">${index === 0 ? collapseLabel : expandLabel}</span>
    </button>
    <div class="feedback-body">
      <div class="feedback-meta">
        ${toArray(card.criteria).map((item) => `<span class="criteria-chip">${escapeHtml(item)}</span>`).join("")}
        ${toArray(card.framework).map((item) => `<span class="framework-chip">${escapeHtml(item)}</span>`).join("")}
      </div>
      <dl class="feedback-schema">
        <dt>${escapeHtml(currentAnalysis?.reportLanguage === "th" ? "ประเภทปัญหา" : "Issue Type")}</dt>
        <dd>${escapeHtml(card.issueCategory || card.issueType || "")}</dd>
        <dt>${escapeHtml(currentAnalysis?.reportLanguage === "th" ? "ระดับความรุนแรง" : "Severity")}</dt>
        <dd><span class="badge ${statusClass(severity)}">${escapeHtml(displayStatus(severity, currentAnalysis?.reportLanguage))}</span></dd>
        <dt>IELTS Criteria</dt>
        <dd>${escapeHtml(toArray(card.criteria).join(", "))}</dd>
        <dt>Kru Pom Framework</dt>
        <dd>${escapeHtml(toArray(card.framework).join(", "))}</dd>
        <dt>${escapeHtml(copy.paragraphLocation)}</dt>
        <dd>${escapeHtml(card.paragraphLocation || "")}</dd>
        <dt>${escapeHtml(copy.exactSentence)}</dt>
        <dd><blockquote>${escapeHtml(card.exactSentence || "")}</blockquote></dd>
        <dt>${escapeHtml(copy.sentenceFunction)}</dt>
        <dd>${escapeHtml(card.sentenceFunction || "")}</dd>
        <dt>${escapeHtml(copy.whyLimits)}</dt>
        <dd>${escapeHtml(card.whyItLimitsBand || "")}</dd>
        <dt>${escapeHtml(copy.kruPomDiagnosis)}</dt>
        <dd>${escapeHtml(card.kruPomDiagnosis || "")}</dd>
        ${card.revisionType ? `<dt>${escapeHtml(copy.revisionType)}</dt><dd>${escapeHtml(card.revisionType)}</dd>` : ""}
        <dt>${escapeHtml(copy.targetedRevision)}</dt>
        <dd><div class="revision-box">${escapeHtml(card.targetedRevision || "")}</div></dd>
        <dt>${escapeHtml(copy.whyStronger)}</dt>
        <dd>${escapeHtml(card.whyRevisionIsStronger || "")}</dd>
        <dt>${escapeHtml(copy.studentAction)}</dt>
        <dd>${escapeHtml(card.studentAction || "")}</dd>
      </dl>
    </div>
  </article>`;
}

function buildDashboardIssues(issues = [], feedbackCards = []) {
  const sourceIssues = Array.isArray(issues) ? issues.slice(0, 5) : [];
  const fallbackCards = Array.isArray(feedbackCards) ? feedbackCards.slice(0, 5) : [];
  const source = sourceIssues.length ? sourceIssues : fallbackCards;

  return source.map((issue, index) => {
    const issueObject = issue && typeof issue === "object" ? issue : {};
    const issueEvidence = firstText(issueObject.exactEvidence, issueObject.exactSentence);
    const issueCategory = normalizeComparableText(firstText(
      issueObject.issueCategory,
      issueObject.primaryCategory,
      issueObject.issueType,
      issueObject.title
    ));
    const matchedCardIndex = feedbackCards.findIndex((candidate) => (
      issueObject.issueId && candidate?.issueId === issueObject.issueId
    ) || (
      issueEvidence &&
      normalizeComparableText(candidate?.exactSentence) === normalizeComparableText(issueEvidence) &&
      (!issueCategory || issueCategory === normalizeComparableText(firstText(
        candidate?.issueCategory,
        candidate?.primaryCategory,
        candidate?.issueType,
        candidate?.title
      )))
    ));
    const cardIndex = matchedCardIndex >= 0 ? matchedCardIndex : index;
    const card = feedbackCards[cardIndex] || fallbackCards[index] || {};
    const title = firstText(
      issueObject.issueCategory,
      issueObject.title,
      issueObject.issueType,
      issueObject.issue,
      card.issueCategory,
      card.issueType
    ) || "Evidence-based issue";
    const summary = firstText(
      issueObject.diagnosis,
      issueObject.summary,
      issueObject.whyItLimitsBand,
      issueObject.whyItMatters,
      card.whyItLimitsBand,
      card.kruPomDiagnosis
    ) || "Click to view the exact sentence and diagnostic explanation.";
    const severity = firstText(issueObject.severity, card.severity) || "Needs Work";
    const criteria = toArray(issueObject.affectedCriteria).length
      ? toArray(issueObject.affectedCriteria)
      : toArray(issueObject.criteria).length
        ? toArray(issueObject.criteria)
        : toArray(card.criteria);
    const evidenceItems = Array.isArray(issueObject.evidenceItems) && issueObject.evidenceItems.length
      ? issueObject.evidenceItems.filter((item) => item?.exactSentence)
      : issueEvidence
        ? [{
            paragraphLocation: issueObject.paragraphLocation || card.paragraphLocation || "Evidence",
            exactSentence: issueEvidence,
            evidenceRole: "Primary evidence"
          }]
        : [];
    const paragraphLocations = Array.isArray(issueObject.paragraphLocations)
      ? issueObject.paragraphLocations.filter(Boolean)
      : evidenceItems.map((item) => item.paragraphLocation).filter(Boolean);

    return {
      title,
      summary,
      severity,
      criteria,
      scope: issueObject.scope || (evidenceItems.length > 1 ? "multi-location" : "single-location"),
      paragraphLocations,
      evidenceItems,
      diagnosis: issueObject.diagnosis || summary,
      affectedCriteria: criteria,
      studentAction: issueObject.studentAction || card.studentAction || "",
      issueId: issueObject.issueId || card.issueId || "",
      exactSentence: issueEvidence || card.exactSentence || "",
      paragraphLocation: issueObject.paragraphLocation || card.paragraphLocation || "",
      feedbackCardId: issueObject.feedbackCardId || `card-${cardIndex + 1}`
    };
  }).filter((issue) => issue.title || issue.summary);
}

function renderDashboardIssue(issue, index) {
  const criteria = toArray(issue.criteria).filter(Boolean);
  const criteriaLabel = criteria[0] || "";
  const locations = toArray(issue.paragraphLocations).filter(Boolean);
  const evidenceItems = Array.isArray(issue.evidenceItems) ? issue.evidenceItems : [];
  const isThai = currentAnalysis?.reportLanguage === "th";

  return `<article class="issue-row">
    <span class="issue-number">${index + 1}</span>
    <div class="issue-copy">
      <h4>${escapeHtml(issue.title || "Evidence-based issue")}</h4>
      <p>${escapeHtml(issue.summary || (isThai ? "กดเพื่อดูประโยคจริงและคำวินิจฉัย" : "Click to view the exact sentence and diagnostic explanation."))}</p>
      ${locations.length ? `<p class="issue-trace-summary"><strong>${isThai ? "หลักฐาน" : "Evidence"}:</strong> ${escapeHtml(locations.join("; "))} (${escapeHtml(issue.scope || "single-location")})</p>` : ""}
      ${evidenceItems.length > 1 ? `<details class="issue-evidence-details"><summary>${isThai ? `ดูหลักฐาน ${evidenceItems.length} จุด` : `View ${evidenceItems.length} evidence locations`}</summary>${evidenceItems.map((item) => `<blockquote><strong>${escapeHtml(item.paragraphLocation || "Evidence")}</strong><br>${escapeHtml(item.exactSentence || "-")}</blockquote>`).join("")}</details>` : ""}
      <div class="issue-badges">
        <span class="badge ${statusClass(issue.severity)}">${escapeHtml(displayStatus(issue.severity, currentAnalysis?.reportLanguage))}</span>
        ${criteriaLabel ? `<span class="criteria-chip">${escapeHtml(criteriaLabel)}</span>` : ""}
      </div>
    </div>
    <button class="text-button" type="button" data-target="feedback" data-card="${escapeHtml(issue.feedbackCardId || `card-${index + 1}`)}">${isThai ? "ดูประโยคจริง" : "View Exact Sentence"}</button>
  </article>`;
}

function renderReportPreview(analysis) {
  const copy = getReportCopy(analysis.reportLanguage);
  const criticalFlags = buildCriticalNotices(analysis);
  const structuralHealth = [
    analysis.thesisRouteStatus,
    analysis.bodyRouteAlignmentStatus,
    analysis.SARExampleStatus,
    analysis.conclusionClosureStatus,
    analysis.overviewAccuracyStatus
  ].filter(Boolean).join(" | ");
  const isThai = analysis.reportLanguage === "th";
  const rows = [
    [copy.student, analysis.studentDisplayNameSnapshot || selectedStudentProfile()?.displayName || "-"],
    [copy.date, new Date(analysis.generatedAt || Date.now()).toLocaleDateString(isThai ? "th-TH" : "en-GB")],
    [copy.taskType, analysis.taskType || "Task 2"],
    [copy.reportLanguage, copy.languageName],
    [copy.wordCount, String(analysis.wordCount ?? "-")],
    ...(analysis.wordCountStatus === "below_minimum"
      ? [[copy.wordCountStatus, isThai ? `ขาด ${analysis.wordShortfall} คำจากขั้นต่ำ ${analysis.minimumWordCount} คำ` : `${analysis.wordShortfall} ${analysis.wordShortfall === 1 ? "word" : "words"} below the ${analysis.minimumWordCount}-word minimum`]]
      : []),
    ...(analysis.taskType === "Task 2" && analysis.completionStatus ? [[copy.completionStatus, analysis.completionStatus]] : []),
    [copy.estimatedBandRange, analysis.estimatedBandRange],
    [copy.mainLimiter, analysis.mainScoreLimitingFactor],
    [isThai ? "ความแข็งแรงของโครงสร้าง" : "Structural Health Check", structuralHealth],
    [isThai ? "คำเตือนสำคัญ" : "Critical Flags", criticalFlags.join(" | ")],
    [isThai ? "ปัญหาหลัก" : "Priority Issues", (analysis.top3Issues || []).map((issue) => issue.issueType).join(", ")],
    [copy.criteriaBreakdown, Object.keys(analysis.criteriaScores || {}).join(", ")],
    [copy.detailedFeedback, `${(analysis.feedbackCards || []).length} ${isThai ? "การ์ด" : "exact-sentence cards"}`],
    [copy.targetedRevision, isThai ? "มี" : "Included"],
    [copy.repairPlan, isThai ? "มี" : "Included"],
    [copy.disclaimer, isThai ? "ผลประเมินเชิง Diagnostic เท่านั้น" : "Diagnostic estimate only"]
  ];

  const progressSummary = buildTaskProgressSummaryText(progressRecords, analysis.taskType, analysis, currentProgressSummary);
  if (progressSummary) rows.splice(8, 0, [copy.progressSummary, progressSummary]);

  return rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`).join("");
}

function buildCriticalNotices(analysis = {}) {
  const notices = [];
  const thai = normalizeReportLanguage(analysis.reportLanguage) === "th";
  if (analysis.taskAchievementCapReason) notices.push(thai ? `เหตุผลที่จำกัด Task Achievement: ${analysis.taskAchievementCapReason}` : `Task Achievement cap: ${analysis.taskAchievementCapReason}`);
  if (analysis.taskResponseCapReason) notices.push(thai ? `เหตุผลที่จำกัด Task Response: ${analysis.taskResponseCapReason}` : `Task Response cap: ${analysis.taskResponseCapReason}`);
  if (analysis.criticalOverviewError) notices.push(thai ? "จุดวิกฤต Task 1: Overview หรือการตีความ visual จำกัดช่วงคะแนน" : "Critical Task 1 flag: overview / visual interpretation limits the estimate.");
  if (analysis.brokenPromiseDetected) notices.push(thai ? "จุดวิกฤต Task 2: Thesis route และ Body development ยังไม่ตรงกันครบ" : "Critical Task 2 flag: thesis route and body development do not fully match.");
  if (analysis.SARExampleStatus === "Generic") notices.push(thai ? "จุดสำคัญด้านตัวอย่าง: ต้องระบุ Specific Situation, Action และ Result ให้ชัด" : "Critical support flag: examples need Specific Situation, Action, and Result.");
  return [...new Set(notices.filter(Boolean))];
}

async function exportDiagnosticPdf(analysis) {
  renderPrintReport(analysis);
  if (!printReport) return;
  const reportLanguage = normalizeReportLanguage((analysis || currentAnalysis)?.reportLanguage);

  try {
    await runWithSingleTransientPdfRetry(
      () => prepareAndPrintDiagnosticFrame(reportLanguage),
      { onAttemptDisposed: () => document.querySelector("#diagnostic-print-frame")?.remove() }
    );
  } catch (error) {
    console.error("Diagnostic PDF export failed after the controlled retry boundary.", { message: String(error?.message || error) });
    showError("The PDF report could not be prepared. Please try again.");
  }
}

async function prepareAndPrintDiagnosticFrame(reportLanguage, { suppressPrint = false } = {}) {

  const previousFrame = document.querySelector("#diagnostic-print-frame");
  previousFrame?.remove();

  const frame = document.createElement("iframe");
  frame.id = "diagnostic-print-frame";
  frame.title = "Diagnostic report print document";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "210mm";
  frame.style.height = "297mm";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";

  const stylesheetUrl = new URL("styles.css", window.location.href).href;
  const baseUrl = new URL("./", window.location.href).href;
  frame.srcdoc = `<!doctype html>
<html lang="${reportLanguage === "th" ? "th" : "en"}">
<head>
  <meta charset="utf-8">
  <base href="${escapeHtml(baseUrl)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IELTS Writing 7+ Diagnostic Report</title>
  <link rel="stylesheet" href="${escapeHtml(stylesheetUrl)}">
  <style>
    html, body { margin: 0 !important; background: #fff !important; }
    body > *:not(#print-report) { display: none !important; }
    #print-report { display: block !important; }
    [style*="position: fixed"], [style*="position:fixed"] { display: none !important; }

    /* Pagination geometry.
       composeDeterministicPrintPages() measures with scrollHeight/clientHeight, which resolve
       against the styles ACTIVE in the document - i.e. screen styles - while the exported PDF is
       rendered with the @media print block. Any disagreement means the paginator allocates the
       wrong amount of space: it clips (print taller) or wastes most of a sheet (print shorter,
       which is what left a Task 2 report at one card per page). These declarations mirror the
       print metrics for the export document, so measurement and rendering agree to within a few
       pixels; the residual difference bleeds into the sheet's reserved bottom margin rather than
       being clipped, and assertPrintPageGeometry() fails the export if it ever exceeds that
       reserve. Keep them in step with the @media print block in styles.css. */
    .print-report .print-section p,
    .print-report .print-card p,
    .print-report .print-callout p,
    .print-report .print-issue p,
    .print-report .print-feedback-card p,
    .print-report .print-plan-item p { margin: 0.9mm 0; font-size: 9.5pt; line-height: 1.3; }
    .print-report .print-issue,
    .print-report .print-feedback-card { margin-bottom: 2.6mm; padding: 3.1mm; }
    .print-report blockquote { margin: 1.2mm 0; padding: 2.2mm; font-size: 9.5pt; line-height: 1.35; }
    .print-report .print-revision { margin: 1.2mm 0; padding: 2.2mm; font-size: 9.6pt; line-height: 1.38; }
    .print-report .print-feedback-revision-group { margin-top: 2mm; padding-top: 2mm; }
    .print-report .print-feedback-header-row { padding-bottom: 1.2mm; }
    .print-report .print-section { margin: 3mm 0; }
    .print-report .print-section-panel { padding: 3.2mm; }
    .print-report .print-section h2 { font-size: 15pt; margin: -1mm -1mm 2.4mm; padding: 0 1mm 1.8mm; }
    .print-report .print-section h3 { font-size: 11.5pt; line-height: 1.25; margin: 0; }
    .print-report .print-info,
    .print-report .print-card,
    .print-report .print-callout,
    .print-report .print-plan-item { padding: 2.5mm 2.9mm; }
    .print-report .print-plan-item { min-height: 25mm; }
    .print-report .print-summary-grid,
    .print-report .print-card-grid { gap: 2.4mm; margin: 2.6mm 0; }
    .print-report .print-language-pattern-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2.4mm; }
    .print-report .print-language-pattern-row { padding: 2.8mm 3mm; font-size: 9pt; line-height: 1.35; }
    .print-report .print-language-pattern-row p { margin: 1.2mm 0 0; }
    .print-report .print-feedback-group { margin-bottom: 2.6mm; }
    .print-report .print-feedback-shared-evidence { padding: 3mm 4mm; }
    .print-report .pdf-section-fragment { margin: 0 0 2.4mm; }
  </style>
</head>
<body class="print-export-document">
  <main id="print-report" class="print-report" data-student-report-root="true">${printReport.innerHTML}</main>
</body>
</html>`;

  document.body.append(frame);
  try {
    await waitForFrameLoad(frame);
    const printDocument = frame.contentDocument;
    if (!printDocument) throw new Error("The isolated print document could not be created.");
    await printDocument.fonts?.ready;
    removeForbiddenPrintOverlays(printDocument);
    assertStudentPrintBoundary(printDocument);
    composeDeterministicPrintPages(printDocument);
    measureProtectedPrintBlocks(printDocument);
    assertPrintPageGeometry(printDocument);
    const win = frame.contentWindow;
    if (!win) throw new Error("The isolated print window could not be created.");
    if (suppressPrint) {
      return {
        value: frame,
        frame,
        dispose: () => frame.remove()
      };
    }
    const cleanup = () => window.setTimeout(() => frame.remove(), 500);
    win.addEventListener("afterprint", cleanup, { once: true });
    win.focus();
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    win.print();
    window.setTimeout(() => { if (frame.isConnected) frame.remove(); }, 120000);
    return { value: true, dispose: () => frame.remove() };
  } catch (error) {
    frame.remove();
    throw error;
  }
}

// Browser-QA entrypoint. It uses the identical Student View renderer, sanitisation, deterministic
// paginator and overflow gate as the user-facing Export PDF action, but stops before opening the
// operating-system print dialog so automated release validation can inspect and print the isolated
// document. This is not linked from the UI and does not bypass any export assertion.
export async function prepareDiagnosticPrintFrameForQa(analysis) {
  renderPrintReport(analysis);
  if (!printReport) throw new Error("The printable report root is unavailable.");
  const reportLanguage = normalizeReportLanguage((analysis || currentAnalysis)?.reportLanguage);
  const prepared = await prepareAndPrintDiagnosticFrame(reportLanguage, { suppressPrint: true });
  return prepared.frame;
}

// Local acceptance runs use the real application shell (rather than a duplicate renderer). The
// fixture endpoint and the automatic hand-off are both loopback-only, so neither exists on a
// deployed host. This lets browser QA inspect the exact Student View/PDF renderer without exposing
// an internal control or loading a second implementation.
const acceptanceFixture = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname)
  ? new URLSearchParams(window.location.search).get("acceptanceQa")
  : "";
if (acceptanceFixture) {
  window.setTimeout(async () => {
    const fixture = acceptanceFixture.replace(/[^A-Za-z0-9_-]/g, "");
    const response = await fetch(`/__acceptance/${fixture}-render-input.json`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${fixture} acceptance input.`);
    const frame = await prepareDiagnosticPrintFrameForQa(await response.json());
    const doc = frame.contentDocument;
    if (!doc) throw new Error("The isolated print document was not created.");
    const html = `<!doctype html>${doc.documentElement.outerHTML}`;
    document.open();
    document.write(html);
    document.close();
    document.documentElement.dataset.releaseQaReady = "true";
  }, 0);
}

function waitForFrameLoad(frame) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("The isolated print document timed out.")), 10000);
    frame.addEventListener("load", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

function removeForbiddenPrintOverlays(doc) {
  const forbidden = /^(?:ctrl\s*\+\s*m|ctrl\s*\+\s*shift|open assistant|accessibility menu|browser helper)$/i;
  for (const element of [...doc.querySelectorAll("body *")]) {
    const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
    if (forbidden.test(text) && !element.closest("#print-report")) element.remove();
  }
  for (const element of [...doc.body.children]) {
    if (element.id !== "print-report") element.remove();
  }
}

function assertStudentPrintBoundary(doc) {
  // Repair the PDF text layer BEFORE reading it: an injected soft hyphen or zero-width break is a
  // layout artefact, not a content defect, so it is normalised rather than used to block the export.
  sanitizePrintDomText(doc.querySelector("#print-report") || doc.body || doc);
  const text = String(doc.querySelector("#print-report")?.textContent || "");
  const forbidden = [
    ...STUDENT_FORBIDDEN_PATTERNS,
    /Ctrl\s*\+\s*M/i,
    /submissionGroupId/i,
    /reportVersionId/i,
    /parentReportId/i,
    /normalizedResponseFingerprint/i,
    /Report-Version and Progress Proof/i,
    /engine\/report rerun excluded/i,
    /Progress policy:/i,
    /legacy-[a-f0-9]/i
  ];
  const match = forbidden.find((pattern) => pattern.test(text));
  const unicodeIssues = unicodeIntegrityIssues(text, { studentFacing: true });
  if (match || unicodeIssues.length) throw new Error("The student PDF was blocked because internal or corrupted content was detected.");
  // The PDF text layer is checked separately from the canonical data. The canonical report is clean,
  // but a layout engine can inject a soft hyphen or zero-width break for line breaking that extracts
  // as a noncharacter (`cost-efficiency` copied out as `cost<U+FFFE>efficiency`). Every printable
  // node is sanitised before this point; if anything forbidden survives, the export fails rather
  // than producing a PDF whose copied text is corrupt.
  assertPrintableTextIntegrity(text);
}

// Sanitises every text node in the print DOM. Hyphens, en dashes, em dashes and non-breaking
// hyphens are preserved; only invisible break characters and Unicode noncharacters are removed, and
// a noncharacter sitting between two letters is restored to the hyphen it displaced.
function sanitizePrintDomText(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const cleaned = sanitizePrintableText(node.nodeValue);
    if (cleaned !== node.nodeValue) node.nodeValue = cleaned;
  }
}

// Fail-closed page-geometry gate. Runs after pagination, on the composed sheets, and refuses to
// export a document in which any sheet's content overflows its printable box or a page number is
// missing. Overflow here becomes text clipped by `overflow: hidden` in the PDF, which the reader
// would never know was missing — so the export fails loudly instead.
function assertPrintPageGeometry(doc) {
  const sheets = [...doc.querySelectorAll(".pdf-sheet")];
  if (!sheets.length) return { pageCount: 0, worstOverflowPx: 0 };
  const failures = [];
  let worstOverflowPx = 0;
  sheets.forEach((sheet, index) => {
    const content = sheet.querySelector(".pdf-sheet-content");
    if (!content) return;
    const overflow = content.scrollHeight - content.clientHeight;
    worstOverflowPx = Math.max(worstOverflowPx, overflow);
    if (overflow > PRINT_BOTTOM_RESERVE_PX) {
      failures.push(`page ${index + 1} overflows by ${overflow}px (${describePrintUnit(content.firstElementChild)})`);
    }
    if (!sheet.querySelector(".pdf-page-number")?.textContent) failures.push(`page ${index + 1} has no page number`);
  });
  if (failures.length) {
    throw new Error(`The report could not be paginated without clipping: ${failures.join("; ")}.`);
  }
  return { pageCount: sheets.length, worstOverflowPx };
}

function measureProtectedPrintBlocks(doc) {
  const protectedBlocks = [...doc.querySelectorAll([
    ".print-info",
    ".print-card",
    ".print-issue",
    ".print-feedback-primary-group",
    ".print-feedback-revision-group",
    ".print-exact-evidence-group",
    ".print-target-revision-group",
    ".print-plan-item",
    ".print-disclaimer"
  ].join(","))];
  const printableHeightPx = (297 - 15 - 18) * (96 / 25.4);
  for (const block of protectedBlocks) {
    block.dataset.printProtected = "true";
    const height = block.getBoundingClientRect().height;
    if (Number.isFinite(height) && height > printableHeightPx) {
      throw new Error("A protected report block is taller than one printable A4 page. Shorten that diagnostic item before export.");
    }
  }
  return { protectedBlockCount: protectedBlocks.length, printableHeightPx };
}

// Sub-pixel rounding allowance shared by the paginator and the fail-closed geometry gate, so the
// two can never disagree about what counts as overflow.
const PRINT_OVERFLOW_TOLERANCE_PX = 2;
// A 296mm sheet with a 252mm content box and 15mm/18mm padding leaves ~11mm of reserved bottom
// margin. Content may bleed into that reserve without being lost; beyond it, the export fails.
const PRINT_BOTTOM_RESERVE_PX = Math.round(11 * (96 / 25.4));

function composeDeterministicPrintPages(doc) {
  const root = doc.querySelector("#print-report");
  if (!root || root.dataset.paginationComplete === "true") return { pageCount: 0 };
  const sourcePages = [...root.querySelectorAll(":scope > .print-page")];
  if (!sourcePages.length) return { pageCount: 0 };

  const units = [];
  const cover = sourcePages.find((page) => page.classList.contains("print-cover"));
  if (cover) units.push({ node: cover.cloneNode(true), cover: true });
  for (const sourcePage of sourcePages.filter((page) => page !== cover)) {
    for (const section of [...sourcePage.querySelectorAll(":scope > .print-section")]) {
      units.push(...printSectionUnits(section));
    }
    const footer = sourcePage.querySelector(":scope > footer");
    if (footer) units.push({ node: footer.cloneNode(true), final: true });
  }

  root.replaceChildren();
  root.dataset.paginationComplete = "true";
  const sheets = [];
  let current = null;
  const createSheet = () => {
    const sheet = doc.createElement("article");
    sheet.className = "pdf-sheet";
    // `overflow: visible`, deliberately. The sheet is 296mm with 15mm/18mm padding, so the 252mm
    // content box is followed by 11mm of unused margin before the paper edge. A few pixels of
    // measurement difference between screen and print used to be CLIPPED here by `overflow: hidden`
    // — the reader lost the last line of a card and had no way to know. Letting it bleed into the
    // reserved bottom margin is lossless, and assertPrintPageGeometry() fails the export outright if
    // the overflow ever exceeds that reserve.
    sheet.style.cssText = "position:relative;box-sizing:border-box;width:210mm;height:296mm;padding:15mm 15mm 18mm;margin:0;overflow:visible;background:#fff;";
    const content = doc.createElement("div");
    content.className = "pdf-sheet-content";
    content.style.cssText = "box-sizing:border-box;width:100%;height:252mm;overflow:visible;";
    const pageNumber = doc.createElement("div");
    pageNumber.className = "pdf-page-number";
    sheet.append(content, pageNumber);
    root.append(sheet);
    sheets.push(sheet);
    current = content;
    return sheet;
  };

  // Placement is a work queue rather than a single pass: anything produced by splitting an oversized
  // unit goes back through the same fit check. The previous single-pass version appended split
  // fragments without re-measuring, which let a fragment overflow its fixed-height sheet and be
  // clipped by `overflow: hidden`.
  // Small deterministic allowance for sub-pixel rounding only. Because the export document now
  // measures with the print geometry itself, this does not need to absorb a metrics mismatch, so it
  // stays tight enough not to inflate the page count.
  const fits = () => current.scrollHeight <= current.clientHeight + PRINT_OVERFLOW_TOLERANCE_PX;
  const queue = [...units];
  while (queue.length) {
    const unit = queue.shift();
    if (unit.cover) {
      const sheet = createSheet();
      sheet.classList.add("pdf-cover-sheet");
      current.append(...[...unit.node.childNodes]);
      current = null;
      continue;
    }
    if (!current) createSheet();

    const sheetWasEmpty = current.childNodes.length === 0;
    current.append(unit.node);
    if (fits()) continue;

    // Does not fit here. If this sheet already had content, try the top of a fresh sheet.
    unit.node.remove();
    if (!sheetWasEmpty) {
      createSheet();
      current.append(unit.node);
      if (fits()) continue;
      unit.node.remove();
    }

    // Too tall even alone: break it into smaller units and re-measure each one.
    const splitUnits = splitOversizedFeedbackUnit(unit.node, doc);
    if (splitUnits.length > 1) {
      queue.unshift(...splitUnits.map((node) => ({ node })));
      continue;
    }
    throw new Error(`A protected report block is taller than one printable A4 page. [${describePrintUnit(unit.node)}]`);
  }
  // Any sheet left empty by the queue (for example a fresh sheet created immediately before a split)
  // is removed, so the export never contains a blank page.
  for (let index = sheets.length - 1; index >= 0; index -= 1) {
    const content = sheets[index].querySelector(".pdf-sheet-content");
    if (content && !content.childNodes.length) {
      sheets[index].remove();
      sheets.splice(index, 1);
    }
  }

  sheets.forEach((sheet, index) => {
    sheet.querySelector(".pdf-page-number").textContent = `Page ${index + 1} of ${sheets.length}`;
  });
  return { pageCount: sheets.length };
}

// Identifies an oversized print unit well enough to fix the content that caused it. Reported in the
// error only; nothing student-facing renders this.
function describePrintUnit(node) {
  if (!node) return "unknown unit";
  const heading = node.querySelector("h2, h3")?.textContent?.trim() || "";
  const classes = String(node.className || "").trim();
  const chars = String(node.textContent || "").replace(/\s+/g, " ").trim().length;
  return `${classes || "unit"}${heading ? ` / ${heading}` : ""} / ${chars} chars`;
}

function printSectionUnits(section) {
  const heading = section.querySelector(":scope > h2")?.cloneNode(true) || null;
  const grid = section.querySelector(":scope > .print-card-grid");
  if (grid) return groupedPrintUnits(section, heading, [...grid.children], "print-card-grid", 2);
  const issues = section.querySelector(":scope > .print-issue-list");
  if (issues) return groupedPrintUnits(section, heading, [...issues.children], "print-issue-list", 2);
  // Detailed Feedback packs TWO evidence groups per fragment. With a groupSize of 1 every card
  // became its own section fragment, and the panel padding around each fragment was enough to push
  // the next one onto a fresh sheet — that is what produced one-issue-per-page reports.
  const feedback = section.querySelector(":scope > .print-feedback-list");
  if (feedback) return groupedPrintUnits(section, heading, [...feedback.children], "print-feedback-list", 2);
  const patterns = section.querySelector(":scope > .print-language-pattern-list");
  if (patterns) {
    // The explanatory note belongs with the heading on the first fragment, never orphaned.
    const note = section.querySelector(":scope > .print-note");
    return groupedPrintUnits(section, heading, [...patterns.children], "print-language-pattern-list", 4, note);
  }
  const plan = section.querySelector(":scope > .print-plan");
  if (plan) return groupedPrintUnits(section, heading, [...plan.children], "print-plan", 2);
  return [{ node: section.cloneNode(true) }];
}

function groupedPrintUnits(section, heading, children, containerClass, groupSize, lead = null) {
  if (!children.length) return [{ node: section.cloneNode(true) }];
  const groups = [];
  for (let index = 0; index < children.length; index += groupSize) {
    const wrapper = section.cloneNode(false);
    wrapper.classList.add("pdf-section-fragment");
    if (index === 0 && heading) wrapper.append(heading.cloneNode(true));
    if (index === 0 && lead) wrapper.append(lead.cloneNode(true));
    const container = section.ownerDocument.createElement("div");
    container.className = containerClass;
    children.slice(index, index + groupSize).forEach((child) => container.append(child.cloneNode(true)));
    wrapper.append(container);
    groups.push({ node: wrapper });
  }
  return groups;
}

function splitOversizedFeedbackUnit(node, doc) {
  // A fragment holding several list items splits into one fragment per item before any card is
  // taken apart, so a shared quotation and its issues stay together whenever they can. This is
  // generic across every grouped section, so an unusually dense report degrades into more pages
  // rather than failing the export.
  const container = node.querySelector(".print-feedback-list, .print-language-pattern-list, .print-card-grid, .print-plan, .print-issue-list");
  const children = [...(container?.children || [])];
  if (container && children.length > 1) {
    const containerClass = container.className;
    return children.map((child, index) => {
      const wrapper = node.cloneNode(false);
      wrapper.classList.add("pdf-section-fragment");
      if (index === 0) {
        const heading = node.querySelector(":scope > h2");
        if (heading) wrapper.append(heading.cloneNode(true));
      }
      const list = doc.createElement("div");
      list.className = containerClass;
      list.append(child.cloneNode(true));
      wrapper.append(list);
      return wrapper;
    });
  }
  // A single shared-evidence group that still will not fit becomes one fragment per issue. The
  // quotation is repeated so each fragment stays readable on its own; every issue keeps its own
  // card, so no feedback is lost to the split.
  const group = node.querySelector(".print-feedback-group");
  const groupCards = [...(group?.querySelectorAll(":scope > .print-feedback-card") || [])];
  if (group && groupCards.length > 1) {
    const sharedEvidence = group.querySelector(":scope > .print-feedback-shared-evidence");
    return groupCards.map((groupCard, index) => {
      const wrapper = node.cloneNode(false);
      wrapper.classList.add("pdf-section-fragment");
      if (index === 0) {
        const heading = node.querySelector(":scope > h2");
        if (heading) wrapper.append(heading.cloneNode(true));
      }
      const list = doc.createElement("div");
      list.className = "print-feedback-list";
      const splitGroup = group.cloneNode(false);
      if (sharedEvidence) splitGroup.append(sharedEvidence.cloneNode(true));
      splitGroup.append(groupCard.cloneNode(true));
      list.append(splitGroup);
      wrapper.append(list);
      return wrapper;
    });
  }

  const card = node.querySelector(".print-feedback-card");
  const primary = card?.querySelector(":scope > .print-feedback-primary-group");
  const revision = card?.querySelector(":scope > .print-feedback-revision-group");
  if (!card || !primary || !revision) return [node];
  return [primary, revision].map((group, index) => {
    const wrapper = node.cloneNode(false);
    wrapper.classList.add("pdf-section-fragment");
    if (index === 0) {
      const heading = node.querySelector(":scope > h2");
      if (heading) wrapper.append(heading.cloneNode(true));
    }
    const list = doc.createElement("div");
    list.className = "print-feedback-list";
    const splitCard = card.cloneNode(false);
    splitCard.classList.add("print-feedback-card-split");
    splitCard.append(group.cloneNode(true));
    list.append(splitCard);
    wrapper.append(list);
    return wrapper;
  });
}

function renderPrintReport(analysis) {
  if (!printReport) return;

  const normalized = normalizeClientAnalysis(analysis || currentAnalysis);
  const language = normalizeReportLanguage(normalized.reportLanguage);
  const copy = getReportCopy(language);
  const taskType = normalized.taskType || "Task 2";
  const config = getTaskProgressConfig(taskType);
  const criteriaNames = config.criteria;
  const frameworkNames = config.framework;
  const feedbackCards = normalized.feedbackCards || [];
  const languagePatterns = Array.isArray(normalized.languagePatternSummary) ? normalized.languagePatternSummary : [];
  const topIssues = buildDashboardIssues(normalized.top3Issues, feedbackCards);
  const taskRecords = distinctProgressRecords(progressRecords, taskType);
  const taskSubtype = taskType === "Task 1"
    ? normalized.visualType || "Not Sure"
    : normalized.task2EssayTypeLabel || normalized.essayType || "Not Sure";
  const task2RouteLabel = normalized.stanceRequired ? copy.positionAndRoute : `${taskSubtype} ${copy.route}`;
  const task2RouteText = normalized.stanceRequired
    ? `${normalized.detectedPosition || "unclear"} (${normalized.positionConfidence || "low"} confidence). ${normalized.bodyRouteSummary || ""}`
    : normalized.bodyRouteSummary || "";

  printReport.dataset.reportLanguage = language;
  printReport.setAttribute("lang", language === "th" ? "th" : "en");
  printReport.innerHTML = `
    <article class="print-page print-cover">
      <div class="print-report-header">
        <p>${escapePrintHtml(copy.productEyebrow)}</p>
        <h1>${escapePrintHtml(copy.reportTitle)}</h1>
      </div>
      <div class="print-summary-grid">
        ${renderPrintInfo(copy.student, normalized.studentDisplayNameSnapshot || "-")}
        ${renderPrintInfo(copy.date, formatDateTime(normalized.generatedAt || new Date().toISOString(), language))}
        ${renderPrintInfo(copy.taskType, taskType)}
        ${renderPrintInfo(taskType === "Task 1" ? copy.visualType : copy.essayType, taskSubtype)}
        ${renderPrintInfo(copy.wordCount, String(normalized.wordCount ?? "-"))}
        ${renderPrintInfo(copy.reportLanguage, copy.languageName)}
        ${renderPrintInfo(copy.estimatedBandRange, normalized.estimatedBandRange || "-")}
      </div>
      <section class="print-section print-section-panel print-executive-panel">
        <h2>${escapePrintHtml(copy.executiveSummary)}</h2>
        ${renderPrintCallout(copy.mainLimiter, normalized.mainScoreLimitingFactor)}
        ${renderPrintCallout(copy.urgentRepair, normalized.mostUrgentRepair)}
        ${normalized.wordCountStatus === "below_minimum" ? renderPrintCallout(copy.wordCountStatus, language === "th" ? `ขาด ${normalized.wordShortfall} คำจากขั้นต่ำ ${normalized.minimumWordCount} คำ` : `${normalized.wordShortfall} ${normalized.wordShortfall === 1 ? "word" : "words"} below the ${normalized.minimumWordCount}-word minimum`) : ""}
        ${taskType === "Task 2" && normalized.completionStatus ? renderPrintCallout(copy.completionStatus, `${normalized.completionStatus}. ${normalized.completionEvidence?.join(" | ") || ""}`) : ""}
        ${normalized.taskAchievementCapReason ? renderPrintCallout(copy.taskAchievementCap, normalized.taskAchievementCapReason) : ""}
        ${normalized.overviewAccuracyStatus ? renderPrintCallout(copy.overviewAccuracy, normalized.overviewAccuracyStatus) : ""}
        <p class="print-note">${escapePrintHtml(copy.estimatedNote)}</p>
      </section>
    </article>

    <article class="print-page">
      ${taskType === "Task 2" && normalized.bodyRouteSummary ? `<section class="print-section print-section-panel print-route-section">
        <h2>${escapePrintHtml(task2RouteLabel)}</h2>
        ${renderPrintCallout(copy.detectedRouteLabel, task2RouteText)}
      </section>` : ""}
      <section class="print-section print-section-panel">
        <h2>${escapePrintHtml(copy.criteriaBreakdown)}</h2>
        <div class="print-card-grid">
          ${criteriaNames.map((name) => renderPrintCriteriaCard(name, normalized.criteriaScores?.[name], normalized.estimatedBandRange)).join("")}
        </div>
      </section>
      <section class="print-section print-section-panel">
        <h2>${escapePrintHtml(copy.frameworkBreakdown)}</h2>
        <div class="print-card-grid">
          ${frameworkNames.map((name) => renderPrintFrameworkCard(name, normalized.kruPomScores?.[name], language)).join("")}
        </div>
      </section>
    </article>

    <article class="print-page">
      <section class="print-section print-section-panel">
        <h2>${escapePrintHtml(copy.topIssues)}</h2>
        <div class="print-issue-list">
          ${topIssues.length ? topIssues.map((issue, index) => renderPrintTopIssue(issue, feedbackCardForIssue(issue, feedbackCards, index), index, copy, language)).join("") : `<p>${escapePrintHtml(copy.noIssues)}</p>`}
        </div>
      </section>
    </article>

    <article class="print-page">
      <section class="print-section print-section-panel">
        <h2>${escapePrintHtml(language === "th" ? "สรุปการตรวจรายย่อหน้า" : "Paragraph Coverage Summary")}</h2>
        <div class="print-card-grid">
          ${(normalized.paragraphCoverage || []).map((item) => `<div class="print-card">
            <span>${escapePrintHtml(item.paragraphLabel)}</span>
            <strong><em class="print-badge ${statusClass(item.status)}">${escapePrintHtml(displayStatus(item.status, language))}</em></strong>
            <p>${escapePrintHtml(item.paragraphFunction)}</p>
            <p>${escapePrintHtml(item.diagnosis)}</p>
            <p><strong>${escapePrintHtml(copy.studentAction)}:</strong> ${escapePrintHtml(item.priorityRepair)}</p>
          </div>`).join("")}
        </div>
      </section>
      <section class="print-section print-section-panel print-detailed-section">
        <h2>${escapePrintHtml(copy.detailedFeedback)}</h2>
        <div class="print-feedback-list">
          ${feedbackCards.length
            ? groupCardsBySharedSentence(feedbackCards).map((group) => renderPrintFeedbackGroup(group, copy, language)).join("")
            : `<p>${escapePrintHtml(copy.noFeedback)}</p>`}
        </div>
      </section>
    </article>
    ${languagePatterns.length ? `<article class="print-page">
      <section class="print-section print-section-panel print-language-pattern-section">
        <h2>${escapePrintHtml(language === "th" ? "สรุปรูปแบบภาษาที่ควรตรวจ" : "Language Pattern Summary")}</h2>
        <p class="print-note">${escapePrintHtml(language === "th"
          ? "รายการต่อไปนี้ผ่านการตรวจสอบแล้ว แต่มีลำดับความสำคัญรองจาก Detailed Feedback ด้านบน"
          : "These points were validated but rank below the Detailed Feedback above. Repair the detailed issues first, then complete a full-response scan for these patterns.")}</p>
        <div class="print-language-pattern-list">
          ${languagePatterns.map((row) => renderPrintLanguagePatternRow(row, copy, language)).join("")}
        </div>
      </section>
    </article>` : ""}

    <article class="print-page">
      <section class="print-section print-section-panel">
        <h2>${escapePrintHtml(copy.repairPlan)}</h2>
        <div class="print-plan">
          ${(normalized.practicePlan || []).slice(0, 7).map((item, index) => renderPrintPlanItem(item, index, copy)).join("")}
        </div>
      </section>
      <section class="print-section print-section-panel">
        <h2>${escapePrintHtml(taskType)} ${escapePrintHtml(copy.progressSummary)}</h2>
        ${renderPrintProgressSummary(taskType, taskRecords, normalized, currentProgressSummary, copy)}
      </section>
      <section class="print-section print-section-panel print-disclaimer">
        <h2>${escapePrintHtml(copy.disclaimer)}</h2>
        <p>${escapePrintHtml(normalized.disclaimer || copy.disclaimerText)}</p>
      </section>
      <footer>${escapePrintHtml(copy.footer)}</footer>
    </article>`;
  assertStudentPrintBoundary(document);
}

function renderPrintInfo(label, value) {
  return `<div class="print-info"><span>${escapePrintHtml(label)}</span><strong>${escapePrintHtml(value || "-")}</strong></div>`;
}

function renderPrintCallout(label, value) {
  return `<div class="print-callout"><span>${escapePrintHtml(label)}</span><p>${escapePrintHtml(value || "-")}</p></div>`;
}

function renderPrintCriteriaCard(name, value, fallbackRange) {
  const range = typeof value === "string" ? value : value?.range;
  const diagnosis = typeof value === "object" ? value.diagnosis : "";
  const evidence = typeof value === "object" ? value.evidence : "";
  return `<div class="print-card">
    <span>${escapePrintHtml(name)}</span>
    <strong>${escapePrintHtml(range || fallbackRange || "-")}</strong>
    <p>${escapePrintHtml(diagnosis || "No diagnosis available for this criterion.")}</p>
    ${evidence ? `<blockquote>${escapePrintHtml(evidence)}</blockquote>` : ""}
  </div>`;
}

function renderPrintFrameworkCard(name, value, language = "en") {
  const status = value?.status || "Needs Work";
  return `<div class="print-card">
    <span>${escapePrintHtml(name)}</span>
    <strong><em class="print-badge ${statusClass(status)}">${escapePrintHtml(displayStatus(status, language))}</em></strong>
    <p>${escapePrintHtml(value?.diagnosis || "No framework diagnosis available yet.")}</p>
  </div>`;
}

function renderPrintTopIssue(issue, card = {}, index, copy = getReportCopy("en"), language = "en") {
  const criteria = toArray(issue.affectedCriteria || issue.criteria || card.criteria).join(", ");
  const framework = toArray(card.framework).join(", ");
  const evidenceItems = Array.isArray(issue.evidenceItems) && issue.evidenceItems.length
    ? issue.evidenceItems
    : [{
        paragraphLocation: issue.paragraphLocation || card.paragraphLocation || "-",
        exactSentence: issue.exactSentence || card.exactSentence || "Exact sentence is available in the detailed feedback section.",
        evidenceRole: "Primary evidence"
      }];
  const paragraphLocations = Array.isArray(issue.paragraphLocations) && issue.paragraphLocations.length
    ? issue.paragraphLocations
    : evidenceItems.map((item) => item.paragraphLocation).filter(Boolean);
  // Top Issues is the priority index, not a second copy of Detailed Feedback. It names where each
  // issue lives and shows a short anchor quote; the full sentence, revision and rationale are
  // printed once, in Detailed Feedback. Repeating the whole evidence block here was both the main
  // source of duplicated prose and roughly two wasted pages per report.
  const anchor = shortenPrintEvidence(evidenceItems[0]?.exactSentence || "");
  return `<div class="print-issue">
    <div class="print-issue-heading">
      <span>${index + 1}</span>
      <div>
        <h3>${escapePrintHtml(issue.title || issue.issueType || "Evidence-based issue")}</h3>
        <p><em class="print-badge ${statusClass(issue.severity)}">${escapePrintHtml(displayStatus(issue.severity || "Needs Work", language))}</em> ${criteria ? escapePrintHtml(criteria) : ""}</p>
      </div>
    </div>
    <p><strong>${escapePrintHtml(copy.paragraphLocations)}:</strong> ${escapePrintHtml([...new Set(paragraphLocations)].join("; ") || "-")}${evidenceItems.length > 1 ? ` (${escapePrintHtml(String(evidenceItems.length))} locations)` : ""}</p>
    ${anchor ? `<blockquote class="print-issue-anchor">${escapePrintHtml(anchor)}</blockquote>` : ""}
    ${printRow(copy.diagnosis, issue.diagnosis || issue.summary || card.whyItLimitsBand)}
    ${printRow(copy.studentAction, issue.studentAction || card.studentAction)}
  </div>`;
}

// Shortens an evidence sentence to an anchor quote. Truncation happens on a word boundary and is
// marked with an ellipsis, so the reader can see it is an extract and find the full sentence in
// Detailed Feedback.
function shortenPrintEvidence(value, limit = 150) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 60 ? boundary : limit).trim()}...`;
}

function feedbackCardForIssue(issue = {}, cards = [], fallbackIndex = 0) {
  const match = String(issue.feedbackCardId || "").match(/^card-(\d+)$/);
  const referencedIndex = match ? Number(match[1]) - 1 : -1;
  if (referencedIndex >= 0 && cards[referencedIndex]) return cards[referencedIndex];
  const evidence = normalizeComparableText(issue.exactSentence);
  const category = normalizeComparableText(firstText(
    issue.issueCategory,
    issue.primaryCategory,
    issue.issueType,
    issue.title
  ));
  if (evidence) {
    // More than one issue can legitimately share one source sentence. Match the canonical category
    // as well as the sentence so Thesis-to-Body Promise can never inherit Comparative Judgement's
    // Student Action merely because both were diagnosed in the same thesis sentence.
    const evidenceMatch = cards.find((card) => (
      normalizeComparableText(card.exactSentence) === evidence &&
      (!category || category === normalizeComparableText(firstText(
        card.issueCategory,
        card.primaryCategory,
        card.issueType,
        card.title
      )))
    ));
    if (evidenceMatch) return evidenceMatch;
  }
  return cards[fallbackIndex] || {};
}

function normalizeComparableText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sanitizePrintText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B\u2060\uFFFD\uFFFE\uFFFF]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\bLFC[\s\u00a0]+CPC\b/g, "LFC-CPC")
    .replace(/\bTESL\b/g, "TEEL")
    .replace(/\bBand\s+([0-9])\.\s+([05])\b/gi, "Band $1.$2")
    .replace(/([^.!?]*\b(?:SAR|Situation[^.!?]{0,120}Result|Result[^.!?]{0,120}Situation)\b[^.!?]*?)\bAnalysis\b/g, "$1Action")
    .replace(/([\u201d"\u2019'\w]),(?=[\u201c"\u2018'\w])/g, "$1, ")
    .replace(/([.,;:!?])[ \t]+(["'\u201d\u2019])/g, "$1$2")
    .replace(/[ \t]+([\u201d\u2019])/g, "$1")
    .replace(/([\u201c\u2018])[ \t]+/g, "$1")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/ {2,}/g, " ");
}

function escapePrintHtml(value) {
  return escapeHtml(sanitizePrintText(value));
}

function normalizePrintFeedbackCard(card = {}) {
  return {
    ...card,
    exactSentence: sanitizePrintText(card.exactSentence),
    targetedRevision: sanitizePrintText(card.targetedRevision)
  };
}
// Renders one evidence group. When several canonical issues quote the SAME sentence the quotation
// is printed once and each issue keeps its own card underneath it — separate issueId, category,
// diagnosis, Student Action and revision state. Nothing is merged; only the repeated quotation is
// removed, which is what previously forced a near-duplicate page per issue.
function renderPrintFeedbackGroup(group, copy = getReportCopy("en"), language = "en") {
  const cards = Array.isArray(group?.cards) ? group.cards : [];
  if (cards.length <= 1) return renderPrintFeedbackCard(cards[0] || {}, copy, language);
  const first = normalizePrintFeedbackCard(cards[0]);
  return `<div class="print-feedback-group">
    <div class="print-feedback-shared-evidence">
      <p class="print-keep-with-next"><strong>${escapePrintHtml(copy.paragraphLocation)}:</strong> ${escapePrintHtml(first.paragraphLocation || "-")}</p>
      <div class="print-exact-evidence-group">
        <p class="print-keep-with-next"><strong>${escapePrintHtml(copy.exactSentence)}</strong></p>
        <blockquote>${escapePrintHtml(first.exactSentence || "-")}</blockquote>
      </div>
      <p class="print-shared-evidence-note">${escapePrintHtml(language === "th"
        ? `ประโยคนี้มี ${cards.length} ประเด็นแยกกัน`
        : `${cards.length} separate issues were identified in this sentence.`)}</p>
    </div>
    ${cards.map((card) => renderPrintFeedbackCard(card, copy, language, { evidenceRenderedAbove: true })).join("")}
  </div>`;
}

function renderPrintFeedbackCard(card, copy = getReportCopy("en"), language = "en", { evidenceRenderedAbove = false } = {}) {
  const normalizedCard = normalizePrintFeedbackCard(card);
  const severity = normalizedCard.severity || "Needs Work";
  return `<div class="print-feedback-card${evidenceRenderedAbove ? " print-feedback-card-shared" : ""}">
    <div class="print-feedback-primary-group">
      <div class="print-feedback-header-row">
        <h3>${escapePrintHtml(normalizedCard.issueCategory || normalizedCard.issueType || "Diagnostic Issue")}</h3>
        <em class="print-badge ${statusClass(severity)}">${escapePrintHtml(displayStatus(severity, language))}</em>
      </div>
      ${evidenceRenderedAbove ? "" : `<p class="print-keep-with-next"><strong>${escapePrintHtml(copy.paragraphLocation)}:</strong> ${escapePrintHtml(normalizedCard.paragraphLocation || "-")}</p>
      <div class="print-exact-evidence-group">
        <p class="print-keep-with-next"><strong>${escapePrintHtml(copy.exactSentence)}</strong></p>
        <blockquote>${escapePrintHtml(normalizedCard.exactSentence || "-")}</blockquote>
      </div>`}
      ${printRow(language === "th" ? "จุดที่ต้องแก้" : "Target", normalizedCard.targetSpan)}
      ${printRow(copy.sentenceFunction, normalizedCard.sentenceFunction)}
      ${printRow(copy.whyLimits, normalizedCard.whyItLimitsBand)}
      ${printRow(copy.kruPomDiagnosis, distinctDiagnosis(normalizedCard.kruPomDiagnosis, normalizedCard.whyItLimitsBand))}
    </div>
    <div class="print-feedback-revision-group">
      ${normalizedCard.revisionType ? `<p class="print-keep-with-next"><strong>${escapePrintHtml(copy.revisionType)}:</strong> ${escapePrintHtml(normalizedCard.revisionType)}</p>` : ""}
      ${hasPrintValue(normalizedCard.targetedRevision) ? `<div class="print-target-revision-group">
        <p class="print-keep-with-next"><strong>${escapePrintHtml(copy.targetedRevision)}</strong></p>
        <div class="print-revision">${escapePrintHtml(normalizedCard.targetedRevision)}</div>
      </div>` : ""}
      ${printRow(copy.whyStronger, normalizedCard.whyRevisionIsStronger)}
      ${printRow(copy.studentAction, normalizedCard.studentAction)}
    </div>
  </div>`;
}

// A field with nothing to say is omitted rather than printed as a placeholder hyphen. "-" and "n/a"
// are treated as absent because upstream builders use them as empty markers.
function hasPrintValue(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return Boolean(text) && !/^(?:-+|n\/a|not applicable|none)$/i.test(text);
}

function printRow(label, value) {
  if (!hasPrintValue(value)) return "";
  return `<p><strong>${escapePrintHtml(label)}:</strong> ${escapePrintHtml(value)}</p>`;
}

// The engine often produces the same sentence for "Why This Limits the Band" and the Kru Pom
// framework diagnosis. Printing both is duplicated prose that costs a third of a card's height and
// tells the student nothing new, so the framework line is kept only when it genuinely differs.
function distinctDiagnosis(diagnosis, whyItLimitsBand) {
  const normalise = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[.]+$/, "");
  const candidate = normalise(diagnosis);
  if (!candidate) return "";
  const reference = normalise(whyItLimitsBand);
  if (!reference) return diagnosis;
  if (candidate === reference || reference.includes(candidate) || candidate.includes(reference)) return "";
  return diagnosis;
}

// One compact Language Pattern Summary row: category, where it occurs, the short target span, a
// short diagnosis, a short action and the recurrence note when the pattern repeats.
function renderPrintLanguagePatternRow(row = {}, copy = getReportCopy("en"), language = "en") {
  return `<div class="print-language-pattern-row">
    <div class="print-language-pattern-head">
      <strong>${escapePrintHtml(row.category || "Language pattern")}</strong>
      <span>${escapePrintHtml(row.paragraphLocation || "-")}</span>
      ${row.recurrence ? `<em class="print-badge print-badge-recurrence">${escapePrintHtml(row.recurrence)}</em>` : ""}
    </div>
    ${row.targetSpan ? `<p class="print-language-pattern-span">${escapePrintHtml(language === "th" ? "จุดที่ต้องแก้" : "Target")}: ${escapePrintHtml(row.targetSpan)}</p>` : ""}
    ${row.diagnosis ? `<p>${escapePrintHtml(row.diagnosis)}</p>` : ""}
    ${row.action ? `<p><strong>${escapePrintHtml(copy.studentAction)}:</strong> ${escapePrintHtml(row.action)}</p>` : ""}
  </div>`;
}

function renderPrintPlanItem(item, index, copy = getReportCopy("en")) {
  return `<div class="print-plan-item">
    <span>${escapePrintHtml(copy.day)} ${escapePrintHtml(item.day || index + 1)}</span>
    <p><strong>${escapePrintHtml(item.title || "Repair focus")}</strong><br>${escapePrintHtml(item.task || item.action || "-")}</p>
  </div>`;
}

function renderPrintProgressSummary(taskType, records, analysis, serverSummary, copy = getReportCopy("en")) {
  const summary = normalizeProgressSummary(records, taskType, analysis, serverSummary);
  const validatedVersionCount = validatedStudentReportVersionCount(summary);
  const cells = [
    renderPrintInfo(`${copy.previousSubmissions} (${taskType})`, String(summary.previousSubmissionCount || 0)),
    renderPrintInfo(copy.previousRange, summary.previousSubmissionCount ? summary.previousEstimatedRange || "-" : copy.noPrevious),
    renderPrintInfo(copy.latestRange, summary.latestEstimatedRange || analysis?.estimatedBandRange || "-"),
    renderPrintInfo(copy.currentRepair, summary.currentMainRepair || analysis?.mostUrgentRepair || "-"),
    renderPrintInfo(copy.repeatedIssue, summary.repeatedIssue || copy.noRepeated)
  ];
  if (validatedVersionCount !== null) {
    cells.push(renderPrintInfo(copy.reportVersions, String(validatedVersionCount)));
  }
  return `<div class="print-summary-grid print-progress-summary-grid">${cells.join("")}</div>`;
}

function validatedStudentReportVersionCount(summary = {}) {
  const versions = Array.isArray(summary.reportVersions) ? summary.reportVersions : [];
  const groupId = String(summary.currentSubmissionGroupId || "").trim();
  if (!groupId || !versions.length) return null;
  const exactGroupVersions = versions.filter((version) => String(version.submissionGroupId || "").trim() === groupId);
  return exactGroupVersions.length || null;
}

function formatDateTime(value, language = "en") {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(normalizeReportLanguage(language) === "th" ? "th-TH" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function loadProgressHistory() {
  if (!currentUser) return;
  if (isTeacherAccount(currentUser) && !progressSelectedStudentToken) {
    progressRecords = [];
    progressSummariesByTask = {};
    renderProgressTracker();
    return;
  }

  try {
    const progressToken = isTeacherAccount(currentUser) ? progressSelectedStudentToken : selectedStudentProfileToken;
    const query = progressToken ? `?student=${encodeURIComponent(progressToken)}` : "";
    const response = await fetch(`/api/progress${query}`);
    const result = await readJsonResponse(response, "Progress history could not be loaded.");
    if (!response.ok || !result.ok) throw new Error(result.error || "Could not load progress history.");
    progressRecords = Array.isArray(result.records) ? result.records : [];
    currentProgressSummary = result.summary || currentProgressSummary;
    progressSummariesByTask = result.summariesByTask || {};
  } catch {
    progressRecords = [];
    progressSummariesByTask = {};
  }

  renderProgressTracker();
  if (currentAnalysis) {
    document.querySelector("#report-preview").innerHTML = renderReportPreview(currentAnalysis);
  }
}

function renderProgressTracker() {
  if (!progressEmpty || !progressContent) return;

  const records = sortProgressRecords(progressRecords);
  const validRecords = distinctProgressRecords(records);
  const teacherNeedsSelection = isTeacherAccount(currentUser) && !progressSelectedStudentToken;
  const hasValidRecords = validRecords.length > 0;
  progressEmpty.classList.toggle("hidden", hasValidRecords);
  progressContent.classList.toggle("visible", records.length > 0 || hasValidRecords);
  if (teacherNeedsSelection) {
    progressEmptyEyebrow.textContent = "Student selection required";
    progressEmptyTitle.textContent = "Select a student to view progress";
    progressEmptyText.textContent = "Use the searchable student dashboard above. Task 1 and Task 2 history will remain strictly separated.";
    return;
  }
  if (!hasValidRecords) {
    const profile = [...studentProfiles, ...archivedStudentProfiles].find((item) => item.profileToken === progressSelectedStudentToken);
    progressEmptyEyebrow.textContent = "No valid progress data yet";
    progressEmptyTitle.textContent = `No progress data yet${profile?.displayName ? ` for ${profile.displayName}` : ""}`;
    progressEmptyText.textContent = records.length
      ? "Saved reports exist, but all are marked invalid and are excluded from progress calculations. They remain available in Activity History."
      : "The tracker will appear after this student’s first successful analysis.";
  }
  if (!records.length && !hasValidRecords) return;

  activeProgressTab = normalizeProgressTab(activeProgressTab || getLatestProgressTask() || "Task 2");
  updateProgressTabUi();

  task1ProgressBody.innerHTML = renderTaskProgress("Task 1", validRecords.filter((record) => record.taskType === "Task 1"), progressSummariesByTask["Task 1"]);
  task2ProgressBody.innerHTML = renderTaskProgress("Task 2", validRecords.filter((record) => record.taskType === "Task 2"), progressSummariesByTask["Task 2"]);
  historyTableBody.innerHTML = records.map((record) => renderHistoryRow(record)).join("");
}

function setActiveProgressTab(tabName) {
  activeProgressTab = normalizeProgressTab(tabName);
  updateProgressTabUi();
}

function updateProgressTabUi() {
  progressTabs.forEach((tab) => {
    const isActive = normalizeProgressTab(tab.dataset.progressTab) === activeProgressTab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  progressPanels.forEach((panel) => {
    const isTask1 = panel.id === "task1-progress-panel" && activeProgressTab === "Task 1";
    const isTask2 = panel.id === "task2-progress-panel" && activeProgressTab === "Task 2";
    const isHistory = panel.id === "activity-progress-panel" && activeProgressTab === "history";
    panel.classList.toggle("active-progress-panel", isTask1 || isTask2 || isHistory);
  });
}

function normalizeProgressTab(tabName) {
  if (tabName === "Task 1") return "Task 1";
  if (tabName === "history") return "history";
  return "Task 2";
}

function getLatestProgressTask() {
  const latest = distinctProgressRecords(progressRecords).at(-1);
  return latest?.taskType === "Task 1" ? "Task 1" : latest?.taskType === "Task 2" ? "Task 2" : "";
}

function renderTaskProgress(taskType, records, serverSummary = {}) {
  const config = getTaskProgressConfig(taskType);
  if (!records.length) {
    return `<article class="progress-empty task-progress-empty">
      <p class="eyebrow">${escapeHtml(config.emptyEyebrow)}</p>
      <h3>${escapeHtml(config.emptyTitle)}</h3>
      <p>${escapeHtml(config.emptyText)}</p>
      <button class="primary-button" type="button" data-start-task="${escapeHtml(taskType)}">${escapeHtml(config.emptyButton)}</button>
    </article>`;
  }

  const latest = records.at(-1);
  const latestVersions = reportVersionsForRecord(latest, progressRecords);
  const previousRange = serverSummary.previousEstimatedRange || "No previous submission";
  const changeLabel = ({ up: "Improved", down: "Lower", unchanged: "Unchanged", new: "New baseline" })[serverSummary.changeIndicator] || "New baseline";
  return `
    <div class="progress-summary-grid">
      <article class="progress-stat">
        <span>Valid ${escapeHtml(taskType)} Reports</span>
        <strong>${Number(serverSummary.reportCount ?? records.length)} report${Number(serverSummary.reportCount ?? records.length) === 1 ? "" : "s"}</strong>
      </article>
      <article class="progress-stat">
        <span>Previous &rarr; Current Range</span>
        <strong>${escapeHtml(previousRange)} &rarr; ${escapeHtml(serverSummary.latestEstimatedRange || latest.estimatedBandRange || "-")} (${escapeHtml(changeLabel)})</strong>
      </article>
      <article class="progress-stat">
        <span>Current Main ${escapeHtml(taskType)} Repair</span>
        <strong>${escapeHtml(serverSummary.currentMainRepair || latest.mostUrgentRepair || "-")}</strong>
      </article>
      <article class="progress-stat">
        <span>Most Repeated ${escapeHtml(taskType)} Issue</span>
        <strong>${escapeHtml(serverSummary.repeatedIssue || "No issue has appeared in at least two valid reports")}</strong>
      </article>
      <article class="progress-stat">
        <span>Latest Essay Report Versions</span>
        <strong>${Number(serverSummary.reportVersionCount || latestVersions.length || 1)} version${Number(serverSummary.reportVersionCount || latestVersions.length || 1) === 1 ? "" : "s"}</strong>
      </article>
    </div>

    <article class="progress-card">
      <div class="block-heading">
        <h3>Latest Essay Report Version History</h3>
        <span>engine reruns are excluded from progress trends</span>
      </div>
      <div class="issue-timeline">${latestVersions.map((record, index) => renderReportVersionItem(record, index)).join("")}</div>
    </article>

    <article class="progress-card">
      <div class="block-heading">
        <h3>${escapeHtml(taskType)} Estimated Band Range History</h3>
        <span>visual trend only</span>
      </div>
      <div class="range-chart">${renderRangeChart(records)}</div>
      <p class="progress-note">Visual trend uses the midpoint of the estimated range only. This is not an official IELTS score.</p>
      <p class="progress-note">${escapeHtml(config.note)}</p>
    </article>

    <article class="progress-card">
      <div class="block-heading">
        <h3>Criteria Trend for ${escapeHtml(taskType)}</h3>
        <span>first attempt to latest</span>
      </div>
      <div class="criteria-trend">${renderCriteriaTrend(records, config.criteria)}</div>
    </article>

    <article class="progress-card">
      <div class="block-heading">
        <h3>Kru Pom ${escapeHtml(taskType)} Framework Trend</h3>
        <span>task-specific repair skills</span>
      </div>
      <div class="criteria-trend">${renderFrameworkTrend(records, config.framework)}</div>
    </article>

    <article class="progress-card">
      <div class="block-heading">
        <h3>${escapeHtml(taskType)} Issue History</h3>
        <span>submission timeline</span>
      </div>
      <div class="issue-timeline">${records.map((record, index) => renderIssueHistoryItem(record, index)).join("")}</div>
    </article>

    <article class="progress-card">
      <div class="block-heading">
        <h3>${escapeHtml(taskType)} Report History</h3>
        <span>private to this student</span>
      </div>
      <div class="history-table-wrap">
        <table class="history-table">
          <thead><tr><th>Date</th><th>Type</th><th>Range</th><th>Main Issue</th><th>Action</th></tr></thead>
          <tbody>${records.map((record) => renderTaskHistoryRow(record)).join("")}</tbody>
        </table>
      </div>
    </article>`;
}

function renderReportVersionItem(record, index) {
  const date = record?.dateTime ? new Date(record.dateTime).toLocaleString("en-GB") : "-";
  const reason = ({ "engine-upgrade": "Engine upgrade", "explicit-rerun": "Explicit rerun", "first-analysis": "First analysis" })[record?.analysisReason] || "Report version";
  return `<article class="issue-history-item">
    <span>Version ${index + 1}</span>
    <h4>${escapeHtml(reason)} | ${escapeHtml(record?.engineVersion || record?.appVersion || "version not recorded")}</h4>
    <p>${escapeHtml(date)} | ${index === 0 ? "Progress baseline" : "Excluded from progress trend and repeated-issue counts"}</p>
  </article>`;
}

function renderTaskHistoryRow(record) {
  const date = record.dateTime ? new Date(record.dateTime).toLocaleDateString("en-GB") : "-";
  const type = record.publicTaskType || record.essayType || record.visualType || "-";
  return `<tr>
    <td>${escapeHtml(date)}</td>
    <td>${escapeHtml(type)}</td>
    <td>${escapeHtml(record.estimatedBandRange || "-")}</td>
    <td>${escapeHtml(getMainIssue(record))}</td>
    <td>
      <button class="text-button" type="button" data-history-report="${escapeHtml(record.submissionId)}">Open Report</button>
      <button class="text-button" type="button" data-history-print="${escapeHtml(record.submissionId)}">Open PDF</button>
      <button class="text-button" type="button" data-history-reanalyze="${escapeHtml(record.submissionId)}">Re-analyze</button>
    </td>
  </tr>`;
}

function renderRangeChart(records) {
  return records.map((record, index) => {
    const midpoint = getBandMidpoint(record);
    const position = midpoint === null ? 0 : clamp(((midpoint - 4.5) / 4.5) * 100, 0, 100);
    const label = record.estimatedBandRange || "-";
    return `<div class="range-point" style="--point:${position}%">
      <span>Attempt ${index + 1}: ${escapeHtml(label)}</span>
      <i aria-hidden="true"></i>
    </div>`;
  }).join("");
}

function renderCriteriaTrend(records, criteriaNames) {
  return criteriaNames.map((name) => {
    const firstRange = getRecordCriteriaRange(records[0], name);
    const latestRange = getRecordCriteriaRange(records.at(-1), name);
    const direction = getDirectionLabel(firstRange, latestRange);
    return `<div class="criteria-trend-row">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(firstRange || "-")} &rarr; ${escapeHtml(latestRange || "-")}</span>
      </div>
      <b class="${direction.className}">${escapeHtml(direction.label)}</b>
    </div>`;
  }).join("");
}

function renderFrameworkTrend(records, frameworkNames) {
  return frameworkNames.map((name) => {
    const firstStatus = getRecordFrameworkStatus(records[0], name);
    const latestStatus = getRecordFrameworkStatus(records.at(-1), name);
    return `<div class="criteria-trend-row">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(firstStatus || "Needs Work")} &rarr; ${escapeHtml(latestStatus || "Needs Work")}</span>
      </div>
      <b class="badge ${statusClass(latestStatus || "Needs Work")}">${escapeHtml(latestStatus || "Needs Work")}</b>
    </div>`;
  }).join("");
}

function renderIssueHistoryItem(record, index) {
  const issue = getMainIssue(record);
  return `<article class="issue-history-item">
    <span>Attempt ${index + 1}</span>
    <h4>Main issue: ${escapeHtml(issue)}</h4>
    <p>Repair: ${escapeHtml(record.mostUrgentRepair || "-")}</p>
  </article>`;
}

function renderHistoryRow(record, index) {
  const date = record.dateTime ? new Date(record.dateTime).toLocaleDateString("en-GB") : "-";
  const type = record.publicTaskType || record.essayType || record.visualType || "-";
  const invalid = !isValidProgressRecord(record);
  return `<tr${invalid ? ' class="invalid-history-row"' : ""}>
    <td>${escapeHtml(date)}</td>
    <td>${escapeHtml(record.taskType || "-")}</td>
    <td>${escapeHtml(type)}</td>
    <td>${escapeHtml(record.estimatedBandRange || "-")} ${invalid ? '<span class="badge">Invalid</span>' : ""}</td>
    <td>${escapeHtml(getMainIssue(record))}</td>
    <td>
      <button class="text-button" type="button" data-history-report="${escapeHtml(record.submissionId)}">View Report</button>
      <button class="text-button" type="button" data-history-print="${escapeHtml(record.submissionId)}">Export PDF</button>
      <button class="text-button" type="button" data-history-reanalyze="${escapeHtml(record.submissionId)}">Re-analyze</button>
      ${isTeacherAccount(currentUser) && !invalid ? `<button class="text-button" type="button" data-history-invalidate="${escapeHtml(record.submissionId)}">Mark analysis invalid</button>` : ""}
    </td>
  </tr>`;
}

async function invalidateSubmission(submissionId) {
  if (!isTeacherAccount(currentUser)) return;
  const reason = window.prompt("Reason for invalidating this analysis:");
  if (!reason) return;
  if (!window.confirm("Mark this report invalid and remove it from progress calculations? Credits will not change.")) return;
  try {
    const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "invalidate", reason })
    });
    const result = await readJsonResponse(response, "The report could not be invalidated.");
    if (!response.ok || !result.ok) throw new Error(result.error || "The report could not be invalidated.");
    progressRecords = progressRecords.map((record) => record.submissionId === submissionId ? result.record : record);
    currentProgressSummary = result.progressSummary || currentProgressSummary;
    if (result.progressSummary?.taskType) progressSummariesByTask[result.progressSummary.taskType] = result.progressSummary;
    renderProgressTracker();
    showToast("Analysis marked invalid. It is excluded from progress; credits were not changed.");
  } catch (error) {
    showError(error.message);
  }
}

function loadHistoryReport(submissionId, shouldPrint) {
  const record = progressRecords.find((item) => item.submissionId === submissionId);
  if (!record?.report) {
    showToast("Report history view will be available in the next version.");
    return;
  }

  renderAnalysis(record.report);
  showSection("dashboard");
  showToast("Saved diagnostic report loaded.");

  if (shouldPrint) {
    exportDiagnosticPdf(record.report);
  }
}

function prepareReanalysis(record) {
  if (!record) return;
  const source = record.sourceInput;
  if (!source?.prompt || !source?.writing) {
    showToast("This legacy report does not contain a reusable source-input snapshot. Paste the original prompt and writing to analyze a revised version.");
    showSection("submission");
    return;
  }
  const selectedProgressProfile = [...studentProfiles, ...archivedStudentProfiles].find((profile) => profile.profileToken === progressSelectedStudentToken);
  if (selectedProgressProfile?.active === false) {
    showToast("Restore this archived student before creating a new analysis. The saved report remains available.");
    return;
  }

  setActiveTask(source.taskType === "Task 1" ? "Task 1" : "Task 2");
  const promptField = document.querySelector(source.taskType === "Task 1" ? "#task1-prompt" : "#task2-prompt");
  const writingField = document.querySelector(source.taskType === "Task 1" ? "#task1-writing" : "#task2-writing");
  const targetField = document.querySelector(source.taskType === "Task 1" ? "#task1-target-band" : "#task2-target-band");
  promptField.value = source.prompt;
  writingField.value = source.writing;
  if ([...targetField.options].some((option) => option.value === source.targetBand)) targetField.value = source.targetBand;
  if (source.taskType === "Task 1" && source.visualType) document.querySelector("#visual-type").value = source.visualType;
  if (source.taskType === "Task 2" && source.essayType) document.querySelector("#essay-type").value = source.essayType;
  pendingParentReportId = record.submissionId;
  updateWordCountPreviews();
  showSection("submission");
  // The button says "Re-analyze with Current Engine", and that is what submitting now does: unchanged
  // work is re-analysed by the current engine as a NEW report version beside the old one. Saying it
  // would reopen the cached report would contradict both the button and the behaviour.
  showToast(source.imageRequired
    ? "Ready to re-analyze. Re-upload the original Task 1 image, or upload a revised image, then submit. Unchanged work is re-analyzed with the current engine as a new report version — one credit is used and the earlier report is kept."
    : "Ready to re-analyze. Submit unchanged to re-run this work through the current engine as a new report version, or edit it first for a revised submission. Either way one credit is used and the earlier report is kept.");
}

function getTaskProgressConfig(taskType) {
  if (taskType === "Task 1") {
    return {
      emptyEyebrow: "Task 1 Progress",
      emptyTitle: "No Task 1 progress yet",
      emptyText: "Submit a Task 1 report to start tracking overview, data selection, and grouping logic.",
      emptyButton: "Start Task 1 Analysis",
      note: "Task 1 progress is tracked separately because Task Achievement, overview quality, data selection, and grouping logic are specific to Academic Task 1.",
      criteria: ["Task Achievement", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"],
      framework: ["Overview Quality", "Data Selection", "Grouping Logic", "Data Accuracy", "Comparison Precision", "Report Tone Control", "LFC CPC Control"]
    };
  }

  return {
    emptyEyebrow: "Task 2 Progress",
    emptyTitle: "No Task 2 progress yet",
    emptyText: "Submit a Task 2 essay to start tracking thesis route, body development, and SAR examples.",
    emptyButton: "Start Task 2 Analysis",
    note: "Task 2 progress is tracked separately because Task Response, thesis route, body development, and SAR examples are specific to essay writing.",
    criteria: ["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"],
    framework: ["Position Clarity", "Thesis Route Clarity", "Body Paragraph Route Alignment", "Explanation Depth", "SAR Example Quality", "Link Back Control", "Conclusion Closure", "LFC CPC Control"]
  };
}

function getMainIssue(record) {
  return record?.top3Issues?.[0]?.issueType ||
    record?.top3Issues?.[0]?.title ||
    record?.top3Issues?.[0]?.issue ||
    record?.top3Issues?.[0]?.summary ||
    record?.top3Issues?.[0]?.whyItMatters ||
    record?.mainScoreLimitingFactor ||
    "-";
}

function getRecordFrameworkStatus(record, frameworkName) {
  const scores = record?.kruPomScores || record?.report?.kruPomScores || {};
  const direct = scores[frameworkName];
  if (direct?.status) return direct.status;

  const matched = Object.entries(scores).find(([name]) => (
    name.toLowerCase().includes(frameworkName.toLowerCase()) ||
    frameworkName.toLowerCase().includes(name.toLowerCase())
  ));

  return matched?.[1]?.status || "Needs Work";
}

function getMostImprovedArea(records) {
  if (records.length < 2) return "Track after the next analysis";

  const latest = records.at(-1);
  const names = latest.taskType === "Task 1"
    ? ["Task Achievement", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"]
    : ["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"];

  const improvements = names.map((name) => ({
    name,
    delta: rangeMidpoint(getRecordCriteriaRange(latest, name)) - rangeMidpoint(getRecordCriteriaRange(records[0], name))
  })).filter((item) => Number.isFinite(item.delta));

  const best = improvements.sort((a, b) => b.delta - a.delta)[0];
  if (!best || best.delta <= 0) return "Needs more attempts";
  return best.name;
}

function buildTaskProgressSummaryText(records, taskType, analysis, serverSummary) {
  const summary = normalizeProgressSummary(records, taskType, analysis, serverSummary);
  if (!summary.latestEstimatedRange) return "";
  const parts = [
    `Previous ${taskType} submissions: ${summary.previousSubmissionCount}`,
    `Latest estimated range: ${summary.latestEstimatedRange}`,
    summary.previousEstimatedRange ? `Previous estimated range: ${summary.previousEstimatedRange}` : "",
    `Current main repair: ${summary.currentMainRepair || "-"}`,
    summary.repeatedIssue ? `Top repeated issue: ${summary.repeatedIssue}` : ""
  ].filter(Boolean);

  return parts.join(" | ");
}

function validatedServerReportVersions(serverSummary = {}) {
  const versions = Array.isArray(serverSummary.reportVersions) ? serverSummary.reportVersions : [];
  const groupId = String(serverSummary.currentSubmissionGroupId || "").trim();
  if (!groupId) return [];
  return versions.filter((version) => String(version.submissionGroupId || "").trim() === groupId);
}

function normalizeProgressSummary(records, taskType, analysis, serverSummary) {
  if (serverSummary && (!serverSummary.taskType || serverSummary.taskType === taskType)) {
    return {
      previousSubmissionCount: Number(serverSummary.previousSubmissionCount || 0),
      previousEstimatedRange: serverSummary.previousEstimatedRange || "",
      latestEstimatedRange: serverSummary.latestEstimatedRange || analysis?.estimatedBandRange || "",
      currentMainRepair: serverSummary.currentMainRepair || analysis?.mostUrgentRepair || "",
      repeatedIssue: serverSummary.repeatedIssue || "",
      reportVersionCount: validatedServerReportVersions(serverSummary).length || 1,
      reportVersions: validatedServerReportVersions(serverSummary),
      currentSubmissionGroupId: serverSummary.currentSubmissionGroupId || "",
      previousSubmissionId: serverSummary.previousSubmissionId || "",
      previousSubmissionGroupId: serverSummary.previousSubmissionGroupId || "",
      distinctSubmissionCount: Number(serverSummary.distinctSubmissionCount || serverSummary.reportCount || 0),
      sameWorkRerunsExcluded: serverSummary.sameWorkRerunsExcluded === true,
      repeatedIssuesUseDistinctSubmissions: serverSummary.repeatedIssuesUseDistinctSubmissions === true
    };
  }
  const sorted = distinctProgressRecords(records, taskType);
  const currentId = analysis?.canonicalAnalysis?.metadata?.reportId || "";
  const previous = sorted.filter((record) => record.submissionId !== currentId && record.clientSubmissionId !== currentId);
  const previousLatest = previous.at(-1);
  return {
    previousSubmissionCount: previous.length,
    previousEstimatedRange: previousLatest?.estimatedBandRange || "",
    latestEstimatedRange: analysis?.estimatedBandRange || sorted.at(-1)?.estimatedBandRange || "",
    currentMainRepair: analysis?.mostUrgentRepair || sorted.at(-1)?.mostUrgentRepair || "",
    repeatedIssue: getTopRepeatedIssue(previous),
    reportVersionCount: reportVersionsForRecord(sorted.at(-1), records).length || 1,
    reportVersions: reportVersionsForRecord(sorted.at(-1), records)
  };
}

function isValidProgressRecord(record) {
  return String(record?.analysisValidity || "valid").toLowerCase() !== "invalid";
}

function sameClientStudentWork(left = {}, right = {}) {
  if (!left || !right) return false;
  if (left.submissionGroupId && right.submissionGroupId) {
    return left.submissionGroupId === right.submissionGroupId;
  }
  if (left.studentWorkFingerprint && right.studentWorkFingerprint) {
    return left.studentWorkFingerprint === right.studentWorkFingerprint;
  }
  const a = left.sourceInput || {};
  const b = right.sourceInput || {};
  const normalize = (value) => String(value || "")
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return Boolean(normalize(a.prompt) && normalize(a.writing) && normalize(b.prompt) && normalize(b.writing)) &&
    normalize(left.taskType || a.taskType) === normalize(right.taskType || b.taskType) &&
    normalize(a.prompt) === normalize(b.prompt) &&
    normalize(a.writing) === normalize(b.writing) &&
    normalize(a.uploadedVisualContentHash) === normalize(b.uploadedVisualContentHash);
}

function distinctProgressRecords(records = [], taskType = "") {
  const groups = [];
  for (const record of sortProgressRecords(records).filter((item) =>
    isValidProgressRecord(item) && (!taskType || item.taskType === taskType)
  )) {
    const group = groups.find((items) => sameClientStudentWork(items[0], record));
    if (group) group.push(record);
    else groups.push([record]);
  }
  return groups.map((items) => items.at(-1));
}

function reportVersionsForRecord(record, records = []) {
  if (!record) return [];
  const versions = sortProgressRecords(records).filter((item) =>
    isValidProgressRecord(item) && sameClientStudentWork(item, record)
  );
  return versions.length ? versions : [record];
}

function getTopRepeatedIssue(records) {
  const counts = new Map();
  for (const record of records) {
    const issue = getMainIssue(record);
    if (!issue || issue === "-") continue;
    counts.set(issue, (counts.get(issue) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function getRecordCriteriaRange(record, name) {
  if (!record) return "";
  if ((name === "Task Response" || name === "Task Achievement") && record.taskResponseOrAchievementRange) {
    return record.taskResponseOrAchievementRange;
  }
  if (name === "Coherence & Cohesion" && record.coherenceRange) return record.coherenceRange;
  if (name === "Lexical Resource" && record.lexicalRange) return record.lexicalRange;
  if (name === "Grammatical Range & Accuracy" && record.grammarRange) return record.grammarRange;

  const item = record.criteriaScores?.[name];
  return typeof item === "string" ? item : item?.range || "";
}

function getDirectionLabel(firstRange, latestRange) {
  const first = rangeMidpoint(firstRange);
  const latest = rangeMidpoint(latestRange);

  if (!Number.isFinite(first) || !Number.isFinite(latest)) {
    return { label: "Needs Attention", className: "trend-attention" };
  }

  if (latest > first) return { label: "Improved", className: "trend-improved" };
  if (latest === first && latest >= 6.5) return { label: "Stable", className: "trend-stable" };
  return { label: "Needs Attention", className: "trend-attention" };
}

function getBandMidpoint(record) {
  if (Number.isFinite(record?.bandRangeMin) && Number.isFinite(record?.bandRangeMax)) {
    return (Number(record.bandRangeMin) + Number(record.bandRangeMax)) / 2;
  }
  return rangeMidpoint(record?.estimatedBandRange);
}

function rangeMidpoint(value) {
  const numbers = String(value || "")
    .replace(/[–—−]/g, "-")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((number) => Number.isFinite(number)) || [];

  if (!numbers.length) return Number.NaN;
  if (numbers.length === 1) return numbers[0];
  return (numbers[0] + numbers[1]) / 2;
}

function sortProgressRecords(records) {
  return [...(records || [])].sort((a, b) => {
    const timeDelta = new Date(a.dateTime || 0) - new Date(b.dateTime || 0);
    return timeDelta || String(a.submissionId || "").localeCompare(String(b.submissionId || ""));
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeClientAnalysis(analysis) {
  const fallback = buildSampleAnalysis();
  const viewProjection = analysis?.studentReportViewModel
    ? projectStudentReportViewModel(analysis.studentReportViewModel)
    : analysis;
  const projected = viewProjection.canonicalAnalysis
    ? projectCanonicalAnalysis(viewProjection.canonicalAnalysis, viewProjection)
    : viewProjection;
  const feedbackCards = projected.feedbackCards || fallback.feedbackCards;
  return {
    ...fallback,
    ...projected,
    reportLanguage: normalizeReportLanguage(projected.reportLanguage || fallback.reportLanguage || "en"),
    criteriaScores: projected.criteriaScores || fallback.criteriaScores,
    kruPomScores: projected.kruPomScores || fallback.kruPomScores,
    top3Issues: projected.top3Issues || fallback.top3Issues,
    feedbackCards,
    paragraphCoverage: projected.paragraphCoverage || fallback.paragraphCoverage || [],
    // V12.9.5: the compact rows for validated evidence that did not earn a full Detailed Feedback
    // card. Present on the Student View projection and on a raw report alike.
    languagePatternSummary: projected.languagePatternSummary
      || projected.feedbackIntegrity?.languagePatternSummary
      || [],
    paragraphFeedback: normalizeParagraphItems(projected.paragraphFeedback || fallback.paragraphFeedback, feedbackCards),
    practicePlan: projected.practicePlan || fallback.practicePlan,
    warnings: projected.warnings || []
  };
}

function projectStudentReportViewModel(viewModel = {}) {
  assertStudentReportViewModel(viewModel);
  const metadata = viewModel.studentMetadata || {};
  const completion = viewModel.completionStatus || {};
  const route = viewModel.positionAndRoute || {};
  return {
    studentReportViewModel: viewModel,
    reportLanguage: viewModel.reportHeader?.reportLanguage || "en",
    generatedAt: viewModel.reportHeader?.generatedAt || new Date().toISOString(),
    studentDisplayNameSnapshot: metadata.studentName || "-",
    taskType: metadata.taskType || "Task 2",
    essayType: metadata.taskType === "Task 2" ? metadata.taskSubtype : "",
    task2EssayTypeLabel: metadata.taskType === "Task 2" ? metadata.taskSubtype : "",
    visualType: metadata.taskType === "Task 1" ? metadata.taskSubtype : "",
    wordCount: Number(metadata.wordCount || 0),
    minimumWordCount: Number(metadata.minimumWordCount || 0),
    wordCountStatus: metadata.wordCountStatus || "",
    wordShortfall: Number(completion.wordShortfall || 0),
    estimatedBandRange: viewModel.estimatedBandRange || "-",
    mainScoreLimitingFactor: viewModel.executiveSummary?.mainScoreLimitingFactor || "",
    mostUrgentRepair: viewModel.executiveSummary?.mostUrgentRepair || "",
    completionStatus: completion.status || "",
    completionEvidence: completion.evidence || [],
    stanceRequired: Boolean(route.position),
    detectedPosition: route.position || "",
    positionConfidence: route.confidence || "",
    bodyRouteSummary: route.summary || "",
    criteriaScores: viewModel.criteriaBreakdown || {},
    kruPomScores: viewModel.frameworkBreakdown || {},
    top3Issues: viewModel.topIssues || [],
    feedbackCards: viewModel.detailedFeedback || [],
    languagePatternSummary: viewModel.languagePatternSummary || [],
    paragraphCoverage: viewModel.paragraphCoverage || [],
    practicePlan: viewModel.repairPlan || [],
    disclaimer: viewModel.disclaimer || ""
  };
}

function normalizeParagraphItems(items, feedbackCards = []) {
  const normalized = Array.isArray(items)
    ? items.map((item) => normalizeParagraphItem(item)).filter(Boolean)
    : [];

  if (normalized.length) return normalized;

  return (feedbackCards || []).map((card) => normalizeParagraphItem({
    paragraphLocation: card.paragraphLocation,
    exactEvidence: card.exactSentence,
    diagnosis: card.kruPomDiagnosis || card.whyItLimitsBand,
    action: card.studentAction
  })).filter(Boolean);
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

function setLoading(isLoading) {
  const accessExpired = currentUser && (currentUser.isExpired || currentUser.accessExpired);
  const quotaUsed = currentUser && !isUnlimitedAccount(currentUser) && currentUser.remaining <= 0;
  const studentMissing = currentUser && isTeacherAccount(currentUser) && !selectedStudentProfileToken;
  analyzeButton.disabled = isLoading || accessExpired || quotaUsed || studentMissing;
  analyzeButton.textContent = isLoading ? "Analyzing..." : "Analyze My Writing";
  if (!isLoading && accessExpired) analyzeButton.textContent = "Access Expired";
  if (!isLoading && quotaUsed && !accessExpired) analyzeButton.textContent = "Quota Used";
  if (!isLoading && studentMissing && !accessExpired && !quotaUsed) analyzeButton.textContent = "Select a Student";
  loadingState.classList.toggle("visible", isLoading);
}

function showError(message, details = {}) {
  // Build with DOM nodes and textContent only (never innerHTML) so no field can inject markup.
  formError.textContent = "";
  const messageLine = document.createElement("div");
  messageLine.textContent = message || "Analysis could not be completed. Please check your prompt and writing, then try again.";
  formError.appendChild(messageLine);

  const privileged = currentUser && ["teacher", "admin"].includes(String(currentUser.role || "").toLowerCase());
  const parts = [];
  if (details.requestId) parts.push(`Reference ID: ${details.requestId}`);
  if (privileged && details.errorCode) parts.push(`Error code: ${details.errorCode}`);
  if (privileged && details.failureStage) parts.push(`Stage: ${details.failureStage}`);

  if (parts.length) {
    const reference = document.createElement("div");
    reference.className = "error-reference";
    reference.textContent = parts.join("  •  ");
    formError.appendChild(reference);

    if (details.requestId) {
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "error-copy";
      copyButton.textContent = "Copy diagnostic reference";
      copyButton.addEventListener("click", () => {
        const text = privileged
          ? [details.requestId, details.errorCode, details.failureStage].filter(Boolean).join(" ")
          : String(details.requestId);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(() => showToast("Diagnostic reference copied.")).catch(() => {});
        }
      });
      formError.appendChild(copyButton);
    }
  }
  formError.classList.add("visible");
}

function clearError() {
  formError.textContent = "";
  formError.classList.remove("visible");
}

async function checkBackendHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Health check failed");
    const health = await readJsonResponse(response, "Backend health could not be checked.");
    const providerStatus = String(health.providerConnectivityStatus || "").toLowerCase();
    const engineConfigured = Boolean(health.diagnosticEngineConfigured || health.providerConfigured) && health.modelConfigured !== false;
    const serviceReady = providerStatus === "connected" || Boolean(health.aiConnected);
    const serviceUnavailable = Boolean(
      health.fullEngineRequired && (providerStatus === "failed" || !engineConfigured)
    );
    serviceStatus.textContent = serviceReady
      ? "Diagnostic service ready"
      : serviceUnavailable
        ? "Diagnostic service unavailable"
        : engineConfigured
          ? "Diagnostic service configured"
          : "Diagnostic service ready";
    updateAnalyzeAvailability();
  } catch {
    serviceStatus.textContent = "API not connected";
  }
}

async function copyPracticePlan() {
  const text = (currentAnalysis.practicePlan || [])
    .map((item, index) => `Day ${item.day || index + 1}: ${item.title || ""} - ${item.task || ""}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showToast("Practice plan copied.");
  } catch {
    showToast("Practice plan is ready in the export preview.");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 3200);
}

function shortCriteria(name) {
  const map = {
    "Task Response": "TR",
    "Task Achievement": "TA",
    "Coherence & Cohesion": "CC",
    "Lexical Resource": "LR",
    "Grammatical Range & Accuracy": "GRA"
  };
  return map[name] || name.split(/\s+/).map((word) => word[0]).join("").slice(0, 4).toUpperCase();
}

function statusClass(status = "") {
  const normalized = status.toLowerCase();
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("strong")) return "strong";
  if (normalized === "aligned" || normalized === "สอดคล้อง") return "strong";
  if (normalized.includes("moderate")) return "moderate";
  return "warning";
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildSampleAnalysis() {
  return {
    taskType: "Task 2",
    essayType: "Discuss Both Views",
    targetBand: "7.0",
    generatedAt: new Date().toISOString(),
    reportLanguage: "en",
    analysisMode: "Sample diagnostic data",
    estimatedBandRange: "6.0-6.5",
    mainScoreLimitingFactor: "Body development is too general and examples do not fully prove the argument.",
    mostUrgentRepair: "Strengthen explanation + SAR examples in Body Paragraph 1 and Body Paragraph 2.",
    criteriaScores: {
      "Task Response": {
        range: "6.0-6.5",
        diagnosis: "The position is visible, but the thesis route and supporting development are not precise enough.",
        evidence: "This essay will discuss both views and give my opinion."
      },
      "Coherence & Cohesion": {
        range: "6.0",
        diagnosis: "Paragraphing is present, but link-back control is generic.",
        evidence: "This is very important for students."
      },
      "Lexical Resource": {
        range: "6.5",
        diagnosis: "Vocabulary is clear but several broad phrases reduce precision.",
        evidence: "students can learn many things online."
      },
      "Grammatical Range & Accuracy": {
        range: "6.0-6.5",
        diagnosis: "Meaning is understandable, but sentence control should be strengthened in revisions.",
        evidence: "Therefore, both schools and parents have important roles."
      }
    },
    kruPomScores: {
      "Thesis Route Clarity": { status: "Critical", diagnosis: "The thesis announces the task but does not create a clear paragraph route." },
      "Topic Sentence Alignment": { status: "Needs Work", diagnosis: "Body paragraph openings connect loosely to the thesis." },
      "Explanation Depth": { status: "Critical", diagnosis: "Mechanism language is missing in key support sentences." },
      "SAR Example Quality": { status: "Critical", diagnosis: "The example is topic-relevant but not argument-proving." },
      "Link Back Control": { status: "Needs Work", diagnosis: "The paragraph ending is too generic." },
      "LFC CPC Control": { status: "Needs Work", diagnosis: "Link, flow, clarity, precision, and comprehensiveness need tightening." },
      "Template / Memorized Pattern Risk": { status: "Moderate", diagnosis: "Some formulaic lines reduce specificity." }
    },
    top3Issues: [
      { issueType: "Thesis Route Problem", severity: "Critical", summary: "Introduction, Sentence 2: Thesis announces the task but does not create a paragraph route.", feedbackCardId: "card-1" },
      { issueType: "Explanation Too General", severity: "Critical", summary: "Body Paragraph 1, Sentence 2: Explanation uses broad wording without mechanism.", feedbackCardId: "card-2" },
      { issueType: "SAR Example Failure", severity: "Critical", summary: "Body Paragraph 2, Example Sentence: Example lacks specific situation, action, and result.", feedbackCardId: "card-3" }
    ],
    feedbackCards: [
      {
        issueType: "Thesis Route Problem",
        severity: "Critical",
        criteria: ["Task Response", "Coherence & Cohesion"],
        framework: ["Thesis Route", "LFC CPC - Link", "LFC CPC - Clear"],
        paragraphLocation: "Introduction, Sentence 2",
        exactSentence: "This essay will discuss both views and give my opinion.",
        sentenceFunction: "This sentence is trying to function as the thesis statement.",
        whyItLimitsBand: "It announces the task but does not answer the task. The examiner still cannot see View 1, View 2, your position, or the route for Body 1 and Body 2.",
        kruPomDiagnosis: "ประโยคนี้ถูก grammar แต่ยังไม่ทำหน้าที่ของ Band 7+ thesis เพราะ route control ยังไม่ชัด",
        targetedRevision: "While some people believe that schools should teach money management because it prepares students for real-life decisions, I believe parents should also play a major role because children's financial habits are shaped at home.",
        whyRevisionIsStronger: "The revision shows both views, your position, and the route for each body paragraph.",
        studentAction: "Rewrite the thesis using: While [View 1] because [reason], I believe [your position] because [reason]."
      },
      {
        issueType: "Explanation Too General",
        severity: "Critical",
        criteria: ["Task Response"],
        framework: ["Body Development", "LFC CPC - Clear", "LFC CPC - Precise"],
        paragraphLocation: "Body Paragraph 1, Sentence 2",
        exactSentence: "Technology is useful because students can learn many things online.",
        sentenceFunction: "This sentence is trying to explain the main point.",
        whyItLimitsBand: "The phrase 'many things online' is too broad and does not show the learning mechanism.",
        kruPomDiagnosis: "ปัญหานี้คือ development problem: idea เกี่ยวข้องกับโจทย์ แต่ reasoning ยังไม่ visible.",
        targetedRevision: "Online learning gives students access to recorded lessons, interactive exercises, and teacher feedback outside normal classroom hours, allowing them to review difficult concepts at their own pace.",
        whyRevisionIsStronger: "The revision replaces vague wording with concrete academic details.",
        studentAction: "Replace broad nouns like 'many things', 'good things', and 'useful information' with concrete academic details."
      },
      {
        issueType: "SAR Example Failure",
        severity: "Critical",
        criteria: ["Task Response"],
        framework: ["SAR Example Method"],
        paragraphLocation: "Body Paragraph 2, Example Sentence",
        exactSentence: "For example, many people use technology to preserve culture.",
        sentenceFunction: "This sentence is trying to provide an example.",
        whyItLimitsBand: "The example is relevant to the topic, but it does not prove the argument because it lacks Specific Situation, Action, and Result.",
        kruPomDiagnosis: "นี่คือ topic-relevant example แต่ยังไม่ใช่ argument-proving example.",
        targetedRevision: "For example, a local craft maker in Thailand can sell handmade products through online platforms instead of relying only on small village markets.",
        whyRevisionIsStronger: "The revised example shows who is involved, what action takes place, and how the result supports the argument.",
        studentAction: "Before writing an example, answer: Who / Where? What action? What result?"
      },
      {
        issueType: "Weak Link Sentence",
        severity: "Needs Work",
        criteria: ["Coherence & Cohesion"],
        framework: ["Link Back Control", "LFC CPC - Link", "LFC CPC - Flow"],
        paragraphLocation: "Body Paragraph 1, Final Sentence",
        exactSentence: "This is very important for students.",
        sentenceFunction: "This sentence is trying to close the paragraph.",
        whyItLimitsBand: "The sentence is too generic and does not connect the paragraph back to the thesis or argument.",
        kruPomDiagnosis: "Paragraph stops, but it does not close. ต้อง reinforce argument ให้ชัด",
        targetedRevision: "Therefore, structured financial education at school can give students practical decision-making skills before they face real financial responsibilities in adulthood.",
        whyRevisionIsStronger: "The revised sentence connects school-based money education to practical decision-making and real-life financial responsibility.",
        studentAction: "Do not end a paragraph with 'This is important.' End by restating the argument in a more precise way."
      }
    ],
    paragraphFeedback: [
      {
        paragraphLocation: "Introduction",
        exactEvidence: "This essay will discuss both views and give my opinion.",
        diagnosis: "Thesis route is visible as a template but not yet specific enough.",
        action: "Rewrite the thesis with both views, your position, and the reason for each side."
      },
      {
        paragraphLocation: "Body Paragraph 1",
        exactEvidence: "Technology is useful because students can learn many things online.",
        diagnosis: "Explanation lacks mechanism language.",
        action: "Add concrete academic details before the example."
      }
    ],
    practicePlan: [
      { day: 1, title: "Rewrite thesis route", task: "Rewrite the thesis using the correct essay-type formula." },
      { day: 2, title: "Check topic sentence alignment", task: "Check Body 1 topic sentence against the thesis route." },
      { day: 3, title: "Add mechanism language", task: "Rewrite Body 1 explanation using cause, process, and result language." },
      { day: 4, title: "Upgrade SAR example", task: "Upgrade one weak example using Specific Situation, Action, and Result." },
      { day: 5, title: "Repair link back", task: "Check Body 2 for route alignment and link back." },
      { day: 6, title: "Revise lexical precision", task: "Remove vague wording such as many things, useful, and important." },
      { day: 7, title: "Rewrite and resubmit", task: "Rewrite the full essay and resubmit for diagnostic comparison." }
    ],
    warnings: [],
    disclaimer: "This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners."
  };
}
