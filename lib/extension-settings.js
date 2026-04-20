/** Shared defaults and helpers for extension settings (popup overlay + options page). */

export const SETTINGS_STORAGE_DEFAULTS = {
  logLimit: 50,
  refreshSeconds: 15,
  traceDurationMinutes: 15,
};

export const DEBUG_LEVEL_VALUES = [
  "NONE",
  "ERROR",
  "WARN",
  "INFO",
  "DEBUG",
  "FINE",
  "FINER",
  "FINEST",
];

export const DEFAULT_DEBUG_LEVELS = {
  ApexCode: "DEBUG",
  ApexProfiling: "INFO",
  Callout: "INFO",
  Database: "INFO",
  System: "DEBUG",
  Validation: "INFO",
  Visualforce: "INFO",
  Workflow: "INFO",
};

/**
 * @param {HTMLSelectElement | null} selectEl
 * @param {keyof typeof DEFAULT_DEBUG_LEVELS} key
 */
export function initDebugLevelSelect(selectEl, key) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  for (const level of DEBUG_LEVEL_VALUES) {
    const opt = document.createElement("option");
    opt.value = level;
    opt.textContent = level;
    if (DEFAULT_DEBUG_LEVELS[key] === level) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

/**
 * @param {Array<[HTMLElement | null, keyof typeof DEFAULT_DEBUG_LEVELS]>} fieldPairs
 */
export function initAllDebugLevelSelects(fieldPairs) {
  for (const [el, key] of fieldPairs) {
    initDebugLevelSelect(el, key);
  }
}

/**
 * @param {Array<[HTMLElement | null, keyof typeof DEFAULT_DEBUG_LEVELS]>} fieldPairs
 */
export function readDebugLevelsFromSelects(fieldPairs) {
  const o = { ...DEFAULT_DEBUG_LEVELS };
  for (const [el, key] of fieldPairs) {
    if (el?.value) o[key] = el.value;
  }
  return o;
}

/**
 * @param {Array<[HTMLElement | null, keyof typeof DEFAULT_DEBUG_LEVELS]>} fieldPairs
 * @param {Partial<typeof DEFAULT_DEBUG_LEVELS> | undefined} levels
 */
export function applyDebugLevelsToSelects(fieldPairs, levels) {
  const merged = { ...DEFAULT_DEBUG_LEVELS, ...(levels || {}) };
  for (const [el, key] of fieldPairs) {
    if (el) el.value = merged[key] || DEFAULT_DEBUG_LEVELS[key];
  }
}

export function clampLogLimit(raw) {
  return Math.min(
    200,
    Math.max(1, Number(raw) || SETTINGS_STORAGE_DEFAULTS.logLimit)
  );
}

export function clampTraceMinutes(raw) {
  return Math.min(
    240,
    Math.max(5, Number(raw) || SETTINGS_STORAGE_DEFAULTS.traceDurationMinutes)
  );
}
