const logList = document.getElementById("logList");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const statusBadge = document.getElementById("statusBadge");
const traceStatus = document.getElementById("traceStatus");
const btnRefresh = document.getElementById("btnRefresh");
const btnSetLog = document.getElementById("btnSetLog");
const refreshSelect = document.getElementById("refreshSelect");
const traceDurationSelect = document.getElementById("traceDurationSelect");
const userFilterSelect = document.getElementById("userFilterSelect");
const linkOptions = document.getElementById("linkOptions");
const dbgApexCode = document.getElementById("dbgApexCode");
const dbgApexProfiling = document.getElementById("dbgApexProfiling");
const dbgCallout = document.getElementById("dbgCallout");
const dbgDatabase = document.getElementById("dbgDatabase");
const dbgSystem = document.getElementById("dbgSystem");
const dbgValidation = document.getElementById("dbgValidation");
const dbgVisualforce = document.getElementById("dbgVisualforce");
const dbgWorkflow = document.getElementById("dbgWorkflow");

const FILTER_ALL = "__ALL__";
const DEBUG_LEVEL_VALUES = [
  "NONE",
  "ERROR",
  "WARN",
  "INFO",
  "DEBUG",
  "FINE",
  "FINER",
  "FINEST",
];
const DEFAULT_DEBUG_LEVELS = {
  ApexCode: "DEBUG",
  ApexProfiling: "INFO",
  Callout: "INFO",
  Database: "INFO",
  System: "DEBUG",
  Validation: "INFO",
  Visualforce: "INFO",
  Workflow: "INFO",
};

let refreshTimer = null;
let lastSfTabId = null;

function initDebugLevelControls() {
  const fields = [
    [dbgApexCode, "ApexCode"],
    [dbgApexProfiling, "ApexProfiling"],
    [dbgCallout, "Callout"],
    [dbgDatabase, "Database"],
    [dbgSystem, "System"],
    [dbgValidation, "Validation"],
    [dbgVisualforce, "Visualforce"],
    [dbgWorkflow, "Workflow"],
  ];
  for (const [el, key] of fields) {
    el.innerHTML = "";
    for (const level of DEBUG_LEVEL_VALUES) {
      const opt = document.createElement("option");
      opt.value = level;
      opt.textContent = level;
      if (DEFAULT_DEBUG_LEVELS[key] === level) opt.selected = true;
      el.appendChild(opt);
    }
  }
}

function getSelectedDebugLevels() {
  return {
    ApexCode: dbgApexCode.value || DEFAULT_DEBUG_LEVELS.ApexCode,
    ApexProfiling: dbgApexProfiling.value || DEFAULT_DEBUG_LEVELS.ApexProfiling,
    Callout: dbgCallout.value || DEFAULT_DEBUG_LEVELS.Callout,
    Database: dbgDatabase.value || DEFAULT_DEBUG_LEVELS.Database,
    System: dbgSystem.value || DEFAULT_DEBUG_LEVELS.System,
    Validation: dbgValidation.value || DEFAULT_DEBUG_LEVELS.Validation,
    Visualforce: dbgVisualforce.value || DEFAULT_DEBUG_LEVELS.Visualforce,
    Workflow: dbgWorkflow.value || DEFAULT_DEBUG_LEVELS.Workflow,
  };
}

function isSfUrl(url) {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes("salesforce.com") ||
      h.includes("force.com") ||
      h.includes("salesforce-setup.com")
    );
  } catch {
    return false;
  }
}

async function getSfTabId() {
  const cur = await chrome.tabs.query({ active: true, currentWindow: true });
  if (cur[0]?.url && isSfUrl(cur[0].url)) return cur[0].id;
  const w = await chrome.tabs.query({ currentWindow: true });
  const t = w.find((x) => x.url && isSfUrl(x.url));
  if (t) return t.id;
  const all = await chrome.tabs.query({});
  const any = all.find((x) => x.url && isSfUrl(x.url));
  return any?.id ?? null;
}

function getSelectedUserId() {
  const value = userFilterSelect.value || FILTER_ALL;
  return value === FILTER_ALL ? null : value;
}

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function clearList() {
  logList.innerHTML = "";
}

