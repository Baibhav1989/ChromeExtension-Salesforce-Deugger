import {
  filterLogLines,
  isExceptionsOnlyFilter,
  loadLogFilters,
  parseDebugLog,
  renderFullRawLogHtml,
  renderLogTableHtml,
  saveLogFilters,
} from "../lib/log-formatter.js";
import {
  SETTINGS_STORAGE_DEFAULTS,
  normalizeAiProvider,
  sanitizeAiText,
} from "../lib/extension-settings.js";

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
const btnAnalyzeAi = document.getElementById("btnAnalyzeAi");
const btnClose = document.getElementById("btnClose");
const aiAnalysisPanel = document.getElementById("aiAnalysisPanel");
const aiAnalysisStatus = document.getElementById("aiAnalysisStatus");
const aiAnalysisResult = document.getElementById("aiAnalysisResult");
const aiAnalysisMeta = document.getElementById("aiAnalysisMeta");
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
let lastAiResult = "";

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

function syncDetailsPageLayoutFlags() {
  const optimized = isOptimizedView();
  document.body.classList.toggle("details-page--optimized", optimized);
  document.body.classList.toggle("details-page--raw", !optimized);
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
  syncDetailsPageLayoutFlags();
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

function setAiPanelState(statusText, resultText = "", metaText = "") {
  if (!aiAnalysisPanel || !aiAnalysisStatus || !aiAnalysisResult || !aiAnalysisMeta) return;
  aiAnalysisPanel.hidden = false;
  aiAnalysisStatus.textContent = statusText || "";
  aiAnalysisMeta.textContent = metaText || "";
  aiAnalysisResult.textContent = resultText || "";
}

async function readAiSettings() {
  const cfg = await chrome.storage.sync.get(SETTINGS_STORAGE_DEFAULTS);
  return {
    provider: normalizeAiProvider(cfg.aiProvider),
    model: sanitizeAiText(cfg.aiModel, SETTINGS_STORAGE_DEFAULTS.aiModel),
    apiKey: sanitizeAiText(cfg.aiApiKey),
    endpoint: sanitizeAiText(cfg.aiEndpoint),
    agentforceOrgUrl: sanitizeAiText(cfg.aiAgentforceOrgUrl),
  };
}

function trimLogForPrompt(text) {
  const maxChars = 22000;
  if (text.length <= maxChars) return text;
  const head = text.slice(0, 16000);
  const tail = text.slice(-5000);
  return `${head}\n\n...[truncated ${text.length - maxChars} chars]...\n\n${tail}`;
}

function buildAiPrompt(logText) {
  const lines = logText.split(/\r?\n/).length;
  const summary = lastParsed?.summary || {};
  return [
    "You are a senior Salesforce Apex debugging assistant.",
    "Analyze the log and respond in plain text with these sections:",
    "1) Executive summary",
    "2) Primary error/root cause",
    "3) SOQL and governor-risk observations",
    "4) Concrete fix steps",
    "5) Validation checklist",
    "",
    `Log metadata: totalLines=${lines}, parsedErrors=${summary.errors ?? "unknown"}, parsedSoql=${summary.soql ?? "unknown"}`,
    "",
    "Debug log:",
    trimLogForPrompt(logText),
  ].join("\n");
}

function getDefaultModelForProvider(provider) {
  if (provider === "gemini-api") return "gemini-2.0-flash-lite";
  if (provider === "openai-codex") return "gpt-4.1-mini";
  if (provider === "claude-ai") return "claude-3-5-sonnet-latest";
  return "";
}

function resolveProviderEndpoint(provider, settings) {
  const explicit = sanitizeAiText(settings.endpoint);
  if (explicit) return explicit;
  if (provider === "openai-codex") {
    return "https://api.openai.com/v1/chat/completions";
  }
  if (provider === "anthropic-claude") {
    return "https://api.anthropic.com/v1/messages";
  }
  if (provider === "claude-ai") {
    return "https://api.anthropic.com/v1/messages";
  }
  if (
    (provider === "salesforce-einstein-llm" ||
      provider === "salesforce-models-api" ||
      provider === "agentforce-agent") &&
    settings.agentforceOrgUrl
  ) {
    return `${settings.agentforceOrgUrl.replace(
      /\/+$/,
      ""
    )}/services/data/v61.0/einstein/ai/chat/completions`;
  }
  return "";
}

function extractAiTextFromResponse(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data?.candidates)) {
    const parts = data.candidates
      .flatMap((c) => c?.content?.parts || [])
      .map((p) => p?.text)
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  if (Array.isArray(data?.choices) && data.choices[0]?.message?.content) {
    const content = data.choices[0].message.content;
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part === "string" ? part : part?.text || ""))
        .filter(Boolean)
        .join("\n");
    }
    return String(content);
  }
  if (typeof data?.output_text === "string" && data.output_text) {
    return data.output_text;
  }
  if (Array.isArray(data?.content)) {
    const text = data.content
      .map((part) => part?.text || "")
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  return "";
}

