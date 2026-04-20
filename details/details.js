import {
  filterLogLines,
  isExceptionsOnlyFilter,
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
const sumSoql = document.getElementById("sumSoql");
const sumErrors = document.getElementById("sumErrors");
const pillErrorsBtn = document.getElementById("pillErrorsBtn");
const errorNavFlyout = document.getElementById("errorNavFlyout");
const errorNavPrev = document.getElementById("errorNavPrev");
const errorNavNext = document.getElementById("errorNavNext");
const errorNavPosition = document.getElementById("errorNavPosition");
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

/** @type {HTMLElement[]} */
let errorNavNodes = [];
let errorNavIndex = 0;

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

function collectErrorRowElements() {
  return Array.from(
    logTableHost.querySelectorAll('tr[id^="log-error-row-"]')
  );
}

function updateErrorSummaryAndNav() {
  errorNavNodes = collectErrorRowElements();
  const n = errorNavNodes.length;
  sumErrors.textContent = String(n);
  if (pillErrorsBtn) {
    pillErrorsBtn.disabled = n === 0;
  }
  errorNavFlyout.hidden = true;
  errorNavIndex = 0;
  if (errorNavPosition) {
    errorNavPosition.textContent = "";
  }
}

function updateErrorNavLabel() {
  const n = errorNavNodes.length;
  if (!errorNavPosition) return;
  if (n === 0) {
    errorNavPosition.textContent = "";
    return;
  }
  errorNavPosition.textContent = `${errorNavIndex + 1} / ${n}`;
}

function scrollToErrorIndex(i) {
  if (i < 0 || i >= errorNavNodes.length) return;
  const el = errorNavNodes[i];
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  errorNavIndex = i;
  updateErrorNavLabel();
}

function applyFiltersAndRender() {
  if (!lastParsed) return;
  const filters = readFiltersFromUi();
  saveLogFilters(filters);
  const filtered = filterLogLines(lastParsed.lines, filters);
  logTableHost.innerHTML = renderLogTableHtml(filtered, {
    emphasizeExceptions: isExceptionsOnlyFilter(filters),
  });
  updateErrorSummaryAndNav();
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

pillErrorsBtn.addEventListener("click", () => {
  errorNavNodes = collectErrorRowElements();
  const n = errorNavNodes.length;
  sumErrors.textContent = String(n);
  if (n === 0) return;
  errorNavIndex = 0;
  scrollToErrorIndex(0);
  if (n > 1) {
    errorNavFlyout.hidden = false;
  } else {
    errorNavFlyout.hidden = true;
  }
});

errorNavPrev.addEventListener("click", () => {
  if (errorNavNodes.length <= 1) return;
  const prev = (errorNavIndex - 1 + errorNavNodes.length) % errorNavNodes.length;
  scrollToErrorIndex(prev);
});

errorNavNext.addEventListener("click", () => {
  if (errorNavNodes.length <= 1) return;
  const next = (errorNavIndex + 1) % errorNavNodes.length;
  scrollToErrorIndex(next);
});

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
