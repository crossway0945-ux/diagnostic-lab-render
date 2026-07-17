import { getWordCountMetadata } from "./wordCount.js";
import { projectCanonicalAnalysis } from "./services/canonicalAnalysis.js";

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
const ACCESS_EXPIRED_MESSAGE = "Your early access period has ended. Please contact Kru Pom IELTS to extend access.";
const QUOTA_USED_MESSAGE = "Your early access quota has been used. Please contact Kru Pom IELTS to extend access.";
const API_DISCONNECTED_MESSAGE = "The diagnostic service could not be reached. Please try again or contact Kru Pom IELTS.";
const ANALYSIS_POLL_INTERVAL_MS = 3000;
const ANALYSIS_POLL_TIMEOUT_MS = 12 * 60 * 1000;

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
checkSession();
updateWordCountPreviews();

task1Writing.addEventListener("input", updateWordCountPreviews);
task2Writing.addEventListener("input", updateWordCountPreviews);

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
    card.querySelector(".toggle-symbol").textContent = isExpanded ? "Collapse" : "Expand";
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
        password: loginPassword.value
      })
    });
    const result = await readJsonResponse(response, "Username or password is incorrect. Please contact Kru Pom IELTS.");

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Username or password is incorrect. Please contact Kru Pom IELTS.");
    }

    loginPassword.value = "";
    setAuthenticatedUser(result.user);
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
    if (response.status === 202 && result.queued && result.jobId) {
      showToast("Analysis is running. Please keep this page open.");
      const completed = await waitForAnalysisJob(result.jobId);
      handleCompletedAnalysis(completed, payload);
      return;
    }

    if (!response.ok || !result.ok) {
      const error = new Error(studentMessageForError(result.errorCode, result.error));
      error.status = response.status;
      error.errorCode = result.errorCode;
      error.debugHint = result.debugHint;
      throw error;
    }

    handleCompletedAnalysis(result, payload);
  } catch (error) {
    if (error.message.includes("log in")) {
      showLoginScreen();
      return;
    }
    showError(studentMessageForError(error.errorCode, error.message));
  } finally {
    setLoading(false);
  }
});

