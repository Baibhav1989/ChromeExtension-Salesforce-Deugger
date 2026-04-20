/**
 * Session resolution aligned with Apex Class Coverage Viewer:
 * - Optional sourceTabId from app URL (tab that launched the extension)
 * - sid cookie on *.my.salesforce.com candidate origins from lightning / setup host mapping
 * - API version from GET /services/data/
 */

export function parseLaunchSourceTabId(searchParams) {
  const raw = searchParams.get("sourceTabId");
  if (!raw) return null;
  const tabId = Number(raw);
  return Number.isInteger(tabId) ? tabId : null;
}

export function isSalesforceHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host.endsWith(".salesforce.com") ||
    host.endsWith(".my.salesforce.com") ||
    host.endsWith(".lightning.force.com") ||
    host === "salesforce-setup.com" ||
    host.endsWith(".salesforce-setup.com") ||
    host.endsWith(".my.salesforce-setup.com")
  );
}

export function isTrustedApiHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host.endsWith(".my.salesforce.com");
}

export function assertTrustedInstanceUrl(instanceUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(instanceUrl);
  } catch {
    throw new Error("Invalid Salesforce instance URL.");
  }

  if (!isTrustedApiHost(parsedUrl.hostname)) {
    throw new Error(
      "Unsupported Salesforce domain. Open an org tab on *.my.salesforce.com and retry."
    );
  }
}

export function derivePreferredApiHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return "";

  if (host.endsWith(".lightning.force.com")) {
    return host.replace(/\.lightning\.force\.com$/i, ".my.salesforce.com");
  }

  if (host.endsWith(".my.salesforce-setup.com")) {
    return host.replace(/\.my\.salesforce-setup\.com$/i, ".my.salesforce.com");
  }

  if (host.endsWith(".salesforce-setup.com")) {
    return host.replace(/\.salesforce-setup\.com$/i, ".my.salesforce.com");
  }

  return "";
}

export function buildCandidateInstanceOrigins(tabUrl) {
  const origins = [];
  const preferredApiHost = derivePreferredApiHost(tabUrl.hostname);
  if (preferredApiHost) {
    origins.push(`https://${preferredApiHost}`);
  }

  if (isTrustedApiHost(tabUrl.hostname)) {
    origins.push(tabUrl.origin);
  }

  return Array.from(new Set(origins));
}

export async function findSalesforceSessionCookie(tabUrl, candidateOrigins) {
  for (const origin of candidateOrigins) {
    const originHost = new URL(origin).hostname.toLowerCase();
    if (!isTrustedApiHost(originHost)) {
      continue;
    }
    const cookie = await chrome.cookies.get({
      url: origin,
      name: "sid",
    });
    if (cookie?.value) {
      return cookie;
    }
  }
  return null;
}

export function isSalesforceTab(tab) {
  if (!tab?.url) return false;
  try {
    const tabUrl = new URL(tab.url);
    return isSalesforceHost(tabUrl.hostname);
  } catch {
    return false;
  }
}

async function getLaunchSourceSalesforceTab(launchSourceTabId) {
  if (!Number.isInteger(launchSourceTabId)) return null;
  try {
    const tab = await chrome.tabs.get(launchSourceTabId);
    return isSalesforceTab(tab) ? tab : null;
  } catch {
    return null;
  }
}

export async function getPreferredSalesforceTab(launchSourceTabId) {
  if (Number.isInteger(launchSourceTabId)) {
    const fromLaunch = await getLaunchSourceSalesforceTab(launchSourceTabId);
    if (fromLaunch) return fromLaunch;
  }

  const focused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isSalesforceTab(focused[0])) return focused[0];

  const all = await chrome.tabs.query({});
  return all.find((t) => isSalesforceTab(t)) || null;
}

export async function detectApiVersion(instanceUrl, accessToken) {
  try {
    assertTrustedInstanceUrl(instanceUrl);
    const response = await fetch(`${instanceUrl}/services/data/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error("Failed to detect API version");
    }

    if (Array.isArray(payload) && payload.length > 0) {
      const latestVersion = payload[payload.length - 1];
      return latestVersion.version || "60.0";
    }

    return "60.0";
  } catch (e) {
    console.error("Error detecting API version:", e);
    return "60.0";
  }
}

/**
 * @returns {Promise<{ tab: chrome.tabs.Tab, instanceUrl: string, accessToken: string, apiVersion: string }>}
 */
export async function resolveSessionFromTab(launchSourceTabId) {
  const tab = await getPreferredSalesforceTab(launchSourceTabId);
  if (!tab?.url) {
    throw new Error("No Salesforce tab found. Open Salesforce and try again.");
  }

  const tabUrl = new URL(tab.url);
  if (!isSalesforceHost(tabUrl.hostname)) {
    throw new Error("Active tab is not a Salesforce domain.");
  }

  const candidateOrigins = buildCandidateInstanceOrigins(tabUrl);
  const sidCookie = await findSalesforceSessionCookie(tabUrl, candidateOrigins);

  if (!sidCookie?.value) {
    throw new Error(
      "No Salesforce session found. Please ensure you are logged into Salesforce and try again."
    );
  }

  const resolvedInstanceUrl = candidateOrigins[0] || tabUrl.origin;
  assertTrustedInstanceUrl(resolvedInstanceUrl);

  const apiVersion = await detectApiVersion(resolvedInstanceUrl, sidCookie.value);

  return {
    tab,
    instanceUrl: resolvedInstanceUrl,
    accessToken: sidCookie.value,
    apiVersion,
  };
}
