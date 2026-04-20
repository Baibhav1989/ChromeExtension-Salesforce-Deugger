import {
  SETTINGS_STORAGE_DEFAULTS,
  DEFAULT_DEBUG_LEVELS,
  initAllDebugLevelSelects,
  readDebugLevelsFromSelects,
  applyDebugLevelsToSelects,
  clampLogLimit,
  clampTraceMinutes,
} from "../lib/extension-settings.js";

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
  if (!savedEl) return;
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

initAllDebugLevelSelects(getDebugFields());

chrome.storage.sync.get(
  { ...SETTINGS_STORAGE_DEFAULTS, debugLevels: DEFAULT_DEBUG_LEVELS },
  (cfg) => {
    if (logLimitEl) logLimitEl.value = String(clampLogLimit(cfg.logLimit));
    if (refreshSecondsEl) {
      const v = String(cfg.refreshSeconds ?? SETTINGS_STORAGE_DEFAULTS.refreshSeconds);
      const ok = [...refreshSecondsEl.options].some((o) => o.value === v);
      refreshSecondsEl.value = ok ? v : String(SETTINGS_STORAGE_DEFAULTS.refreshSeconds);
    }
    if (traceDurationMinutesEl) {
      const v = String(
        cfg.traceDurationMinutes ?? SETTINGS_STORAGE_DEFAULTS.traceDurationMinutes
      );
      const ok = [...traceDurationMinutesEl.options].some((o) => o.value === v);
      traceDurationMinutesEl.value = ok ? v : "15";
    }
    applyDebugLevelsToSelects(getDebugFields(), cfg.debugLevels);
  }
);

function save() {
  const logLimit = clampLogLimit(logLimitEl?.value);
  const refreshSeconds = Number(refreshSecondsEl?.value);
  const traceDurationMinutes = clampTraceMinutes(traceDurationMinutesEl?.value);
  const debugLevels = readDebugLevelsFromSelects(getDebugFields());
  chrome.storage.sync.set(
    {
      logLimit,
      refreshSeconds: Number.isFinite(refreshSeconds)
        ? refreshSeconds
        : SETTINGS_STORAGE_DEFAULTS.refreshSeconds,
      traceDurationMinutes,
      debugLevels,
    },
    showSaved
  );
}

logLimitEl?.addEventListener("change", save);
refreshSecondsEl?.addEventListener("change", save);
traceDurationMinutesEl?.addEventListener("change", save);
for (const [el] of getDebugFields()) {
  el?.addEventListener("change", save);
}
