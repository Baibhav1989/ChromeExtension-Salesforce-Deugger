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
  const isCursor = provider === "cursor-ai";
  const isClaude = provider === "claude-ai";
  const isOpenAi = provider === "openai-codex";
  const isGeminiApi = provider === "gemini-api";
  const isSalesforceManaged =
    provider === "salesforce-einstein-llm" ||
    provider === "salesforce-models-api" ||
    provider === "agentforce-agent";

  if (aiModelField) aiModelField.hidden = isNano;
  if (aiApiKeyField) aiApiKeyField.hidden = isNano;
  if (aiEndpointField) aiEndpointField.hidden = isNano || isGeminiApi;
  if (aiAgentforceOrgField) aiAgentforceOrgField.hidden = !isSalesforceManaged;

  if (aiEndpointEl) {
    if (isOpenAi) {
      aiEndpointEl.placeholder = "https://api.openai.com/v1/chat/completions";
    } else if (isClaude) {
      aiEndpointEl.placeholder = "https://api.anthropic.com/v1/messages";
    } else if (isCursor) {
      aiEndpointEl.placeholder = "https://your-cursor-proxy.example.com/v1/chat/completions";
    } else if (isSalesforceManaged) {
      aiEndpointEl.placeholder =
        "https://your-org.my.salesforce.com/services/data/v61.0/einstein/ai/chat/completions";
    } else {
      aiEndpointEl.placeholder = "https://api.example.com/v1/chat/completions";
    }
  }

  if (aiModelEl) {
    if (isOpenAi) {
      aiModelEl.placeholder = "gpt-4.1-mini";
    } else if (isClaude) {
      aiModelEl.placeholder = "claude-3-5-sonnet-latest";
    } else if (isCursor) {
      aiModelEl.placeholder = "cursor-default or your deployed model";
    } else if (isSalesforceManaged) {
      aiModelEl.placeholder = "Model/deployment or agent name";
    } else if (isGeminiApi) {
      aiModelEl.placeholder = "gemini-2.0-flash-lite";
    } else {
      aiModelEl.placeholder = "Model or deployment";
    }
  }

  if (!aiProviderNote) return;
  if (isNano) {
    aiProviderNote.textContent =
      "Uses Chrome Prompt API (`LanguageModel`) on-device. If unavailable, Chrome version/hardware requirements may not be met.";
    return;
  }
  if (isOpenAi) {
    aiProviderNote.textContent =
      "Uses OpenAI Chat Completions API with your API key.";
    return;
  }
  if (isClaude) {
    aiProviderNote.textContent =
      "Uses Anthropic Messages API with your Claude API key.";
    return;
  }
  if (isCursor) {
    aiProviderNote.textContent =
      "Cursor AI mode expects your token + endpoint (for proxy/gateway setups).";
    return;
  }
  if (isSalesforceManaged) {
    aiProviderNote.textContent =
      "Org-managed Salesforce mode. Configure org URL and/or endpoint plus a valid org token.";
    return;
  }
  if (isGeminiApi) {
    aiProviderNote.textContent =
      "Legacy Gemini API mode: provide model and Google API key.";
    return;
  }
  aiProviderNote.textContent =
    "Configure provider credentials and endpoint to run AI analysis.";
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
