import { resolveSession } from "./sf-session.js";
import {
  createTraceFlag,
  getApexLogBody,
  getOrCreateDebugLevel,
  getTraceFlagStatus,
  listActiveUsers,
  listApexLogs,
  searchUsers,
} from "./sf-api.js";

const DEFAULTS = { logLimit: 50, refreshSeconds: 15, traceDurationMinutes: 15 };

function logJsError(context, error) {
  const message = error?.stack || error?.message || String(error);
  console.log(`[SF Debugger][${context}] ${message}`, error);
}

self.addEventListener("error", (event) => {
  logJsError("service-worker error", event.error || event.message);
});

self.addEventListener("unhandledrejection", (event) => {
  logJsError("service-worker unhandled rejection", event.reason);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    chrome.storage.sync.set({ ...DEFAULTS, ...stored });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LIST_LOGS") {
    handleListLogs(message.tabId, message.logUserId)
      .then(sendResponse)
      .catch((e) => {
        logJsError("LIST_LOGS", e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      });
    return true;
  }
  if (message?.type === "LIST_ACTIVE_USERS") {
    handleListActiveUsers(message.tabId)
      .then(sendResponse)
      .catch((e) => {
        logJsError("LIST_ACTIVE_USERS", e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      });
    return true;
  }
  if (message?.type === "SEARCH_USERS") {
    handleSearchUsers(message.tabId, message.query, message.limit)
      .then(sendResponse)
      .catch((e) => {
        logJsError("SEARCH_USERS", e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      });
    return true;
  }
  if (message?.type === "GET_TRACE_FLAG_STATUS") {
    handleGetTraceFlagStatus(message.tabId, message.userId)
      .then(sendResponse)
      .catch((e) => {
        logJsError("GET_TRACE_FLAG_STATUS", e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      });
    return true;
  }
  if (message?.type === "SET_TRACE_FLAG") {
    handleSetTraceFlag(
      message.tabId,
      message.userId,
      message.durationMinutes,
      message.debugLevels
    )
      .then(sendResponse)
      .catch((e) => {
        logJsError("SET_TRACE_FLAG", e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      });
    return true;
  }
  if (message?.type === "GET_LOG_BODY") {
    handleGetLogBody(message.tabId, message.logId)
      .then(sendResponse)
      .catch((e) => {
        logJsError("GET_LOG_BODY", e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      });
    return true;
  }
  return false;
});

async function getActiveSalesforceTabId(preferredTabId) {
  if (preferredTabId != null) {
    const t = await chrome.tabs.get(preferredTabId).catch(() => null);
    if (t?.url && isSalesforceUrl(t.url)) return { tabId: t.id, url: t.url };
  }
  const stored = await chrome.storage.session.get("sfTabId");
  if (stored.sfTabId != null) {
    const t = await chrome.tabs.get(stored.sfTabId).catch(() => null);
    if (t?.url && isSalesforceUrl(t.url)) return { tabId: t.id, url: t.url };
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.url && isSalesforceUrl(active.url)) {
    return { tabId: active.id, url: active.url };
  }
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const sf = tabs.find((x) => x.url && isSalesforceUrl(x.url));
  if (sf?.url) return { tabId: sf.id, url: sf.url };
  const all = await chrome.tabs.query({});
  const any = all.find((x) => x.url && isSalesforceUrl(x.url));
  if (any?.url) return { tabId: any.id, url: any.url };
  return { tabId: null, url: null };
}

function isSalesforceUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes("salesforce.com") ||
      h.includes("force.com") ||
      h.includes("salesforce-setup.com")
    );
  } catch {
    return false;
  }
}

async function resolveSessionFromActiveTab(tabId) {
  const { tabId: tid, url } = await getActiveSalesforceTabId(tabId);
  if (!url) {
    return { ok: false, error: "No tab URL available. Open a Salesforce tab first." };
  }
  if (tid != null) {
    await chrome.storage.session.set({ sfTabId: tid });
  }

  const session = await resolveSession(url);
  if ("error" in session) return { ok: false, error: session.error };
  return { ok: true, session };
}

async function handleListLogs(tabId, logUserId) {
  const resolved = await resolveSessionFromActiveTab(tabId);
  if (!resolved.ok) return resolved;

  const { logLimit } = await chrome.storage.sync.get(DEFAULTS);
  const data = await listApexLogs(
    resolved.session.apiBase,
    resolved.session.sessionId,
    logLimit,
    logUserId || null
  );
  const records = data.records || [];

  return {
    ok: true,
    apiBase: resolved.session.apiBase,
    records: records.map((r) => ({
      id: r.Id,
      application: r.Application,
      durationMs: r.DurationMilliseconds,
      location: r.Location,
      logLength: r.LogLength,
      logUserId: r.LogUserId,
      logUserName: r.LogUser?.Name || null,
      operation: r.Operation,
      request: r.Request,
      status: r.Status,
      startTime: r.StartTime,
    })),
  };
}

async function handleListActiveUsers(tabId) {
  const resolved = await resolveSessionFromActiveTab(tabId);
  if (!resolved.ok) return resolved;

  const data = await listActiveUsers(resolved.session.apiBase, resolved.session.sessionId);
  const users = (data.records || []).map((u) => ({
    id: u.Id,
    name: u.Name || u.Username || u.Id,
    username: u.Username || "",
    userType: u.UserType || "",
    isAutomatedProcess: String(u.Name || "").toLowerCase() === "automated process",
  }));
  users.sort((a, b) => {
    if (a.isAutomatedProcess && !b.isAutomatedProcess) return -1;
    if (!a.isAutomatedProcess && b.isAutomatedProcess) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return { ok: true, users };
}

async function handleSearchUsers(tabId, query, limit) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < 3) return { ok: true, users: [] };
  const resolved = await resolveSessionFromActiveTab(tabId);
  if (!resolved.ok) return resolved;
  const data = await searchUsers(
    resolved.session.apiBase,
    resolved.session.sessionId,
    trimmed,
    limit
  );
  const users = (data.records || []).map((u) => ({
    id: u.Id,
    name: u.Name || u.Username || u.Id,
    username: u.Username || "",
    userType: u.UserType || "",
    isAutomatedProcess: String(u.Name || "").toLowerCase() === "automated process",
  }));
  users.sort((a, b) => {
    if (a.isAutomatedProcess && !b.isAutomatedProcess) return -1;
    if (!a.isAutomatedProcess && b.isAutomatedProcess) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return { ok: true, users };
}

async function handleGetTraceFlagStatus(tabId, userId) {
  if (!userId) return { ok: false, error: "Missing user id." };
  const resolved = await resolveSessionFromActiveTab(tabId);
  if (!resolved.ok) return resolved;
  const status = await getTraceFlagStatus(
    resolved.session.apiBase,
    resolved.session.sessionId,
    userId
  );
  return {
    ok: true,
    active: Boolean(status.active),
    expirationDate: status.traceFlag?.ExpirationDate || null,
    expiredAt: status.expiredTraceFlag?.ExpirationDate || null,
  };
}

async function handleSetTraceFlag(tabId, userId, durationMinutes, debugLevels) {
  if (!userId) return { ok: false, error: "Missing user id." };
  const safeDuration = Math.min(Math.max(Number(durationMinutes) || 15, 5), 240);
  const resolved = await resolveSessionFromActiveTab(tabId);
  if (!resolved.ok) return resolved;
  const { apiBase, sessionId } = resolved.session;

  const status = await getTraceFlagStatus(apiBase, sessionId, userId);
  if (status.active && status.traceFlag?.ExpirationDate) {
    return {
      ok: true,
      created: false,
      alreadyActive: true,
      expirationDate: status.traceFlag.ExpirationDate,
    };
  }

  const debugLevelId = await getOrCreateDebugLevel(apiBase, sessionId, debugLevels || {});
  if (!debugLevelId) {
    return { ok: false, error: "Failed to resolve a Debug Level for Trace Flag." };
  }
  const created = await createTraceFlag(
    apiBase,
    sessionId,
    userId,
    debugLevelId,
    safeDuration
  );

  const freshStatus = await getTraceFlagStatus(apiBase, sessionId, userId);
  return {
    ok: true,
    created: Boolean(created?.id),
    traceFlagId: created?.id || null,
    alreadyActive: false,
    expirationDate: freshStatus.traceFlag?.ExpirationDate || null,
  };
}

async function handleGetLogBody(tabId, logId) {
  const resolved = await resolveSessionFromActiveTab(tabId);
  if (!resolved.ok) return resolved;
  if (!logId) return { ok: false, error: "Missing log id." };

  const body = await getApexLogBody(
    resolved.session.apiBase,
    resolved.session.sessionId,
    logId
  );
  return { ok: true, body, logId };
}
