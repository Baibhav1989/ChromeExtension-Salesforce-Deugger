import {
  filterLogLines,
  isExceptionsOnlyFilter,
  loadLogFilters,
  parseDebugLog,
  renderFullRawLogHtml,
  renderLogTableHtml,
  saveLogFilters,
} from "../lib/log-formatter.js";

const OPTIMIZE_LOG_STORAGE_KEY = "logViewerOptimizeLog";

async function loadOptimizeLogPreference() {
  try {
    const stored = await chrome.storage.local.get({
      [OPTIMIZE_LOG_STORAGE_KEY]: false,
    });
    return Boolean(stored[OPTIMIZE_LOG_STORAGE_KEY]);
  } catch (error) {
    logJsError("loadOptimizeLogPreference", error);
    return false;
  }
}

function persistOptimizeLogPreference(optimized) {
  chrome.storage.local
    .set({ [OPTIMIZE_LOG_STORAGE_KEY]: Boolean(optimized) })
    .catch((error) => logJsError("persistOptimizeLogPreference", error));
}

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
const pillSoqlBtn = document.getElementById("pillSoqlBtn");
const errorNavFlyout = document.getElementById("errorNavFlyout");
const errorNavPrev = document.getElementById("errorNavPrev");
const errorNavNext = document.getElementById("errorNavNext");
const errorNavPosition = document.getElementById("errorNavPosition");
const soqlNavFlyout = document.getElementById("soqlNavFlyout");
const soqlNavPrev = document.getElementById("soqlNavPrev");
const soqlNavNext = document.getElementById("soqlNavNext");
const soqlNavPosition = document.getElementById("soqlNavPosition");
const btnCopy = document.getElementById("btnCopy");
const btnReload = document.getElementById("btnReload");
const btnClose = document.getElementById("btnClose");
const extensionVersion = document.getElementById("extension-version");

const filterAll = document.getElementById("filterAll");
const filterDebug = document.getElementById("filterDebug");
const filterException = document.getElementById("filterException");
const filterQuery = document.getElementById("filterQuery");
const filterVariable = document.getElementById("filterVariable");
const chkOptimizeLog = document.getElementById("chkOptimizeLog");
const logFilters = document.getElementById("logFilters");

let rawText = "";
/** @type {any} */
let lastParsed = null;

/** @type {HTMLElement[]} */
let errorNavNodes = [];
let errorNavIndex = 0;

/** @type {HTMLElement[]} */
let soqlNavNodes = [];
let soqlNavIndex = 0;

if (extensionVersion) {
  extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
}