async function waitForAnalysisJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ANALYSIS_POLL_TIMEOUT_MS) {
    await sleep(ANALYSIS_POLL_INTERVAL_MS);
    const response = await fetch(`/api/analyze-status/${encodeURIComponent(jobId)}`);
    const result = await readJsonResponse(response, "Analysis status could not be checked. Please try again.");

    if (result.status === "complete" && result.analysis) {
      return result;
    }

    if (result.status === "failed" || result.ok === false) {
      const error = new Error(studentMessageForError(result.errorCode, result.error));
      error.status = response.status;
      error.errorCode = result.errorCode;
      error.debugHint = result.debugHint;
      throw error;
    }
  }

  const error = new Error("The diagnostic service is still processing. Please try again in a few minutes.");
  error.errorCode = "PROVIDER_TIMEOUT";
  throw error;
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
    studentPlan.textContent = `${currentUser.plan || "Internal Use"} (${roleLabel})`;
    studentQuota.textContent = `Internal use. ${safetyText}`;
    if (studentExpiry) studentExpiry.textContent = currentUser.expiryDate || "Internal use";
  } else {
    studentPlan.textContent = currentUser.plan || "-";
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

function renderAnalysis(analysis) {
  currentAnalysis = normalizeClientAnalysis(analysis);
  const criteriaEntries = Object.entries(currentAnalysis.criteriaScores || {});
  const kruEntries = Object.entries(currentAnalysis.kruPomScores || {});
  const feedbackCards = currentAnalysis.feedbackCards || [];

  document.querySelector("#task-type-label").textContent = currentAnalysis.taskType || "Task 2";
  document.querySelector("#estimated-band").textContent = currentAnalysis.estimatedBandRange;
  document.querySelector("#main-limiter").textContent = currentAnalysis.mainScoreLimitingFactor;
  document.querySelector("#urgent-repair").textContent = currentAnalysis.mostUrgentRepair;
  document.querySelector("#hero-band").textContent = currentAnalysis.estimatedBandRange;
  document.querySelector("#hero-limiter").textContent = `Score-limiting factor: ${currentAnalysis.mainScoreLimitingFactor}`;

  serviceStatus.textContent = "Diagnostic report ready";

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
      <span class="badge ${statusClass(value.status)}">${escapeHtml(value.status || "Needs Work")}</span>
    </article>`
  )).join("");

  const topIssues = buildDashboardIssues(currentAnalysis.top3Issues, feedbackCards);
  document.querySelector("#top-issues").innerHTML = topIssues.length
    ? topIssues.map((issue, index) => renderDashboardIssue(issue, index)).join("")
    : `<p class="issue-empty">No evidence-based issues found yet. Run an analysis to generate exact-sentence feedback.</p>`;

  document.querySelector("#feedback-stack").innerHTML = feedbackCards.map((card, index) => renderFeedbackCard(card, index)).join("");

  const paragraphItems = normalizeParagraphItems(currentAnalysis.paragraphFeedback, feedbackCards);
  document.querySelector("#paragraph-feedback").innerHTML = paragraphItems.map((paragraph) => (
    `<article class="paragraph-card">
      <span>${escapeHtml(paragraph.paragraphLocation)}</span>
      <blockquote>${escapeHtml(paragraph.exactEvidence)}</blockquote>
      <p>${escapeHtml(paragraph.diagnosis)}</p>
      <strong>Student action</strong>
      <p>${escapeHtml(paragraph.action)}</p>
    </article>`
  )).join("");

  document.querySelector("#practice-timeline").innerHTML = (currentAnalysis.practicePlan || []).slice(0, 7).map((item, index) => (
    `<article class="timeline-item">
      <span>Day ${escapeHtml(item.day || index + 1)}</span>
      <p><strong>${escapeHtml(item.title || "")}</strong><br>${escapeHtml(item.task || item.action || "")}</p>
    </article>`
  )).join("");

  document.querySelector("#report-preview").innerHTML = renderReportPreview(currentAnalysis);
  document.querySelector("#report-disclaimer").textContent = currentAnalysis.disclaimer;
}

function renderFeedbackCard(card, index) {
  const id = `card-${index + 1}`;
  const expanded = index === 0 ? "expanded" : "";
  const severity = card.severity || "Needs Work";

  return `<article class="feedback-card ${expanded}" id="${id}">
    <button class="feedback-toggle" type="button" aria-expanded="${index === 0 ? "true" : "false"}">
      <span>
        <span class="badge ${statusClass(severity)}">${escapeHtml(severity)}</span>
        ${escapeHtml(card.issueType || "Diagnostic Issue")}
      </span>
      <span class="toggle-symbol">${index === 0 ? "Collapse" : "Expand"}</span>
    </button>
    <div class="feedback-body">
      <div class="feedback-meta">
        ${toArray(card.criteria).map((item) => `<span class="criteria-chip">${escapeHtml(item)}</span>`).join("")}
        ${toArray(card.framework).map((item) => `<span class="framework-chip">${escapeHtml(item)}</span>`).join("")}
      </div>
      <dl class="feedback-schema">
        <dt>Issue Type</dt>
        <dd>${escapeHtml(card.issueType || "")}</dd>
        <dt>Severity</dt>
        <dd><span class="badge ${statusClass(severity)}">${escapeHtml(severity)}</span></dd>
        <dt>IELTS Criteria</dt>
        <dd>${escapeHtml(toArray(card.criteria).join(", "))}</dd>
        <dt>Kru Pom Framework</dt>
        <dd>${escapeHtml(toArray(card.framework).join(", "))}</dd>
        <dt>Paragraph Location</dt>
        <dd>${escapeHtml(card.paragraphLocation || "")}</dd>
        <dt>Exact Sentence Found</dt>
        <dd><blockquote>${escapeHtml(card.exactSentence || "")}</blockquote></dd>
        <dt>What This Sentence Is Trying To Do</dt>
        <dd>${escapeHtml(card.sentenceFunction || "")}</dd>
        <dt>Why This Limits the Band</dt>
        <dd>${escapeHtml(card.whyItLimitsBand || "")}</dd>
        <dt>Kru Pom Diagnosis</dt>
        <dd>${escapeHtml(card.kruPomDiagnosis || "")}</dd>
        ${card.revisionType ? `<dt>Revision Type</dt><dd>${escapeHtml(card.revisionType)}</dd>` : ""}
        <dt>Targeted Revision</dt>
        <dd><div class="revision-box">${escapeHtml(card.targetedRevision || "")}</div></dd>
        <dt>Why This Revision Is Stronger</dt>
        <dd>${escapeHtml(card.whyRevisionIsStronger || "")}</dd>
        <dt>Student Action</dt>
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
    const card = fallbackCards[index] || {};
    const issueObject = issue && typeof issue === "object" ? issue : {};
    const title = firstText(
      issueObject.issueType,
      issueObject.title,
      issueObject.issue,
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
    const evidenceItems = Array.isArray(issueObject.evidenceItems)
      ? issueObject.evidenceItems.filter((item) => item?.exactSentence)
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
      feedbackCardId: issueObject.feedbackCardId || `card-${index + 1}`
    };
  }).filter((issue) => issue.title || issue.summary);
}

