const sessionStatus = document.querySelector("#admin-session-status");
const createForm = document.querySelector("#admin-create-form");
const usersBody = document.querySelector("#admin-users-body");
const adminError = document.querySelector("#admin-error");
const adminToast = document.querySelector("#admin-toast");
const credentialBox = document.querySelector("#credential-box");
const credentialText = document.querySelector("#credential-text");
const copyCredentials = document.querySelector("#copy-credentials");
const refreshUsers = document.querySelector("#refresh-users");
const diagnosticsOutput = document.querySelector("#diagnostics-output");
const diagnosticsButtons = {
  system: document.querySelector("#diagnostics-system"),
  provider: document.querySelector("#diagnostics-provider"),
  contract: document.querySelector("#diagnostics-contract"),
  storage: document.querySelector("#diagnostics-storage"),
  jobs: document.querySelector("#diagnostics-jobs"),
  recovery: document.querySelector("#diagnostics-recovery"),
  idempotency: document.querySelector("#diagnostics-idempotency"),
  failures: document.querySelector("#diagnostics-failures"),
  clearFailures: document.querySelector("#diagnostics-clear-failures")
};

let latestCredentialText = "";

initAdmin();

async function initAdmin() {
  try {
    const session = await apiGet("/api/session");
    if (!session.authenticated || session.user?.role !== "admin") {
      sessionStatus.textContent = "Admin login is required. Please log in with an admin account first, then open /admin again.";
      createForm.querySelectorAll("input, select, button").forEach((item) => { item.disabled = true; });
      return;
    }

    sessionStatus.textContent = `Logged in as ${session.user.displayName || session.user.username}`;
    await loadUsers();
  } catch (error) {
    showError(error.message);
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const formData = new FormData(createForm);
  const body = Object.fromEntries(formData.entries());
  body.quotaLimit = Number(body.quotaLimit || 0);
  if (["teacher", "admin"].includes(body.role)) {
    body.quotaMode = "unlimited";
  }

  try {
    const result = await apiPost("/api/admin/users", body);
    showCredential(result.user, result.generatedPassword);
    createForm.reset();
    createForm.elements.quotaLimit.value = "10";
    await loadUsers();
    showToast("Account created.");
  } catch (error) {
    showError(error.message);
  }
});

refreshUsers.addEventListener("click", () => {
  loadUsers().catch((error) => showError(error.message));
});

copyCredentials.addEventListener("click", async () => {
  if (!latestCredentialText) return;
  await navigator.clipboard.writeText(latestCredentialText);
  showToast("Credentials copied.");
});

// System Diagnostics: always render the raw result (even when ok:false) — the whole point is to show
// exactly which stage failed. These endpoints require an admin session and return only safe data.
function renderDiagnostics(label, result) {
  const status = result?.ok === true ? "OK" : (result?.ran === false ? "NOT RUN" : "ATTENTION");
  diagnosticsOutput.textContent = `${label} — ${status}\n\n${JSON.stringify(result, null, 2)}`;
}

async function runDiagnostic(label, url, method = "POST") {
  if (!diagnosticsOutput) return;
  clearError();
  diagnosticsOutput.textContent = `${label}: running...`;
  try {
    const options = method === "POST"
      ? { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
      : {};
    const response = await fetch(url, options);
    if (response.status === 403) {
      diagnosticsOutput.textContent = `${label}: admin login is required.`;
      return;
    }
    const data = await response.json().catch(() => ({ ok: false, error: "Non-JSON response." }));
    renderDiagnostics(label, data);
  } catch (error) {
    diagnosticsOutput.textContent = `${label}: request failed. ${error?.message || ""}`.trim();
  }
}

diagnosticsButtons.system?.addEventListener("click", () => runDiagnostic("System status", "/api/admin/diagnostics/system", "GET"));
diagnosticsButtons.provider?.addEventListener("click", () => runDiagnostic("Provider connectivity", "/api/admin/diagnostics/provider-connectivity"));
diagnosticsButtons.contract?.addEventListener("click", () => runDiagnostic("Production output contract", "/api/admin/diagnostics/production-contract"));
diagnosticsButtons.storage?.addEventListener("click", () => runDiagnostic("Storage self-test", "/api/admin/diagnostics/storage"));
diagnosticsButtons.jobs?.addEventListener("click", () => runDiagnostic("Job queue status", "/api/admin/diagnostics/job-queue-status", "GET"));

// ---- Account lifecycle: archive / restore / permanent delete (admin only, server-enforced) ----
async function accountAction(username, action) {
  const body = {};
  if (action === "delete") {
    const confirmation = window.prompt(`PERMANENT DELETE — this cannot be undone.\n\nType the username "${username}" exactly to confirm:`);
    if (!confirmation) return;
    body.confirmation = confirmation;
    body.reportMode = window.confirm(
      "Click OK to DELETE this account's reports as well.\n\nClick Cancel to KEEP the reports in anonymised form (identity and writing removed)."
    ) ? "delete" : "anonymise";
  } else if (action === "archive" && !window.confirm(`Archive "${username}"? The account is hidden from the active list and cannot sign in, but nothing is deleted and it can be restored.`)) {
    return;
  }
  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(username)}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      window.alert(result.error || `Action failed (${result.errorCode || response.status}).`);
      return;
    }
    if (action === "delete") {
      window.alert(`Deleted "${username}". Reports deleted: ${result.deletedReportCount || 0}; anonymised: ${result.anonymisedReportCount || 0}.`);
    }
    if (typeof loadUsers === "function") loadUsers();
  } catch {
    window.alert("Action failed. Please try again.");
  }
}