async function ensureEndpointPermission(endpointUrl) {
  if (!chrome.permissions?.contains || !chrome.permissions?.request) return;
  let originPattern;
  try {
    const u = new URL(endpointUrl);
    if (!/^https?:$/.test(u.protocol)) {
      throw new Error("Endpoint must start with http:// or https://");
    }
    originPattern = `${u.protocol}//${u.hostname}/*`;
  } catch (error) {
    throw new Error(`Invalid endpoint URL: ${error?.message || String(error)}`);
  }
  const alreadyAllowed = await chrome.permissions.contains({ origins: [originPattern] });
  if (alreadyAllowed) return;
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) {
    throw new Error(`Permission denied for ${originPattern}. Enable access to use this provider.`);
  }
}

async function analyzeWithGeminiNano(prompt, onStatus) {
  if (typeof globalThis.LanguageModel !== "undefined") {
    let availability = "unknown";
    try {
      availability = await globalThis.LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      });
    } catch (error) {
      logJsError("LanguageModel.availability", error);
    }
    if (availability === "unavailable") {
      throw new Error(
        "Gemini Nano is unavailable in this Chrome profile/device. Check chrome://on-device-internals and Chrome built-in AI requirements."
      );
    }
    if (availability === "downloadable" || availability === "downloading") {
      onStatus?.("Preparing Gemini Nano model (downloading if needed)...");
    }
    const session = await globalThis.LanguageModel.create({
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const pct = Number(event.loaded) * 100;
          const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
          onStatus?.(`Downloading Gemini Nano model… ${safePct.toFixed(0)}%`);
        });
      },
    });
    try {
      const result = await session.prompt(prompt);
      return String(result || "").trim();
    } finally {
      if (typeof session.destroy === "function") {
        await session.destroy();
      }
    }
  }
  if (window.ai?.languageModel?.create) {
    const session = await window.ai.languageModel.create({
      temperature: 0.2,
      topK: 4,
    });
    try {
      const result = await session.prompt(prompt);
      return String(result || "").trim();
    } finally {
      if (typeof session.destroy === "function") {
        await session.destroy();
      }
    }
  }
  if (window.ai?.assistant?.create) {
    const assistant = await window.ai.assistant.create();
    const response = await assistant.prompt(prompt);
    if (typeof assistant.destroy === "function") {
      await assistant.destroy();
    }
    return String(response || "").trim();
  }
  throw new Error(
    "Gemini Nano API is not detected in this context. Update Chrome and ensure built-in AI is enabled and supported by your device."
  );
}