function renderDashboardIssue(issue, index) {
  const criteria = toArray(issue.criteria).filter(Boolean);
  const criteriaLabel = criteria[0] || "";
  const locations = toArray(issue.paragraphLocations).filter(Boolean);
  const evidenceItems = Array.isArray(issue.evidenceItems) ? issue.evidenceItems : [];

  return `<article class="issue-row">
    <span class="issue-number">${index + 1}</span>
    <div class="issue-copy">
      <h4>${escapeHtml(issue.title || "Evidence-based issue")}</h4>
      <p>${escapeHtml(issue.summary || "Click to view the exact sentence and diagnostic explanation.")}</p>
      ${locations.length ? `<p class="issue-trace-summary"><strong>Evidence:</strong> ${escapeHtml(locations.join("; "))} (${escapeHtml(issue.scope || "single-location")})</p>` : ""}
      ${evidenceItems.length > 1 ? `<details class="issue-evidence-details"><summary>View ${evidenceItems.length} evidence locations</summary>${evidenceItems.map((item) => `<blockquote><strong>${escapeHtml(item.paragraphLocation || "Evidence")}</strong><br>${escapeHtml(item.exactSentence || "-")}</blockquote>`).join("")}</details>` : ""}
      <div class="issue-badges">
        <span class="badge ${statusClass(issue.severity)}">${escapeHtml(issue.severity || "Needs Work")}</span>
        ${criteriaLabel ? `<span class="criteria-chip">${escapeHtml(criteriaLabel)}</span>` : ""}
      </div>
    </div>
    <button class="text-button" type="button" data-target="feedback" data-card="${escapeHtml(issue.feedbackCardId || `card-${index + 1}`)}">View Exact Sentence</button>
  </article>`;
}

