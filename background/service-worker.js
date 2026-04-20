import { resolveSession } from "./sf-session.js";
import { getApexLogBody, listApexLogs } from "./sf-api.js";

const DEFAULTS = { logLimit: 50, refreshSeconds: 15 };

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    chrome.storage.sync.set({ ...DEFAULTS, ...stored });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LIST_LOGS") {
    handleListLogs(message.tabId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
    return true;
  }
  if (message?.type === "GET_LOG_BODY") {
    handleGetLogBody(message.tabId, message.logId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
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

async function handleListLogs(tabId) {
  const { tabId: tid, url } = await getActiveSalesforceTabId(tabId);
  if (!url) {
    return { ok: false, error: "No tab URL available. Open a Salesforce tab first." };
  }
  if (tid != null) {
    await chrome.storage.session.set({ sfTabId: tid });
  }

  const session = await resolveSession(url);
  if ("error" in session) return { ok: false, error: session.error };

  const { logLimit } = await chrome.storage.sync.get(DEFAULTS);
  const data = await listApexLogs(session.apiBase, session.sessionId, logLimit);
  const records = data.records || [];

  return {
    ok: true,
    apiBase: session.apiBase,
    records: records.map((r) => ({
      id: r.Id,
      application: r.Application,
      durationMs: r.DurationMilliseconds,
      location: r.Location,
      logLength: r.LogLength,
      logUserId: r.LogUserId,
      operation: r.Operation,
      request: r.Request,
      status: r.Status,
      startTime: r.StartTime,
    })),
  };
}

async function handleGetLogBody(tabId, logId) {
  const { url } = await getActiveSalesforceTabId(tabId);
  if (!url) {
    return { ok: false, error: "No tab URL available. Open a Salesforce tab first." };
  }
  if (!logId) return { ok: false, error: "Missing log id." };

  const session = await resolveSession(url);
  if ("error" in session) return { ok: false, error: session.error };

  const body = await getApexLogBody(session.apiBase, session.sessionId, logId);
  return { ok: true, body, logId };
}