usersBody?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-lifecycle]");
  if (!button) return;
  const username = button.dataset.username;
  if (username) accountAction(username, button.dataset.lifecycle);
});

// ---- Canonical QA Export (admin only) ----
const qaSearch = document.querySelector("#qa-search");
const qaList = document.querySelector("#qa-report-list");
const qaStatus = document.querySelector("#qa-status");
let qaSelectedReportId = "";

async function loadQaReports() {
  if (!qaList) return;
  qaStatus.textContent = "Loading reports…";
  qaList.textContent = "";
  try {
    const query = encodeURIComponent(String(qaSearch?.value || "").trim());
    const response = await fetch(`/api/admin/qa-reports${query ? `?q=${query}` : ""}`);
    const result = await response.json();
    if (!response.ok || !result.ok) {
      qaStatus.textContent = result.error || "Reports could not be loaded.";
      return;
    }
    if (!result.reports.length) {
      qaStatus.textContent = "No reports matched.";
      return;
    }
    for (const report of result.reports) {
      // Build with DOM nodes only (never innerHTML) so no field can inject markup.
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ghost-button compact qa-report-row";
      row.dataset.reportId = report.reportId;
      const available = report.canonicalSnapshotAvailable
        ? "full canonical snapshot"
        : report.recordExportAvailable ? "partial (from saved record)" : "canonical data unavailable";
      row.textContent = `${report.date?.slice(0, 10) || "-"} | ${report.studentName || "-"} | ${report.taskType || "-"} ${report.essayOrVisualType || ""} | ${report.estimatedBandRange || "-"} | ${available}`;
      row.addEventListener("click", () => {
        qaSelectedReportId = report.reportId;
        for (const node of qaList.querySelectorAll(".qa-report-row")) node.classList.remove("is-selected");
        row.classList.add("is-selected");
        qaStatus.textContent = report.canonicalSnapshotAvailable || report.recordExportAvailable
          ? `Selected report ${report.reportId}.`
          : "Canonical data unavailable for this report version. Run a new analysis after the QA Export feature is deployed.";
      });
      qaList.appendChild(row);
    }
    qaStatus.textContent = `${result.reports.length} report(s). Select one, then click Export Canonical QA JSON.`;
  } catch {
    qaStatus.textContent = "Reports could not be loaded.";
  }
}

