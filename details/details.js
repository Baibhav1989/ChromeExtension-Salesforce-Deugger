import { collectErrors } from "../lib/log-errors.js";
import {
  filterLogLines,
  loadLogFilters,
  parseDebugLog,
  renderLogTableHtml,
  saveLogFilters,
} from "../lib/log-formatter.js";

const CATEGORY_FILTER_IDS = [
  "filterDebug",
  "filterException",
  "filterQuery",
  "filterVariable",
];

function logJsError(context, error) {
  const message = error?.stack || error?.message || String(error);
  console.log(`[SF Debugger][${context}] ${message}`, error);
}

window.addEventListener("error", (event) => {
  logJsError("details error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logJsError("details unhandled rejection", event.reason);
});

const params = new URLSearchParams(window.location.search);
const logId = params.get("logId");
const tabIdParam = params.get("tabId");
const tabId = tabIdParam != null && tabIdParam !== "" ? Number(tabIdParam) : undefined;

const bannerLoading = document.getElementById("bannerLoading");
const bannerError = document.getElementById("bannerError");
const summary = document.getElementById("summary");
const logMain = document.getElementById("logMain");
const logTableHost = document.getElementById("logTableHost");
const sumLines = document.getElementById("sumLines");
const sumShown = document.getElementById("sumShown");
const sumSoql = document.getElementById("sumSoql");
const sumErrors = document.getElementById("sumErrors");
const btnCopy = document.getElementById("btnCopy");
const btnReload = document.getElementById("btnReload");
const btnClose = document.getElementById("btnClose");
const extensionVersion = document.getElementById("extension-version");

const filterAll = document.getElementById("filterAll");
const filterDebug = document.getElementById("filterDebug");
const filterException = document.getElementById("filterException");
const filterQuery = document.getElementById("filterQuery");
const filterVariable = document.getElementById("filterVariable");

let rawText = "";
/** @type {any} */
let lastParsed = null;

if (extensionVersion) {
  extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
}

function readFiltersFromUi() {
  return {
    debug: filterDebug.checked,
    exception: filterException.checked,
    query: filterQuery.checked,
    variable: filterVariable.checked,
  };
}

function applyFiltersToUi(saved) {
  filterDebug.checked = saved.debug;
  filterException.checked = saved.exception;
  filterQuery.checked = saved.query;
  filterVariable.checked = saved.variable;
  syncMasterCategoryCheckbox();
}

function syncMasterCategoryCheckbox() {
  const f = readFiltersFromUi();
  const allOn = f.debug && f.exception && f.query && f.variable;
  const anyOn = f.debug || f.exception || f.query || f.variable;
  filterAll.checked = allOn;
  filterAll.indeterminate = Boolean(anyOn && !allOn);
}

function applyFiltersAndRender() {
  if (!lastParsed) return;
  const filters = readFiltersFromUi();
  saveLogFilters(filters);
  const filtered = filterLogLines(lastParsed.lines, filters);
  sumShown.textContent = String(filtered.length);
  logTableHost.innerHTML = renderLogTableHtml(filtered);
}

filterAll.addEventListener("change", () => {
  const on = filterAll.checked;
  filterDebug.checked = on;
  filterException.checked = on;
  filterQuery.checked = on;
  filterVariable.checked = on;
  filterAll.indeterminate = false;
  applyFiltersAndRender();
});

for (const id of CATEGORY_FILTER_IDS) {
  document.getElementById(id).addEventListener("change", () => {
    syncMasterCategoryCheckbox();
    applyFiltersAndRender();
  });
}

function showLoading(show) {
  bannerLoading.hidden = !show;
}

function showError(msg) {
  bannerError.textContent = msg;
  bannerError.hidden = false;
  summary.hidden = true;
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
  lastParsed = parsed;

  sumLines.textContent = String(parsed.lines.length);
  sumSoql.textContent = String(parsed.summary.soql);
  sumErrors.textContent = String(collectErrors(parsed).length);
  summary.hidden = false;

  applyFiltersToUi(loadLogFilters());
  applyFiltersAndRender();
  logMain.hidden = false;
}

btnCopy.addEventListener("click", async () => {
  if (!rawText) return;
  try {
    await navigator.clipboard.writeText(rawText);
    btnCopy.textContent = "Copied";
    setTimeout(() => {
      btnCopy.textContent = "Copy raw log";
    }, 1500);
  } catch (error) {
    logJsError("copy raw log", error);
    btnCopy.textContent = "Copy failed";
  }
});

btnReload.addEventListener("click", () => fetchLog());

btnClose.addEventListener("click", (e) => {
  e.preventDefault();
  window.close();
});

fetchLog();
