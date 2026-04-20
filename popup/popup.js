const logList = document.getElementById("logList");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const statusBadge = document.getElementById("statusBadge");
const btnRefresh = document.getElementById("btnRefresh");
const refreshSelect = document.getElementById("refreshSelect");
const linkOptions = document.getElementById("linkOptions");

let refreshTimer = null;
let lastSfTabId = null;

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
  const res = await chrome.runtime.sendMessage({ type: "LIST_LOGS", tabId });

  if (!res?.ok) {
    showError(res?.error || "Failed to load logs.");
    clearList();
    setBadge("Error", false);
    return;
  }

  hideError();
  setBadge(`${res.records.length} logs`, true);

  if (!res.records.length) {
    emptyState.hidden = false;
    clearList();
    return;
  }

  emptyState.hidden = true;
  clearList();

  for (const r of res.records) {
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

btnRefresh.addEventListener("click", () => loadLogs());
refreshSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ refreshSeconds: Number(refreshSelect.value) });
  scheduleRefresh();
});

linkOptions.addEventListener("click", (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.storage.sync.get({ refreshSeconds: 15, logLimit: 50 }, (cfg) => {
  const v = String(cfg.refreshSeconds ?? 15);
  const opt = [...refreshSelect.options].find((o) => o.value === v);
  if (opt) refreshSelect.value = opt.value;
  else refreshSelect.value = "15";
  loadLogs().then(scheduleRefresh);
});