function showTraceStatus(text, tone) {
  traceStatus.hidden = false;
  traceStatus.className = "hint hint--status";
  if (tone === "ok") traceStatus.classList.add("hint--ok");
  if (tone === "warn") traceStatus.classList.add("hint--warn");
  if (tone === "error") traceStatus.classList.add("hint--error");
  traceStatus.textContent = text;
}

function hideTraceStatus() {
  traceStatus.hidden = true;
  traceStatus.className = "hint hint--status";
  traceStatus.textContent = "";
}

function showError(msg) {
  errorState.textContent = msg;
  errorState.hidden = false;
  emptyState.hidden = true;
}

function hideError() {
  errorState.hidden = true;
}

function setBadge(text, ok) {
  if (!text) {
    statusBadge.hidden = true;
    return;
  }
  statusBadge.hidden = false;
  statusBadge.textContent = text;
  statusBadge.style.color = ok ? "var(--ok)" : "var(--muted)";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openDetail(logId) {
  const tab = lastSfTabId != null ? `&tabId=${lastSfTabId}` : "";
  const url = chrome.runtime.getURL(
    `details/details.html?logId=${encodeURIComponent(logId)}${tab}`
  );
  chrome.tabs.create({ url });
}

function renderRecords(records) {
  setBadge(`${records.length} logs`, true);
  emptyState.textContent = getSelectedUserId()
    ? "No logs found for selected user."
    : "No logs loaded yet.";
  emptyState.hidden = records.length > 0;
  clearList();

  for (const r of records) {
    const li = document.createElement("li");
    li.className = "log-item";
    li.dataset.logId = r.id;

    const statusClass =
      (r.status || "").toLowerCase() === "success"
        ? "log-item__status--success"
        : "log-item__status--fail";

    li.innerHTML = `
      <div class="log-item__top">
        <span class="log-item__time">${escapeHtml(formatTime(r.startTime))}</span>
        <span class="log-item__status ${statusClass}">${escapeHtml(r.status || "—")}</span>
      </div>
      <div class="log-item__meta">
        <div><strong>Operation:</strong> ${escapeHtml(r.operation || "—")}</div>
        <div><strong>Application:</strong> ${escapeHtml(r.application || "—")}</div>
        <div><strong>User:</strong> ${escapeHtml(r.logUserName || r.logUserId || "—")}</div>
        <div><strong>Duration:</strong> ${escapeHtml(
          r.durationMs != null ? `${r.durationMs} ms` : "—"
        )} · <strong>Size:</strong> ${escapeHtml(
      r.logLength != null ? String(r.logLength) : "—"
    )}</div>
      </div>
    `;

    li.addEventListener("click", () => openDetail(r.id));
    logList.appendChild(li);
  }
}

function formatUserLabel(user) {
  const type = user.userType ? ` (${user.userType})` : "";
  return `${user.name}${type}`;
}

function renderUserOptions(users) {
  const previous = userFilterSelect.value || FILTER_ALL;
  userFilterSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = FILTER_ALL;
  allOption.textContent = "All";
  userFilterSelect.appendChild(allOption);

  for (const user of users) {
    const opt = document.createElement("option");
    opt.value = user.id;
    opt.textContent = formatUserLabel(user);
    userFilterSelect.appendChild(opt);
  }

  const exists = [...userFilterSelect.options].some((opt) => opt.value === previous);
  userFilterSelect.value = exists ? previous : FILTER_ALL;
  btnSetLog.disabled = userFilterSelect.value === FILTER_ALL;
}

async function loadActiveUsers() {
  const tabId = await getSfTabId();
  if (tabId == null) return;
  lastSfTabId = tabId;
  const res = await chrome.runtime.sendMessage({ type: "LIST_ACTIVE_USERS", tabId });
  if (!res?.ok) {
    showTraceStatus(res?.error || "Could not load active users.", "error");
    return;
  }
  renderUserOptions(res.users || []);
}

async function loadLogs() {
  hideError();
  const tabId = await getSfTabId();
  lastSfTabId = tabId;
  if (tabId == null) {
    showError(
      "No Salesforce tab found. Open Lightning, Setup, or your org in another tab."
    );
    clearList();
    setBadge("", false);
    return;
  }

  setBadge("Loading…", false);
  const logUserId = getSelectedUserId();
  const res = await chrome.runtime.sendMessage({ type: "LIST_LOGS", tabId, logUserId });

  if (!res?.ok) {
    showError(res?.error || "Failed to load logs.");
    clearList();
    setBadge("Error", false);
    return;
  }

  hideError();
  renderRecords(res.records || []);
}

async function refreshTraceStatusForSelection() {
  const userId = getSelectedUserId();
  btnSetLog.disabled = !userId;
  if (!userId) {
    hideTraceStatus();
    return;
  }
  const tabId = await getSfTabId();
  if (tabId == null) return;
  lastSfTabId = tabId;
  const res = await chrome.runtime.sendMessage({
    type: "GET_TRACE_FLAG_STATUS",
    tabId,
    userId,
  });
  if (!res?.ok) {
    showTraceStatus(res?.error || "Could not read trace status.", "error");
    return;
  }
  if (res.active && res.expirationDate) {
    showTraceStatus(`Trace already active until ${formatTime(res.expirationDate)}.`, "ok");
    return;
  }
  if (res.expiredAt) {
    showTraceStatus(
      `Trace expired at ${formatTime(res.expiredAt)}. Click Set Log to enable again.`,
      "warn"
    );
    return;
  }
  showTraceStatus("No active trace for this user. Click Set Log.", "warn");
}

async function setTraceForSelectedUser() {
  const userId = getSelectedUserId();
  if (!userId) {
    showTraceStatus("Select a user first, then click Set Log.", "warn");
    return;
  }
  const tabId = await getSfTabId();
  if (tabId == null) {
    showTraceStatus("Open a Salesforce tab first.", "error");
    return;
  }
  lastSfTabId = tabId;

  btnSetLog.disabled = true;
  const oldText = btnSetLog.textContent;
  btnSetLog.textContent = "Setting…";
  const res = await chrome.runtime.sendMessage({
    type: "SET_TRACE_FLAG",
    tabId,
    userId,
    durationMinutes: Number(traceDurationSelect.value) || 15,
    debugLevels: getSelectedDebugLevels(),
  });
  btnSetLog.textContent = oldText;
  btnSetLog.disabled = false;

  if (!res?.ok) {
    showTraceStatus(res?.error || "Failed to set trace flag.", "error");
    return;
  }

  if (res.alreadyActive) {
    showTraceStatus(
      `Trace already exists and is active until ${formatTime(res.expirationDate)}.`,
      "ok"
    );
  } else {
    showTraceStatus(
      `Trace enabled until ${formatTime(res.expirationDate)} for selected user.`,
      "ok"
    );
  }
  await loadLogs();
}

function scheduleRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  const sec = Number(refreshSelect.value);
  if (!sec) return;
  refreshTimer = setInterval(() => {
    loadLogs();
  }, sec * 1000);
}

btnRefresh.addEventListener("click", async () => {
  await loadLogs();
  await refreshTraceStatusForSelection();
});

btnSetLog.addEventListener("click", async () => {
  await setTraceForSelectedUser();
  await refreshTraceStatusForSelection();
});

refreshSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ refreshSeconds: Number(refreshSelect.value) });
  scheduleRefresh();
});

userFilterSelect.addEventListener("change", async () => {
  await loadLogs();
  await refreshTraceStatusForSelection();
});

linkOptions.addEventListener("click", (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.storage.sync.get({ refreshSeconds: 15, logLimit: 50 }, async (cfg) => {
  btnSetLog.disabled = true;
  initDebugLevelControls();
  const v = String(cfg.refreshSeconds ?? 15);
  const opt = [...refreshSelect.options].find((o) => o.value === v);
  refreshSelect.value = opt ? opt.value : "15";
  await loadActiveUsers();
  await loadLogs();
  await refreshTraceStatusForSelection();
  scheduleRefresh();
});
