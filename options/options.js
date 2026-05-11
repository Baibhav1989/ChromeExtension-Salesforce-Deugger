import {
  SETTINGS_STORAGE_DEFAULTS,
  DEFAULT_DEBUG_LEVELS,
  initAllDebugLevelSelects,
  readDebugLevelsFromSelects,
  applyDebugLevelsToSelects,
  clampLogLimit,
  clampTraceMinutes,
  normalizeOpenMode,
  normalizeAiProvider,
  sanitizeAiText,
} from "../lib/extension-settings.js";

const logLimitEl = document.getElementById("logLimit");
const refreshSecondsEl = document.getElementById("refreshSeconds");
const traceDurationMinutesEl = document.getElementById("traceDurationMinutes");
const openModeTabEl = document.getElementById("openModeTab");
const savedEl = document.getElementById("saved");
const dbgApexCode = document.getElementById("dbgApexCode");
const dbgApexProfiling = document.getElementById("dbgApexProfiling");
const dbgCallout = document.getElementById("dbgCallout");
const dbgDatabase = document.getElementById("dbgDatabase");
const dbgSystem = document.getElementById("dbgSystem");
const dbgValidation = document.getElementById("dbgValidation");
const dbgVisualforce = document.getElementById("dbgVisualforce");
const dbgWorkflow = document.getElementById("dbgWorkflow");
const aiProviderEl = document.getElementById("aiProvider");
const aiModelEl = document.getElementById("aiModel");
const aiApiKeyEl = document.getElementById("aiApiKey");
const aiEndpointEl = document.getElementById("aiEndpoint");
const aiAgentforceOrgUrlEl = document.getElementById("aiAgentforceOrgUrl");
const aiModelField = document.getElementById("aiModelField");
const aiApiKeyField = document.getElementById("aiApiKeyField");
const aiEndpointField = document.getElementById("aiEndpointField");
const aiAgentforceOrgField = document.getElementById("aiAgentforceOrgField");
const aiProviderNote = document.getElementById("aiProviderNote");

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

function updateAiSettingsVisibility() {
  const provider = normalizeAiProvider(aiProviderEl?.value);
  const isNano = provider === "gemini-nano";
  const isGeminiApi = provider === "gemini-api";
  const isOpenAiCompat = provider === "openai-compatible";
  const isAgentforce = provider === "agentforce";

  if (aiModelField) aiModelField.hidden = isNano;
  if (aiApiKeyField) aiApiKeyField.hidden = isNano;
  if (aiEndpointField) aiEndpointField.hidden = !(isOpenAiCompat || isAgentforce);
  if (aiAgentforceOrgField) aiAgentforceOrgField.hidden = !isAgentforce;

  if (!aiProviderNote) return;
  if (isNano) {
    aiProviderNote.textContent =
      "Gemini Nano runs on-device when available. If unavailable in your browser/device, switch provider.";
    return;
  }
  if (isGeminiApi) {
    aiProviderNote.textContent =
      "Gemini API mode uses your Google API key and selected model.";
    return;
  }
  if (isAgentforce) {
    aiProviderNote.textContent =
      "Agentforce mode uses your custom endpoint, model/deployment, token, and optional org URL.";
    return;
  }
  aiProviderNote.textContent =
    "OpenAI-compatible mode sends chat-completion requests to your configured endpoint.";
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
    if (openModeTabEl) {
      openModeTabEl.checked = normalizeOpenMode(cfg.openMode) === "tab";
    }
    if (aiProviderEl) {
      aiProviderEl.value = normalizeAiProvider(cfg.aiProvider);
    }
    if (aiModelEl) {
      aiModelEl.value = sanitizeAiText(cfg.aiModel, SETTINGS_STORAGE_DEFAULTS.aiModel);
    }
    if (aiApiKeyEl) {
      aiApiKeyEl.value = sanitizeAiText(cfg.aiApiKey);
    }
    if (aiEndpointEl) {
      aiEndpointEl.value = sanitizeAiText(cfg.aiEndpoint);
    }
    if (aiAgentforceOrgUrlEl) {
      aiAgentforceOrgUrlEl.value = sanitizeAiText(cfg.aiAgentforceOrgUrl);
    }
    applyDebugLevelsToSelects(getDebugFields(), cfg.debugLevels);
    updateAiSettingsVisibility();
  }
);

function save() {
  const logLimit = clampLogLimit(logLimitEl?.value);
  const refreshSeconds = Number(refreshSecondsEl?.value);
  const traceDurationMinutes = clampTraceMinutes(traceDurationMinutesEl?.value);
  const openMode = openModeTabEl?.checked ? "tab" : "popup";
  const debugLevels = readDebugLevelsFromSelects(getDebugFields());
  const aiProvider = normalizeAiProvider(aiProviderEl?.value);
  const aiModel = sanitizeAiText(aiModelEl?.value, SETTINGS_STORAGE_DEFAULTS.aiModel);
  const aiApiKey = sanitizeAiText(aiApiKeyEl?.value);
  const aiEndpoint = sanitizeAiText(aiEndpointEl?.value);
  const aiAgentforceOrgUrl = sanitizeAiText(aiAgentforceOrgUrlEl?.value);
  chrome.storage.sync.set(
    {
      logLimit,
      refreshSeconds: Number.isFinite(refreshSeconds)
        ? refreshSeconds
        : SETTINGS_STORAGE_DEFAULTS.refreshSeconds,
      traceDurationMinutes,
      openMode,
      debugLevels,
      aiProvider,
      aiModel,
      aiApiKey,
      aiEndpoint,
      aiAgentforceOrgUrl,
    },
    showSaved
  );
}

logLimitEl?.addEventListener("change", save);
refreshSecondsEl?.addEventListener("change", save);
traceDurationMinutesEl?.addEventListener("change", save);
openModeTabEl?.addEventListener("change", save);
aiProviderEl?.addEventListener("change", () => {
  updateAiSettingsVisibility();
  save();
});
aiModelEl?.addEventListener("change", save);
aiApiKeyEl?.addEventListener("change", save);
aiEndpointEl?.addEventListener("change", save);
aiAgentforceOrgUrlEl?.addEventListener("change", save);
for (const [el] of getDebugFields()) {
  el?.addEventListener("change", save);
}
