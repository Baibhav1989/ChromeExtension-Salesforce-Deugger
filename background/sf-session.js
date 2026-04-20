/**
 * Resolve Salesforce REST API base URL and session id from the active tab.
 */

const API_VERSION = "v60.0";

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

  if (host.endsWith(".my.salesforce.com")) {
    bases.add(`https://${host}`);
  }

  const lightning = host.match(/^([^.]+)\.lightning\.force\.com$/);
  if (lightning) {
    bases.add(`https://${lightning[1]}.my.salesforce.com`);
  }

  const vf = host.match(/^([^.]+)\.vf\.force\.com$/);
  if (vf) {
    bases.add(`https://${vf[1]}.my.salesforce.com`);
  }

  if (host.endsWith(".salesforce.com") && !host.includes(".lightning.")) {
    bases.add(`https://${host}`);
  }

  if (host.endsWith(".sandbox.my.salesforce.com")) {
    bases.add(`https://${host}`);
  }

  return [...bases];
}

/**
 * @param {string} tabUrl
 * @returns {Promise<string|null>}
 */
export async function getSessionId(tabUrl) {
  const urls = new Set();
  try {
    const u = new URL(tabUrl);
    urls.add(`${u.origin}/`);
  } catch {
    return null;
  }

  for (const base of candidateApiBases(tabUrl)) {
    urls.add(`${base}/`);
  }

  for (const url of urls) {
    const c = await chrome.cookies.get({ url, name: "sid" });
    if (c?.value) return c.value;
  }

  const all = await chrome.cookies.getAll({ name: "sid" });
  const host = (() => {
    try {
      return new URL(tabUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  for (const c of all) {
    const d = (c.domain || "").replace(/^\./, "");
    if (!d) continue;
    if (host.endsWith(d) || host.endsWith(`.${d}`)) {
      return c.value;
    }
  }

  return null;
}

/**
 * @param {string} tabUrl
 * @returns {Promise<{ apiBase: string, sessionId: string } | { error: string }>}
 */
export async function resolveSession(tabUrl) {
  const sessionId = await getSessionId(tabUrl);
  if (!sessionId) {
    return {
      error:
        "No Salesforce session (sid cookie) found. Open a Salesforce tab where you are logged in, then try again.",
    };
  }

  const bases = candidateApiBases(tabUrl);
  if (!bases.length) {
    return {
      error:
        "Could not determine your Salesforce API host from this tab. Open Lightning, Setup, or a *.my.salesforce.com page.",
    };
  }

  for (const apiBase of bases) {
    const ok = await pingApi(apiBase, sessionId);
    if (ok) return { apiBase, sessionId };
  }

  return {
    error:
      "Session cookie found but API check failed. Refresh your Salesforce tab or confirm API access is enabled for your user.",
  };
}

/**
 * @param {string} apiBase
 * @param {string} sessionId
 */
async function pingApi(apiBase, sessionId) {
  const url = `${apiBase}/services/data/${API_VERSION}/`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      Accept: "application/json",
    },
  });
  return res.ok;
}

export { API_VERSION };
