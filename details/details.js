import { collectErrors } from "../lib/log-errors.js";
import { parseDebugLog, renderLogHtml } from "../lib/log-formatter.js";

const params = new URLSearchParams(window.location.search);
const logId = params.get("logId");
const tabIdParam = params.get("tabId");
const tabId = tabIdParam != null && tabIdParam !== "" ? Number(tabIdParam) : undefined;

const bannerLoading = document.getElementById("bannerLoading");
const bannerError = document.getElementById("bannerError");
const summary = document.getElementById("summary");
const errorPanel = document.getElementById("errorPanel");
const errorList = document.getElementById("errorList");
const logMain = document.getElementById("logMain");
const logScroll = document.getElementById("logScroll");
const sumLines = document.getElementById("sumLines");
const sumSoql = document.getElementById("sumSoql");
const sumErrors = document.getElementById("sumErrors");
const btnCopy = document.getElementById("btnCopy");
const btnReload = document.getElementById("btnReload");
const btnClose = document.getElementById("btnClose");

let rawText = "";

function showLoading(show) {
  bannerLoading.hidden = !show;
}

function showError(msg) {
  bannerError.textContent = msg;
  bannerError.hidden = false;
  summary.hidden = true;
  errorPanel.hidden = true;
  logMain.hidden = true;
}

function hideErrorBanner() {
  bannerError.hidden = true;
}

async function fetchLog() {
  if (!logId) {
    showError("Missing log id in URL.");
    showLoading(false);
    return;
  }

  showLoading(true);
  hideErrorBanner();
  summary.hidden = true;
  errorPanel.hidden = true;
  logMain.hidden = true;

  const res = await chrome.runtime.sendMessage({
    type: "GET_LOG_BODY",
    logId,
    tabId: Number.isFinite(tabId) ? tabId : undefined,
  });

  showLoading(false);

  if (!res?.ok) {
    showError(res?.error || "Failed to load log body.");
    return;
  }

  rawText = res.body || "";
  const parsed = parseDebugLog(rawText);

  sumLines.textContent = String(parsed.lines.length);
  sumSoql.textContent = String(parsed.summary.soql);
  sumErrors.textContent = String(collectErrors(parsed).length);
  summary.hidden = false;

  const errs = collectErrors(parsed);
  if (errs.length) {
    errorPanel.hidden = false;
    errorList.innerHTML = "";
    for (const e of errs) {
      const li = document.createElement("li");
      li.className = "error-item";
      li.innerHTML = `<div class="error-item__meta">Line ${e.index}${
        e.time ? ` · ${escapeHtml(e.time)}` : ""
      } · ${escapeHtml(e.event)}</div>${escapeHtml(e.text)}`;
      errorList.appendChild(li);
    }
  } else {
    errorPanel.hidden = true;
    errorList.innerHTML = "";
  }

  logScroll.innerHTML = renderLogHtml(parsed.lines);
  logMain.hidden = false;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

btnCopy.addEventListener("click", async () => {
  if (!rawText) return;
  try {
    await navigator.clipboard.writeText(rawText);
    btnCopy.textContent = "Copied";
    setTimeout(() => {
      btnCopy.textContent = "Copy raw log";
    }, 1500);
  } catch {
    btnCopy.textContent = "Copy failed";
  }
});

btnReload.addEventListener("click", () => fetchLog());

btnClose.addEventListener("click", (e) => {
  e.preventDefault();
  window.close();
});

fetchLog();