function isOptimizedView() {
  if (!chkOptimizeLog) return false;
  return chkOptimizeLog.checked;
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

function collectSoqlRowElements() {
  return Array.from(
    logTableHost.querySelectorAll('tr[id^="log-soql-row-"]')
  );
}

function updateErrorSummaryAndNav() {
  if (!isOptimizedView() && lastParsed) {
    errorNavNodes = [];
    soqlNavNodes = [];
    const errN = lastParsed.summary?.errors ?? 0;
    const soqlN = lastParsed.summary?.soql ?? 0;
    sumErrors.textContent = String(errN);
    sumSoql.textContent = String(soqlN);
    if (pillErrorsBtn) {
      pillErrorsBtn.disabled = true;
      pillErrorsBtn.title =
        "Turn on Optimize log to jump between errors in the filtered table view.";
    }
    if (pillSoqlBtn) {
      pillSoqlBtn.disabled = true;
      pillSoqlBtn.title =
        "Turn on Optimize log to jump between SOQL lines in the filtered table view.";
    }
    if (errorNavFlyout) errorNavFlyout.hidden = true;
    if (soqlNavFlyout) soqlNavFlyout.hidden = true;
    errorNavIndex = 0;
    soqlNavIndex = 0;
    if (errorNavPosition) {
      errorNavPosition.textContent = "";
    }
    if (soqlNavPosition) {
      soqlNavPosition.textContent = "";
    }
    return;
  }
  if (pillErrorsBtn) {
    pillErrorsBtn.removeAttribute("title");
  }
  if (pillSoqlBtn) {
    pillSoqlBtn.removeAttribute("title");
  }
  errorNavNodes = collectErrorRowElements();
  soqlNavNodes = collectSoqlRowElements();
  sumErrors.textContent = String(errorNavNodes.length);
  sumSoql.textContent = String(soqlNavNodes.length);
  if (pillErrorsBtn) {
    pillErrorsBtn.disabled = errorNavNodes.length === 0;
  }
  if (pillSoqlBtn) {
    pillSoqlBtn.disabled = soqlNavNodes.length === 0;
  }
  if (errorNavFlyout) errorNavFlyout.hidden = true;
  if (soqlNavFlyout) soqlNavFlyout.hidden = true;
  errorNavIndex = 0;
  soqlNavIndex = 0;
  if (errorNavPosition) {
    errorNavPosition.textContent = "";
  }
  if (soqlNavPosition) {
    soqlNavPosition.textContent = "";
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

function updateSoqlNavLabel() {
  const n = soqlNavNodes.length;
  if (!soqlNavPosition) return;
  if (n === 0) {
    soqlNavPosition.textContent = "";
    return;
  }
  soqlNavPosition.textContent = `${soqlNavIndex + 1} / ${n}`;
}

function scrollToSoqlIndex(i) {
  if (i < 0 || i >= soqlNavNodes.length) return;
  const el = soqlNavNodes[i];
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  soqlNavIndex = i;
  updateSoqlNavLabel();
}

function applyFiltersAndRender() {
  if (!lastParsed) return;
  if (!isOptimizedView()) return;
  const filters = readFiltersFromUi();
  saveLogFilters(filters);
  const filtered = filterLogLines(lastParsed.lines, filters);
  logTableHost.innerHTML = renderLogTableHtml(filtered, {
    emphasizeExceptions: isExceptionsOnlyFilter(filters),
  });
  updateErrorSummaryAndNav();
}

function applyViewMode() {
  if (!lastParsed || !logMain) return;
  const optimized = isOptimizedView();
  persistOptimizeLogPreference(optimized);
  logMain.classList.toggle("log-main--optimized", optimized);
  logMain.classList.toggle("log-main--raw", !optimized);
  if (logFilters) {
    logFilters.hidden = !optimized;
  }
  if (!optimized) {
    if (errorNavFlyout) errorNavFlyout.hidden = true;
    if (soqlNavFlyout) soqlNavFlyout.hidden = true;
  }
  if (optimized) {
    applyFiltersAndRender();
  } else {
    logTableHost.innerHTML = renderFullRawLogHtml(lastParsed.lines);
    updateErrorSummaryAndNav();
  }
}

filterAll.addEventListener("change", () => {
  const on = filterAll.checked;
  filterDebug.checked = on;
  filterException.checked = on;
  filterQuery.checked = on;
  filterVariable.checked = on;
  filterAll.indeterminate = false;
  if (isOptimizedView()) {
    applyFiltersAndRender();
  } else {
    saveLogFilters(readFiltersFromUi());
  }
});

for (const id of CATEGORY_FILTER_IDS) {
  document.getElementById(id).addEventListener("change", () => {
    syncMasterCategoryCheckbox();
    if (isOptimizedView()) {
      applyFiltersAndRender();
    } else {
      saveLogFilters(readFiltersFromUi());
    }
  });
}

if (chkOptimizeLog) {
  chkOptimizeLog.addEventListener("change", () => applyViewMode());
}

pillErrorsBtn.addEventListener("click", () => {
  if (!isOptimizedView()) return;
  if (soqlNavFlyout) soqlNavFlyout.hidden = true;
  errorNavNodes = collectErrorRowElements();
  const n = errorNavNodes.length;
  sumErrors.textContent = String(n);
  if (n === 0) return;
  errorNavIndex = 0;
  scrollToErrorIndex(0);
  if (errorNavFlyout) {
    errorNavFlyout.hidden = n <= 1;
  }
});

if (pillSoqlBtn) {
  pillSoqlBtn.addEventListener("click", () => {
    if (!isOptimizedView()) return;
    if (errorNavFlyout) errorNavFlyout.hidden = true;
    soqlNavNodes = collectSoqlRowElements();
    const n = soqlNavNodes.length;
    sumSoql.textContent = String(n);
    if (n === 0) return;
    soqlNavIndex = 0;
    scrollToSoqlIndex(0);
    if (soqlNavFlyout) {
      soqlNavFlyout.hidden = n <= 1;
    }
  });
}

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

if (soqlNavPrev) {
  soqlNavPrev.addEventListener("click", () => {
    if (soqlNavNodes.length <= 1) return;
    const prev = (soqlNavIndex - 1 + soqlNavNodes.length) % soqlNavNodes.length;
    scrollToSoqlIndex(prev);
  });
}

if (soqlNavNext) {
  soqlNavNext.addEventListener("click", () => {
    if (soqlNavNodes.length <= 1) return;
    const next = (soqlNavIndex + 1) % soqlNavNodes.length;
    scrollToSoqlIndex(next);
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
  summary.hidden = false;

  applyFiltersToUi(loadLogFilters());
  const optimized = await loadOptimizeLogPreference();
  if (chkOptimizeLog) {
    chkOptimizeLog.checked = optimized;
  }
  applyViewMode();
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