async function analyzeWithGeminiApi(prompt, settings) {
  if (!settings.apiKey) {
    throw new Error("Gemini API key missing. Add it in extension settings.");
  }
  const model = settings.model || "gemini-2.0-flash-lite";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  await ensureEndpointPermission(endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  const text = extractAiTextFromResponse(data);
  if (!text) throw new Error("Gemini API returned an empty response.");
  return text.trim();
}

async function analyzeWithAnthropic(prompt, settings) {
  const endpoint = resolveProviderEndpoint("claude-ai", settings);
  if (!endpoint) {
    throw new Error("Endpoint URL missing. Configure endpoint in settings.");
  }
  if (!settings.apiKey) {
    throw new Error("API key/token missing. Add it in settings.");
  }
  if (!settings.model) {
    throw new Error("Model name missing. Set a Claude model in settings.");
  }
  await ensureEndpointPermission(endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  const text = Array.isArray(data?.content)
    ? data.content
        .map((part) => (part?.type === "text" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
    : "";
  if (!text) throw new Error("Anthropic API returned no text.");
  return text.trim();
}

async function analyzeWithOpenAiCompatible(prompt, settings, provider) {
  const endpoint = resolveProviderEndpoint(provider, settings);
  if (!endpoint) {
    if (provider === "cursor-ai") {
      throw new Error("Cursor AI endpoint is missing. Set endpoint + token in settings.");
    }
    throw new Error("Endpoint URL missing. Configure endpoint in settings.");
  }
  if (!settings.apiKey) {
    throw new Error("API key/token missing. Add it in settings.");
  }
  await ensureEndpointPermission(endpoint);
  const modelName = settings.model || getDefaultModelForProvider(provider) || undefined;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a Salesforce Apex debug log analysis assistant.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  const text = extractAiTextFromResponse(data);
  if (!text) throw new Error("The configured AI endpoint returned no text.");
  return text.trim();
}

async function runAiAnalysis() {
  if (!rawText) {
    setAiPanelState("Load the log first, then run analysis.");
    return;
  }
  const settings = await readAiSettings();
  settings.model = sanitizeAiText(
    settings.model,
    getDefaultModelForProvider(settings.provider)
  );
  const providerLabel =
    {
      "gemini-nano": "Chrome Built-in AI (Gemini Nano)",
      "gemini-api": "Gemini API (legacy)",
      "cursor-ai": "Cursor AI",
      "claude-ai": "Claude AI",
      "openai-codex": "OpenAI Codex / ChatGPT",
      "salesforce-einstein-llm": "Salesforce Einstein LLM Generations",
      "salesforce-models-api": "Salesforce Models REST API",
      "agentforce-agent": "Agentforce Agent",
    }[settings.provider] || "Configured provider";
  const modelLabel =
    settings.provider === "gemini-nano" ? "On-device model" : settings.model || "Configured model";

  const prompt = buildAiPrompt(rawText);
  setAiPanelState("Analyzing log with AI...", "", `${providerLabel} · ${modelLabel}`);
  if (btnAnalyzeAi) {
    btnAnalyzeAi.disabled = true;
    btnAnalyzeAi.textContent = "Analyzing…";
  }

  try {
    let responseText = "";
    if (settings.provider === "gemini-nano") {
      responseText = await analyzeWithGeminiNano(prompt, (statusMessage) => {
        setAiPanelState(statusMessage, "", `${providerLabel} · ${modelLabel}`);
      });
    } else if (settings.provider === "gemini-api") {
      responseText = await analyzeWithGeminiApi(prompt, settings);
    } else if (settings.provider === "claude-ai") {
      responseText = await analyzeWithAnthropic(prompt, settings);
    } else {
      responseText = await analyzeWithOpenAiCompatible(prompt, settings, settings.provider);
    }
    lastAiResult = responseText;
    setAiPanelState("Analysis complete.", responseText, `${providerLabel} · ${modelLabel}`);
  } catch (error) {
    logJsError("runAiAnalysis", error);
    setAiPanelState(
      `Analysis failed: ${error?.message || String(error)}`,
      lastAiResult,
      `${providerLabel} · ${modelLabel}`
    );
  } finally {
    if (btnAnalyzeAi) {
      btnAnalyzeAi.disabled = false;
      btnAnalyzeAi.textContent = "Analyze with AI";
    }
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
  if (aiAnalysisPanel) {
    aiAnalysisPanel.hidden = true;
  }
  lastAiResult = "";

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

if (btnAnalyzeAi) {
  btnAnalyzeAi.addEventListener("click", () => {
    runAiAnalysis();
  });
}

btnClose.addEventListener("click", (e) => {
  e.preventDefault();
  window.close();
});

fetchLog();