async function exportQaReport() {
  if (!qaSelectedReportId) {
    qaStatus.textContent = "Select one report first.";
    return;
  }
  qaStatus.textContent = "Exporting…";
  try {
    const response = await fetch(`/api/admin/qa-reports/${encodeURIComponent(qaSelectedReportId)}/export`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      qaStatus.textContent = error.error || `Export failed (${error.errorCode || response.status}).`;
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = match ? match[1] : `diagnostic-qa-${qaSelectedReportId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    qaStatus.textContent = "Canonical QA JSON downloaded.";
  } catch {
    qaStatus.textContent = "Export failed.";
  }
}

document.querySelector("#qa-refresh")?.addEventListener("click", loadQaReports);
document.querySelector("#qa-export")?.addEventListener("click", exportQaReport);
qaSearch?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); loadQaReports(); } });
diagnosticsButtons.recovery?.addEventListener("click", () => runDiagnostic("Stale job recovery test", "/api/admin/diagnostics/stale-job-recovery-test"));
diagnosticsButtons.idempotency?.addEventListener("click", () => runDiagnostic("Duplicate / idempotency test", "/api/admin/diagnostics/duplicate-idempotency-test"));
diagnosticsButtons.failures?.addEventListener("click", () => runDiagnostic("Recent analysis failures", "/api/admin/diagnostics/analysis-failures", "GET"));
diagnosticsButtons.clearFailures?.addEventListener("click", () => runDiagnostic("Clear failure history", "/api/admin/diagnostics/clear-failures"));

usersBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  clearError();
  const username = button.dataset.username;
  const action = button.dataset.action;

  try {
    if (action === "reset") {
      const result = await apiPost(`/api/admin/users/${encodeURIComponent(username)}/reset-password`, {});
      showCredential(result.user, result.generatedPassword);
      showToast("Password reset.");
    } else if (action === "disable" || action === "enable") {
      await apiPost(`/api/admin/users/${encodeURIComponent(username)}/${action}`, {});
      showToast(`Account ${action}d.`);
    } else if (action === "save") {
      const row = button.closest("tr");
      await apiPatch(`/api/admin/users/${encodeURIComponent(username)}`, {
        displayName: row.querySelector("[data-field='displayName']").value,
        role: row.querySelector("[data-field='role']").value,
        status: row.querySelector("[data-field='status']").value,
        quotaLimit: Number(row.querySelector("[data-field='quotaLimit']").value || 0),
        expiryDate: row.querySelector("[data-field='expiryDate']").value
      });
      showToast("Account updated.");
    }
    await loadUsers();
  } catch (error) {
    showError(error.message);
  }
});

async function loadUsers() {
  const result = await apiGet("/api/admin/users");
  usersBody.innerHTML = result.users.map(renderUserRow).join("");
}

function renderUserRow(user) {
  const quota = user.quotaMode === "unlimited"
    ? `unlimited, used ${escapeHtml(user.usedQuota ?? user.used ?? 0)}`
    : `${escapeHtml(user.remainingQuota ?? 0)} left / ${escapeHtml(user.quotaLimit ?? user.totalQuota ?? user.quota ?? 0)}`;
  const toggleAction = user.status === "active" ? "disable" : "enable";
  return `<tr>
    <td>${escapeHtml(user.username)}</td>
    <td><input data-field="displayName" value="${escapeHtml(user.displayName || "")}"></td>
    <td>
      <select data-field="role">
        ${option("student", user.role)}
        ${option("teacher", user.role)}
        ${option("admin", user.role)}
      </select>
    </td>
    <td>
      <select data-field="status">
        ${option("active", user.status)}
        ${option("inactive", user.status)}
        ${option("archived", user.status)}
      </select>
    </td>
    <td><input data-field="quotaLimit" type="number" min="0" value="${escapeHtml(user.quotaLimit ?? user.totalQuota ?? user.quota ?? 0)}"><small>${quota}</small></td>
    <td><input data-field="expiryDate" type="date" value="${escapeHtml(user.expiryDate || "")}"></td>
    <td>${escapeHtml(user.lastLoginAt || "-")}</td>
    <td class="admin-actions">
      <button type="button" class="ghost-button compact" data-action="save" data-username="${escapeHtml(user.username)}">Save</button>
      <button type="button" class="ghost-button compact" data-action="reset" data-username="${escapeHtml(user.username)}">Reset password</button>
      <button type="button" class="ghost-button compact" data-action="${toggleAction}" data-username="${escapeHtml(user.username)}">${toggleAction}</button>
      ${String(user.status || "").toLowerCase() === "archived"
        ? `<button type="button" class="ghost-button compact" data-lifecycle="restore" data-username="${escapeHtml(user.username)}">Restore</button>`
        : `<button type="button" class="ghost-button compact" data-lifecycle="archive" data-username="${escapeHtml(user.username)}">Archive</button>`}
      <button type="button" class="ghost-button compact danger" data-lifecycle="delete" data-username="${escapeHtml(user.username)}">Delete…</button>
    </td>
  </tr>`;
}

function showCredential(user, password) {
  latestCredentialText = `Username: ${user.username}\nPassword: ${password}\nLogin: ${window.location.origin}`;
  credentialText.textContent = latestCredentialText;
  credentialBox.classList.remove("hidden");
}

function option(value, current) {
  return `<option value="${value}"${value === current ? " selected" : ""}>${value}</option>`;
}

async function apiGet(url) {
  return readJson(await fetch(url), "Request failed.");
}

async function apiPost(url, body) {
  return readJson(await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }), "Request failed.");
}

async function apiPatch(url, body) {
  return readJson(await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }), "Request failed.");
}

async function readJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || fallback);
  return data;
}

function showError(message) {
  adminError.textContent = message;
  adminError.classList.add("visible");
}

function clearError() {
  adminError.textContent = "";
  adminError.classList.remove("visible");
}

function showToast(message) {
  adminToast.textContent = message;
  adminToast.classList.add("visible");
  window.setTimeout(() => adminToast.classList.remove("visible"), 1800);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
