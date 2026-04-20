/**
 * Resolve Salesforce REST API base URL and session id from the active tab.
 * Host mapping matches Apex Class Coverage Viewer (popup.js): Lightning / Setup UIs
 * resolve to *.my.salesforce.com for sid + REST API.
 */

const API_VERSION = "v60.0";

/**
 * Map the current tab host to the org API host (My Domain) used for sid + /services/data/.
 * Same rules as derivePreferredApiHost in Apex Coverage Viewer.
 * @param {string} hostname
 * @returns {string} hostname only, or "" if unknown
 */
function derivePreferredApiHost(hostname) {
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

  if (host.endsWith(".vf.force.com")) {
    return host.replace(/\.vf\.force\.com$/i, ".my.salesforce.com");
  }

  return "";
}

/**
 * @param {string} tabUrl
 * @returns {string[]}
 */
export function candidateApiBases(tabUrl) {
  let u;
  try {
    u = new URL(tabUrl);
  } catch {
    return [];
  }
  if (!u.protocol.startsWith("http")) return [];

  const host = u.hostname.toLowerCase();
  const bases = new Set();

  const preferred = derivePreferredApiHost(host);
  if (preferred) {
    bases.add(`https://${preferred}`);
  }

  if (host.endsWith(".my.salesforce.com")) {
    bases.add(`https://${host}`);
  }

  return [...bases];
}

/**
 * Read sid only for the given API origin (must match the org you will call).
 * Avoids picking a session from another Salesforce tab/org.
 * @param {string} apiBase e.g. https://myorg.sandbox.my.salesforce.com
 */
export async function getSessionIdForOrigin(apiBase) {
  const normalized = String(apiBase || "").replace(/\/+$/, "");
  if (!normalized) return null;
  const c = await chrome.cookies.get({
    url: `${normalized}/`,
    name: "sid",
  });
  return c?.value || null;
}

/**
 * @param {string} tabUrl
 * @returns {Promise<{ apiBase: string, sessionId: string } | { error: string }>}
 */
export async function resolveSession(tabUrl) {
  const bases = candidateApiBases(tabUrl);
  if (!bases.length) {
    return {
      error:
        "Could not determine your Salesforce API host from this tab. Open Lightning, Setup, or a *.my.salesforce.com page.",
    };
  }

  let foundSidForOrg = false;

  // Pair each REST host with the sid for that exact origin (avoids using another org's session).
  for (const apiBase of bases) {
    const sessionId = await getSessionIdForOrigin(apiBase);
    if (!sessionId) continue;
    foundSidForOrg = true;

    const ok = await pingApi(apiBase, sessionId);
    if (ok) {
      return { apiBase, sessionId };
    }
  }

  if (!foundSidForOrg) {
    return {
      error:
        "No session cookie (sid) for this org's API host. Fully load this org (wait for the page to finish), then click Refresh. If it persists, open Setup in the same browser profile.",
    };
  }

  return {
    error:
      "Salesforce API did not accept this session. Reload the tab, or confirm API access is enabled for your user. Reload the extension after updates (chrome://extensions).",
  };
}

/**
 * Same check as Apex Coverage Viewer detectApiVersion — unversioned /services/data/.
 * @param {string} apiBase
 * @param {string} sessionId
 */
async function pingApi(apiBase, sessionId) {
  const url = `${apiBase.replace(/\/+$/, "")}/services/data/`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${sessionId}`,
        Accept: "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { API_VERSION };
