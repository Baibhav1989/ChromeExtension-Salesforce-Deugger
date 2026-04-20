const logList = document.getElementById("logList");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const statusBadge = document.getElementById("statusBadge");
const traceStatus = document.getElementById("traceStatus");
const btnRefresh = document.getElementById("btnRefresh");
const btnSetLog = document.getElementById("btnSetLog");
const refreshSelect = document.getElementById("refreshSelect");
const userSearchInput = document.getElementById("userSearchInput");
const userTypeaheadList = document.getElementById("userTypeaheadList");
const linkOptions = document.getElementById("linkOptions");

const FILTER_ALL = "__ALL__";
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
let allUsers = [];
let selectedUserId = FILTER_ALL;
let selectedUserLabel = "All";

function logJsError(context, error) {
  const message = error?.stack || error?.message || String(error);
  console.log(`[SF Debugger][${context}] ${message}`, error);
}

window.addEventListener("error", (event) => {
  logJsError("popup error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logJsError("popup unhandled rejection", event.reason);
});

async function getConfiguredDebugLevels() {
  try {
    const cfg = await chrome.storage.sync.get({ debugLevels: DEFAULT_DEBUG_LEVELS });
    return { ...DEFAULT_DEBUG_LEVELS, ...(cfg.debugLevels || {}) };
  } catch (error) {
    logJsError("load debug levels from settings", error);
    return { ...DEFAULT_DEBUG_LEVELS };
  }
}

async function getConfiguredTraceDurationMinutes() {
  try {
    const cfg = await chrome.storage.sync.get({ traceDurationMinutes: 15 });
    return Math.min(Math.max(Number(cfg.traceDurationMinutes) || 15, 5), 240);
  } catch (error) {
    logJsError("load trace duration from settings", error);
    return 15;
  }
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
  return selectedUserId === FILTER_ALL ? null : selectedUserId;
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
  return user.name || user.username || user.id;
}

function userMatchesSearch(user, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    String(user.name || "")
      .toLowerCase()
      .includes(q) ||
    String(user.username || "")
      .toLowerCase()
      .includes(q) ||
    String(user.userType || "")
      .toLowerCase()
      .includes(q) ||
    String(user.id || "")
      .toLowerCase()
      .includes(q)
  );
}

function hideTypeahead() {
  userTypeaheadList.hidden = true;
}

function showTypeahead() {
  userTypeaheadList.hidden = false;
}

function setUserSelection(id, label) {
  selectedUserId = id || FILTER_ALL;
  selectedUserLabel = label || "All";
  userSearchInput.value = selectedUserLabel === "All" ? "" : selectedUserLabel;
  btnSetLog.disabled = selectedUserId === FILTER_ALL;
}

async function applyUserSelectionAndRefresh(id, label) {
  setUserSelection(id, label);
  hideTypeahead();
  await loadLogs();
  await refreshTraceStatusForSelection();
}

function renderUserOptions() {
  const previous = selectedUserId || FILTER_ALL;
  const query = String(userSearchInput.value || "").trim();
  const visibleUsers = allUsers.filter((u) => userMatchesSearch(u, query)).slice(0, 50);
  userTypeaheadList.innerHTML = "";

  const allItem = document.createElement("div");
  allItem.className = `typeahead-item${previous === FILTER_ALL ? " typeahead-item--active" : ""}`;
  allItem.textContent = "All";
  allItem.addEventListener("mousedown", async (e) => {
    e.preventDefault();
    await applyUserSelectionAndRefresh(FILTER_ALL, "All");
  });
  userTypeaheadList.appendChild(allItem);

  for (const user of visibleUsers) {
    const item = document.createElement("div");
    const isActive = user.id === previous;
    item.className = `typeahead-item${isActive ? " typeahead-item--active" : ""}`;
    item.innerHTML = `${escapeHtml(formatUserLabel(user))}${
      user.username ? `<span class="typeahead-item__sub">${escapeHtml(user.username)}</span>` : ""
    }`;
    item.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      await applyUserSelectionAndRefresh(user.id, formatUserLabel(user));
    });
    userTypeaheadList.appendChild(item);
  }

  if (!query && selectedUserId === FILTER_ALL) {
    userSearchInput.placeholder = "All";
  }
}

async function loadActiveUsers() {
  try {
    const tabId = await getSfTabId();
    if (tabId == null) return;
    lastSfTabId = tabId;
    const res = await chrome.runtime.sendMessage({ type: "LIST_ACTIVE_USERS", tabId });
    if (!res?.ok) {
      showTraceStatus(res?.error || "Could not load active users.", "error");
      return;
    }
    allUsers = res.users || [];
    setUserSelection(selectedUserId, selectedUserLabel);
    renderUserOptions();
  } catch (error) {
    logJsError("loadActiveUsers", error);
    showTraceStatus("Could not load users. Check console logs.", "error");
  }
}

async function loadLogs() {
  try {
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
  } catch (error) {
    logJsError("loadLogs", error);
    showError("Failed to load logs. Check console logs.");
    clearList();
    setBadge("Error", false);
  }
}

async function refreshTraceStatusForSelection() {
  try {
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
  } catch (error) {
    logJsError("refreshTraceStatusForSelection", error);
    showTraceStatus("Could not read trace status. Check console logs.", "error");
  }
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
  const oldText = btnSetLog.textContent || "Set Log";
  btnSetLog.textContent = "Setting...";
  try {
    const res = await chrome.runtime.sendMessage({
      type: "SET_TRACE_FLAG",
      tabId,
      userId,
      durationMinutes: await getConfiguredTraceDurationMinutes(),
      debugLevels: await getConfiguredDebugLevels(),
    });

    if (!res?.ok) {
      showTraceStatus(res?.error || "Failed to set trace flag for selected user.", "error");
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
  } catch (error) {
    logJsError("setTraceForSelectedUser", error);
    showTraceStatus("Failed to set trace flag for selected user. Check console logs.", "error");
  } finally {
    btnSetLog.textContent = oldText;
    btnSetLog.disabled = false;
  }
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

userSearchInput.addEventListener("input", () => {
  selectedUserId = FILTER_ALL;
  selectedUserLabel = "All";
  btnSetLog.disabled = true;
  renderUserOptions();
  showTypeahead();
});

userSearchInput.addEventListener("focus", () => {
  renderUserOptions();
  showTypeahead();
});

userSearchInput.addEventListener("blur", () => {
  setTimeout(() => {
    hideTypeahead();
  }, 120);
});

linkOptions.addEventListener("click", (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.storage.sync.get({ refreshSeconds: 15, logLimit: 50 }, async (cfg) => {
  btnSetLog.disabled = true;
  const v = String(cfg.refreshSeconds ?? 15);
  const opt = [...refreshSelect.options].find((o) => o.value === v);
  refreshSelect.value = opt ? opt.value : "15";
  await loadActiveUsers();
  await loadLogs();
  await refreshTraceStatusForSelection();
  scheduleRefresh();
});
