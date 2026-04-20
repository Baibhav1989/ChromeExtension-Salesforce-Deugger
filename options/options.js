const logLimitEl = document.getElementById("logLimit");
const refreshSecondsEl = document.getElementById("refreshSeconds");
const savedEl = document.getElementById("saved");

const DEFAULTS = { logLimit: 50, refreshSeconds: 15 };

function showSaved() {
  savedEl.textContent = "Saved.";
  setTimeout(() => {
    savedEl.textContent = "";
  }, 1500);
}

chrome.storage.sync.get(DEFAULTS, (cfg) => {
  logLimitEl.value = String(cfg.logLimit ?? DEFAULTS.logLimit);
  refreshSecondsEl.value = String(cfg.refreshSeconds ?? DEFAULTS.refreshSeconds);
});

function save() {
  const logLimit = Math.min(
    200,
    Math.max(1, Number(logLimitEl.value) || DEFAULTS.logLimit)
  );
  const refreshSeconds = Number(refreshSecondsEl.value);
  chrome.storage.sync.set({ logLimit, refreshSeconds }, showSaved);
}

logLimitEl.addEventListener("change", save);
refreshSecondsEl.addEventListener("change", save);