function renderReportPreview(analysis) {
  const criticalFlags = buildCriticalNotices(analysis);
  const structuralHealth = [
    analysis.thesisRouteStatus,
    analysis.bodyRouteAlignmentStatus,
    analysis.SARExampleStatus,
    analysis.conclusionClosureStatus,
    analysis.overviewAccuracyStatus
  ].filter(Boolean).join(" | ");
  const rows = [
    ["Student", analysis.studentDisplayNameSnapshot || selectedStudentProfile()?.displayName || "-"],
    ["Date", new Date(analysis.generatedAt || Date.now()).toLocaleDateString("en-GB")],
    ["Task Type", analysis.taskType || "Task 2"],
    ["Word Count", String(analysis.wordCount ?? "-")],
    ...(analysis.wordCountStatus === "below_minimum"
      ? [["Word Count Status", `${analysis.wordShortfall} ${analysis.wordShortfall === 1 ? "word" : "words"} below the ${analysis.minimumWordCount}-word minimum`]]
      : []),
    ...(analysis.taskType === "Task 2" && analysis.completionStatus ? [["Completion Status", analysis.completionStatus]] : []),
    ...(analysis.taskType === "Task 2" && analysis.routeIntegrity ? [["Route Integrity", analysis.routeIntegrity]] : []),
    ["Estimated Band Range", analysis.estimatedBandRange],
    ["Main Score-Limiting Issue", analysis.mainScoreLimitingFactor],
    ["Structural Health Check", structuralHealth],
    ["Critical Flags", criticalFlags.join(" | ")],
    ["Priority Issues", (analysis.top3Issues || []).map((issue) => issue.issueType).join(", ")],
    ["Criteria Breakdown", Object.keys(analysis.criteriaScores || {}).join(", ")],
    ["Evidence-Based Feedback", `${(analysis.feedbackCards || []).length} exact-sentence cards`],
    ["Targeted Revisions", "Included"],
    ["7-Day Practice Plan", "Included"],
    ["Remaining Quota", currentUser ? `${currentUser.remaining} remaining, used ${currentUser.used}/${currentUser.quota}` : "-"],
    ["Disclaimer", "Diagnostic estimate only"]
  ];

  const progressSummary = buildTaskProgressSummaryText(progressRecords, analysis.taskType, analysis, currentProgressSummary);
  if (progressSummary) rows.splice(8, 0, ["Progress Summary", progressSummary]);

  return rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`).join("");
}

function buildCriticalNotices(analysis = {}) {
  const notices = [];
  if (analysis.taskAchievementCapReason) notices.push(`Task Achievement cap: ${analysis.taskAchievementCapReason}`);
  if (analysis.taskResponseCapReason) notices.push(`Task Response cap: ${analysis.taskResponseCapReason}`);
  if (analysis.criticalOverviewError) notices.push("Critical Task 1 flag: overview / visual interpretation limits the estimate.");
  if (analysis.brokenPromiseDetected) notices.push("Critical Task 2 flag: thesis route and body development do not fully match.");
  if (analysis.SARExampleStatus === "Generic") notices.push("Critical support flag: examples need Specific Situation, Action, and Result.");
  return [...new Set(notices.filter(Boolean))];
}

async function exportDiagnosticPdf(analysis) {
  renderPrintReport(analysis);
  if (!printReport) return;

  const previousFrame = document.querySelector("#diagnostic-print-frame");
  previousFrame?.remove();

  const frame = document.createElement("iframe");
  frame.id = "diagnostic-print-frame";
  frame.title = "Diagnostic report print document";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";

  const stylesheetUrl = new URL("styles.css", window.location.href).href;
  const baseUrl = new URL("./", window.location.href).href;
  frame.srcdoc = `<!doctype html>
<html lang="en">
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
    const win = frame.contentWindow;
    if (!win) throw new Error("The isolated print window could not be created.");
    const cleanup = () => window.setTimeout(() => frame.remove(), 500);
    win.addEventListener("afterprint", cleanup, { once: true });
    win.focus();
    window.setTimeout(() => win.print(), 150);
    window.setTimeout(() => { if (frame.isConnected) frame.remove(); }, 120000);
  } catch (error) {
    frame.remove();
    showError(error.message || "The PDF report could not be prepared.");
  }
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
  const text = String(doc.querySelector("#print-report")?.textContent || "");
  const forbidden = [
    /Ctrl\s*\+\s*M/i,
    /submissionGroupId/i,
    /reportVersionId/i,
    /parentReportId/i,
    /normalizedResponseFingerprint/i,
    /Report-Version and Progress Proof/i,
    /engine\/report rerun excluded/i,
    /Progress policy:/i,
    /legacy-[a-f0-9]/i,
    /\uFFFD|\uFFFE|\uFFFF/
  ];
  const match = forbidden.find((pattern) => pattern.test(text));
  if (match) throw new Error("The student PDF was blocked because internal or corrupted content was detected.");
}

