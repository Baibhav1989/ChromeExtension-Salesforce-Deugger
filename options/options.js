const logLimitEl = document.getElementById("logLimit");
const refreshSecondsEl = document.getElementById("refreshSeconds");
const traceDurationMinutesEl = document.getElementById("traceDurationMinutes");
const savedEl = document.getElementById("saved");
const dbgApexCode = document.getElementById("dbgApexCode");
const dbgApexProfiling = document.getElementById("dbgApexProfiling");
const dbgCallout = document.getElementById("dbgCallout");
const dbgDatabase = document.getElementById("dbgDatabase");
const dbgSystem = document.getElementById("dbgSystem");
const dbgValidation = document.getElementById("dbgValidation");
const dbgVisualforce = document.getElementById("dbgVisualforce");
const dbgWorkflow = document.getElementById("dbgWorkflow");

const DEFAULTS = { logLimit: 50, refreshSeconds: 15, traceDurationMinutes: 15 };
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

function logJsError(context, error) {
  const message = error?.stack || error?.message || String(error);
  console.log(`[SF Debugger][${context}] ${message}`, error);
}

window.addEventListener("error", (event) => {
  logJsError("options error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logJsError("options unhandled rejection", event.reason);
});

function showSaved() {
  savedEl.textContent = "Saved.";
  setTimeout(() => {
    savedEl.textContent = "";
  }, 1500);
}

function getDebugFields() {
  return [
    [dbgApexCode, "ApexCode"],
    [dbgApexProfiling, "ApexProfiling"],
    [dbgCallout, "Callout"],
    [dbgDatabase, "Database"],
    [dbgSystem, "System"],
    [dbgValidation, "Validation"],
    [dbgVisualforce, "Visualforce"],
    [dbgWorkflow, "Workflow"],
  ];
}

function initDebugLevelSelects() {
  for (const [el, key] of getDebugFields()) {
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

function readDebugLevelsFromUi() {
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

function applyDebugLevelsToUi(levels) {
  for (const [el, key] of getDebugFields()) {
    el.value = levels[key] || DEFAULT_DEBUG_LEVELS[key];
  }
}

initDebugLevelSelects();

chrome.storage.sync.get({ ...DEFAULTS, debugLevels: DEFAULT_DEBUG_LEVELS }, (cfg) => {
  logLimitEl.value = String(cfg.logLimit ?? DEFAULTS.logLimit);
  refreshSecondsEl.value = String(cfg.refreshSeconds ?? DEFAULTS.refreshSeconds);
  traceDurationMinutesEl.value = String(
    cfg.traceDurationMinutes ?? DEFAULTS.traceDurationMinutes
  );
  applyDebugLevelsToUi({ ...DEFAULT_DEBUG_LEVELS, ...(cfg.debugLevels || {}) });
});

function save() {
  const logLimit = Math.min(
    200,
    Math.max(1, Number(logLimitEl.value) || DEFAULTS.logLimit)
  );
  const refreshSeconds = Number(refreshSecondsEl.value);
  const traceDurationMinutes = Math.min(
    240,
    Math.max(5, Number(traceDurationMinutesEl.value) || DEFAULTS.traceDurationMinutes)
  );
  const debugLevels = readDebugLevelsFromUi();
  chrome.storage.sync.set(
    { logLimit, refreshSeconds, traceDurationMinutes, debugLevels },
    showSaved
  );
}

logLimitEl.addEventListener("change", save);
refreshSecondsEl.addEventListener("change", save);
traceDurationMinutesEl.addEventListener("change", save);
for (const [el] of getDebugFields()) {
  el.addEventListener("change", save);
}
