import { API_VERSION } from "./sf-session.js";

/**
 * @param {string} apiBase
 * @param {string} sessionId
 * @param {string} soql
 */
export async function toolingQuery(apiBase, sessionId, soql) {
  const q = encodeURIComponent(soql);
  const url = `${apiBase}/services/data/${API_VERSION}/tooling/query?q=${q}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      body?.[0]?.message ||
      body?.message ||
      body?.error ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return body;
}

/**
 * @param {string} apiBase
 * @param {string} sessionId
 * @param {number} limit
 */
export async function listApexLogs(apiBase, sessionId, limit) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const soql = [
    "SELECT Id, Application, DurationMilliseconds, Location, LogLength,",
    "LogUserId, LogUser.Name, Operation, Request, Status, StartTime",
    "FROM ApexLog",
    "ORDER BY StartTime DESC",
    `LIMIT ${safeLimit}`,
  ].join(" ");
  return toolingQuery(apiBase, sessionId, soql);
}

/**
 * @param {string} apiBase
 * @param {string} sessionId
 * @param {string} logId
 */
export async function getApexLogBody(apiBase, sessionId, logId) {
  const id = encodeURIComponent(logId);
  const paths = [
    `/services/data/${API_VERSION}/tooling/sobjects/ApexLog/${id}/Body/Body`,
    `/services/data/${API_VERSION}/tooling/sobjects/ApexLog/${id}/Body`,
    `/services/data/${API_VERSION}/sobjects/ApexLog/${id}/Body`,
  ];

  let lastErr = "Unknown error";
  for (const path of paths) {
    const url = `${apiBase}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${sessionId}`,
        Accept: "text/plain,*/*",
      },
    });
    if (res.ok) {
      return await res.text();
    }
    lastErr = (await res.text()) || `HTTP ${res.status}`;
  }
  throw new Error(lastErr);
}