function renderPrintReport(analysis) {
  if (!printReport) return;

  const normalized = normalizeClientAnalysis(analysis || currentAnalysis);
  const taskType = normalized.taskType || "Task 2";
  const config = getTaskProgressConfig(taskType);
  const criteriaNames = config.criteria;
  const frameworkNames = config.framework;
  const feedbackCards = normalized.feedbackCards || [];
  const topIssues = buildDashboardIssues(normalized.top3Issues, feedbackCards);
  const taskRecords = distinctProgressRecords(progressRecords, taskType);
  const taskSubtype = taskType === "Task 1"
    ? normalized.visualType || "Not Sure"
    : normalized.task2EssayTypeLabel || normalized.essayType || "Not Sure";
  const task2RouteLabel = normalized.stanceRequired ? "Position and Route" : `${taskSubtype} Route`;
  const task2RouteText = normalized.stanceRequired
    ? `${normalized.detectedPosition || "unclear"} (${normalized.positionConfidence || "low"} confidence). ${normalized.bodyRouteSummary || ""}`
    : normalized.bodyRouteSummary || "";

  printReport.innerHTML = `
    <article class="print-page print-cover">
      <div class="print-report-header">
        <p>Kru Pom IELTS | Evidence-Based Writing Diagnostic</p>
        <h1>IELTS Writing 7+ Diagnostic Report</h1>
      </div>
      <div class="print-summary-grid">
        ${renderPrintInfo("Student", normalized.studentDisplayNameSnapshot || "-")}
        ${renderPrintInfo("Date", formatDateTime(normalized.generatedAt || new Date().toISOString()))}
        ${renderPrintInfo("Task Type", taskType)}
        ${renderPrintInfo(taskType === "Task 1" ? "Visual Type" : "Essay Type", taskSubtype)}
        ${renderPrintInfo("Word Count", String(normalized.wordCount ?? "-"))}
        ${renderPrintInfo("Estimated Band Range", normalized.estimatedBandRange || "-")}
      </div>
      <section class="print-section">
        <h2>Executive Summary</h2>
        ${renderPrintCallout("Main Score-Limiting Factor", normalized.mainScoreLimitingFactor)}
        ${renderPrintCallout("Most Urgent Repair", normalized.mostUrgentRepair)}
        ${normalized.wordCountStatus === "below_minimum" ? renderPrintCallout("Word Count Status", `${normalized.wordShortfall} ${normalized.wordShortfall === 1 ? "word" : "words"} below the ${normalized.minimumWordCount}-word minimum`) : ""}
        ${taskType === "Task 2" && normalized.completionStatus ? renderPrintCallout("Completion Status", `${normalized.completionStatus}. ${normalized.completionEvidence?.join(" | ") || ""}`) : ""}
        ${taskType === "Task 2" && normalized.capMetadata?.applied ? renderPrintCallout("Explicit Cap Metadata", (normalized.capMetadata.caps || []).map((cap) => `${cap.scope}: ${cap.criterion} max ${cap.maximum} — ${cap.reason}`).join(" | ")) : ""}
        ${normalized.taskAchievementCapReason ? renderPrintCallout("Task Achievement Cap", normalized.taskAchievementCapReason) : ""}
        ${normalized.overviewAccuracyStatus ? renderPrintCallout("Overview Accuracy Status", normalized.overviewAccuracyStatus) : ""}
        <p class="print-note">Estimated range, not official IELTS score.</p>
      </section>
    </article>

    <article class="print-page">
      ${taskType === "Task 2" && normalized.bodyRouteSummary ? `<section class="print-section print-route-section">
        <h2>${escapeHtml(task2RouteLabel)}</h2>
        ${renderPrintCallout(task2RouteLabel, task2RouteText)}
      </section>` : ""}
      <section class="print-section">
        <h2>IELTS Criteria Breakdown</h2>
        <div class="print-card-grid">
          ${criteriaNames.map((name) => renderPrintCriteriaCard(name, normalized.criteriaScores?.[name], normalized.estimatedBandRange)).join("")}
        </div>
      </section>
      <section class="print-section">
        <h2>Kru Pom Framework Breakdown</h2>
        <div class="print-card-grid">
          ${frameworkNames.map((name) => renderPrintFrameworkCard(name, normalized.kruPomScores?.[name])).join("")}
        </div>
      </section>
    </article>

    <article class="print-page">
      <section class="print-section">
        <h2>Top Evidence-Based Issues</h2>
        <div class="print-issue-list">
          ${topIssues.length ? topIssues.map((issue, index) => renderPrintTopIssue(issue, feedbackCardForIssue(issue, feedbackCards, index), index)).join("") : "<p>No evidence-based issues found yet.</p>"}
        </div>
      </section>
    </article>

    <article class="print-page">
      <section class="print-section">
        <h2>Detailed Paragraph Feedback</h2>
        <div class="print-feedback-list">
          ${feedbackCards.length ? feedbackCards.map((card) => renderPrintFeedbackCard(card)).join("") : "<p>No detailed feedback cards available.</p>"}
        </div>
      </section>
    </article>

    <article class="print-page">
      <section class="print-section">
        <h2>Personalized 7-Day Repair Plan</h2>
        <div class="print-plan">
          ${(normalized.practicePlan || []).slice(0, 7).map((item, index) => renderPrintPlanItem(item, index)).join("")}
        </div>
      </section>
      <section class="print-section">
        <h2>${escapeHtml(taskType)} Progress Summary</h2>
        ${renderPrintProgressSummary(taskType, taskRecords, normalized, currentProgressSummary)}
      </section>
      <section class="print-section print-disclaimer">
        <h2>Disclaimer</h2>
        <p>This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners.</p>
        <p>รายงานนี้เป็นการประเมินเชิง diagnostic ตาม IELTS Writing Criteria และ framework ของ Kru Pom IELTS ไม่ใช่คะแนนทางการจาก IELTS examiner</p>
      </section>
      <footer>Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | Diagnostic estimate only</footer>
    </article>`;
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

function renderPrintFrameworkCard(name, value) {
  const status = value?.status || "Needs Work";
  return `<div class="print-card">
    <span>${escapePrintHtml(name)}</span>
    <strong><em class="print-badge ${statusClass(status)}">${escapePrintHtml(status)}</em></strong>
    <p>${escapePrintHtml(value?.diagnosis || "No framework diagnosis available yet.")}</p>
  </div>`;
}

function renderPrintTopIssue(issue, card = {}, index) {
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
  return `<div class="print-issue">
    <div class="print-issue-heading">
      <span>${index + 1}</span>
      <div>
        <h3>${escapePrintHtml(issue.title || issue.issueType || "Evidence-based issue")}</h3>
        <p><em class="print-badge ${statusClass(issue.severity)}">${escapePrintHtml(issue.severity || "Needs Work")}</em> ${criteria ? escapePrintHtml(criteria) : ""}</p>
      </div>
    </div>
    ${framework ? `<p><strong>Kru Pom Framework:</strong> ${escapePrintHtml(framework)}</p>` : ""}
    <p><strong>Evidence Scope:</strong> ${escapePrintHtml(issue.scope || (evidenceItems.length > 1 ? "multi-location" : "single-location"))}</p>
    <p><strong>Paragraph Locations:</strong> ${escapePrintHtml([...new Set(paragraphLocations)].join("; ") || "-")}</p>
    <div class="print-evidence-trace">
      ${evidenceItems.map((item) => `<div class="print-evidence-item">
        <p><strong>${escapePrintHtml(item.paragraphLocation || "Evidence")}</strong>${item.evidenceRole ? ` - ${escapePrintHtml(item.evidenceRole)}` : ""}</p>
        <blockquote>${escapePrintHtml(item.exactSentence || "-")}</blockquote>
      </div>`).join("")}
    </div>
    <p><strong>Diagnosis:</strong> ${escapePrintHtml(issue.diagnosis || issue.summary || card.whyItLimitsBand || "-")}</p>
    <p><strong>Student action:</strong> ${escapePrintHtml(issue.studentAction || card.studentAction || "-")}</p>
  </div>`;
}

function feedbackCardForIssue(issue = {}, cards = [], fallbackIndex = 0) {
  const match = String(issue.feedbackCardId || "").match(/^card-(\d+)$/);
  const referencedIndex = match ? Number(match[1]) - 1 : -1;
  if (referencedIndex >= 0 && cards[referencedIndex]) return cards[referencedIndex];
  const evidence = normalizeComparableText(issue.exactSentence);
  if (evidence) {
    const evidenceMatch = cards.find((card) => normalizeComparableText(card.exactSentence) === evidence);
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
    .replace(/\u2192/g, "->");
}

function escapePrintHtml(value) {
  return escapeHtml(sanitizePrintText(value));
}

function normalizePrintFeedbackCard(card = {}) {
  const result = { ...card };
  const exact = normalizeComparableText(result.exactSentence);
  if (exact.includes("clusterization of a specific place")) {
    result.targetedRevision = "First of all, concentrating facilities of the same type in one designated zone could create commuting difficulties for some residents.";
    result.revisionType = "Route-Preserving Revision";
  } else if (exact.includes("every family is living in different places and distances")) {
    result.targetedRevision = "Families live in different parts of a city, so concentrating facilities of the same type in one designated zone could force some residents to travel long distances to reach them.";
    result.revisionType = "Route-Preserving Revision";
  } else if (exact.includes("some people might encounter an issue of traveling")) {
    result.targetedRevision = "Therefore, concentrating similar facilities in one area could cause some residents to face travel difficulties.";
    result.revisionType = "Route-Preserving Revision";
  } else if (exact.includes("specific places like towns and cities should not be divided")) {
    result.targetedRevision = "In conclusion, I firmly believe that urban areas should not be divided into zones according to facility type, because concentrating similar facilities in separate districts would reduce accessibility and worsen traffic congestion.";
    result.revisionType = "Route-Preserving Revision";
  }
  return result;
}

function renderPrintFeedbackCard(card) {
  const normalizedCard = normalizePrintFeedbackCard(card);
  const severity = normalizedCard.severity || "Needs Work";
  return `<div class="print-feedback-card">
    <div class="print-feedback-primary-group">
      <div class="print-feedback-header-row">
        <h3>${escapePrintHtml(normalizedCard.issueType || "Diagnostic Issue")}</h3>
        <em class="print-badge ${statusClass(severity)}">${escapePrintHtml(severity)}</em>
      </div>
      <p class="print-keep-with-next"><strong>Paragraph Location:</strong> ${escapePrintHtml(normalizedCard.paragraphLocation || "-")}</p>
      <div class="print-exact-evidence-group">
        <p class="print-keep-with-next"><strong>Exact Sentence Found</strong></p>
        <blockquote>${escapePrintHtml(normalizedCard.exactSentence || "-")}</blockquote>
      </div>
      <p><strong>What This Sentence Is Trying To Do:</strong> ${escapePrintHtml(normalizedCard.sentenceFunction || "-")}</p>
      <p><strong>Why This Limits the Band:</strong> ${escapePrintHtml(normalizedCard.whyItLimitsBand || "-")}</p>
      <p><strong>Kru Pom Diagnosis:</strong> ${escapePrintHtml(normalizedCard.kruPomDiagnosis || "-")}</p>
    </div>
    <div class="print-feedback-revision-group">
      ${normalizedCard.revisionType ? `<p class="print-keep-with-next"><strong>Revision Type:</strong> ${escapePrintHtml(normalizedCard.revisionType)}</p>` : ""}
      <div class="print-target-revision-group">
        <p class="print-keep-with-next"><strong>Targeted Revision</strong></p>
        <div class="print-revision">${escapePrintHtml(normalizedCard.targetedRevision || "-")}</div>
      </div>
      <p><strong>Why This Revision Is Stronger:</strong> ${escapePrintHtml(normalizedCard.whyRevisionIsStronger || "-")}</p>
      <p><strong>Student Action:</strong> ${escapePrintHtml(normalizedCard.studentAction || "-")}</p>
    </div>
  </div>`;
}

function renderPrintPlanItem(item, index) {
  return `<div class="print-plan-item">
    <span>Day ${escapePrintHtml(item.day || index + 1)}</span>
    <p><strong>${escapePrintHtml(item.title || "Repair focus")}</strong><br>${escapePrintHtml(item.task || item.action || "-")}</p>
  </div>`;
}

function renderPrintProgressSummary(taskType, records, analysis, serverSummary) {
  const summary = normalizeProgressSummary(records, taskType, analysis, serverSummary);
  const validatedVersionCount = validatedStudentReportVersionCount(summary);
  const cells = [
    renderPrintInfo(`Previous ${taskType} submissions`, String(summary.previousSubmissionCount || 0)),
    renderPrintInfo("Previous estimated range", summary.previousSubmissionCount ? summary.previousEstimatedRange || "-" : "No previous submission"),
    renderPrintInfo("Latest estimated range", summary.latestEstimatedRange || analysis?.estimatedBandRange || "-"),
    renderPrintInfo("Current main repair", summary.currentMainRepair || analysis?.mostUrgentRepair || "-"),
    renderPrintInfo("Repeated issue", summary.repeatedIssue || "No repeated issue identified yet")
  ];
  if (validatedVersionCount !== null) {
    cells.push(renderPrintInfo("Report versions for latest essay", String(validatedVersionCount)));
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

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
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
  showToast(source.imageRequired
    ? "The saved writing is ready. Re-upload the original Task 1 image, or upload a revised image, before analyzing."
    : "The saved submission is ready. Edit it for a revised version, or submit it unchanged to open the same cached report.");
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
  const projected = analysis.canonicalAnalysis
    ? projectCanonicalAnalysis(analysis.canonicalAnalysis, analysis)
    : analysis;
  const feedbackCards = projected.feedbackCards || fallback.feedbackCards;
  return {
    ...fallback,
    ...projected,
    criteriaScores: projected.criteriaScores || fallback.criteriaScores,
    kruPomScores: projected.kruPomScores || fallback.kruPomScores,
    top3Issues: projected.top3Issues || fallback.top3Issues,
    feedbackCards,
    paragraphFeedback: normalizeParagraphItems(projected.paragraphFeedback || fallback.paragraphFeedback, feedbackCards),
    practicePlan: projected.practicePlan || fallback.practicePlan,
    warnings: projected.warnings || []
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

function showError(message) {
  formError.textContent = message || "Analysis could not be completed. Please check your prompt and writing, then try again.";
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
    const serviceReady = Boolean(health.diagnosticEngineConnected || health.aiConnected);
    const serviceUnavailable = Boolean(health.fullEngineRequired && !serviceReady);
    serviceStatus.textContent = serviceReady
      ? "Diagnostic service ready"
      : serviceUnavailable
        ? "Diagnostic service unavailable"
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
