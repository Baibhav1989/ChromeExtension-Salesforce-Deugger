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

async function toolingRequest(apiBase, sessionId, path, options = {}) {
  const url = `${apiBase}${path}`;
  const headers = {
    Authorization: `Bearer ${sessionId}`,
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
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
export async function listApexLogs(apiBase, sessionId, limit, logUserId = null) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = logUserId
    ? `WHERE LogUserId = '${String(logUserId).replace(/'/g, "\\'")}'`
    : "";
  const soql = [
    "SELECT Id, Application, DurationMilliseconds, Location, LogLength,",
    "LogUserId, LogUser.Name, Operation, Request, Status, StartTime",
    "FROM ApexLog",
    where,
    "ORDER BY StartTime DESC",
    `LIMIT ${safeLimit}`,
  ]
    .filter(Boolean)
    .join(" ");
  return toolingQuery(apiBase, sessionId, soql);
}

export async function listActiveUsers(apiBase, sessionId, limit = 500) {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const soql = [
    "SELECT Id, Name, Username",
    "FROM User",
    "ORDER BY Name ASC",
    `LIMIT ${safeLimit}`,
  ].join(" ");
  return toolingQuery(apiBase, sessionId, soql);
}

function escapeSoqlLikeLiteral(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/[%_]/g, "\\$&");
}

export async function searchUsers(apiBase, sessionId, query, limit = 100) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < 3) return { records: [] };
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const contains = `%${escapeSoqlLikeLiteral(trimmed)}%`;
  const soql = [
    "SELECT Id, Name, Username",
    "FROM User",
    `WHERE (Name LIKE '${contains}' OR Username LIKE '${contains}')`,
    "ORDER BY Name ASC",
    `LIMIT ${safeLimit}`,
  ].join(" ");
  return toolingQuery(apiBase, sessionId, soql);
}

function toSfDateTimeIso(date) {
  return new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const DEFAULT_DEBUG_LEVELS = {
  ApexCode: "DEBUG",
  ApexProfiling: "INFO",
  Callout: "INFO",
  Database: "INFO",
  System: "DEBUG",
  Validation: "INFO",
  Visualforce: "INFO",
  Workflow: "INFO",
};

const ALLOWED_LEVELS = new Set([
  "NONE",
  "ERROR",
  "WARN",
  "INFO",
  "DEBUG",
  "FINE",
  "FINER",
  "FINEST",
]);

function normalizeDebugLevels(debugLevels) {
  const normalized = {};
  for (const [field, fallback] of Object.entries(DEFAULT_DEBUG_LEVELS)) {
    const raw = String(debugLevels?.[field] || fallback).toUpperCase();
    normalized[field] = ALLOWED_LEVELS.has(raw) ? raw : fallback;
  }
  return normalized;
}

export async function getOrCreateDebugLevel(apiBase, sessionId, debugLevels = {}) {
  const levels = normalizeDebugLevels(debugLevels);
  const soql = [
    "SELECT Id, DeveloperName, MasterLabel",
    "FROM DebugLevel",
    `WHERE ApexCode = '${levels.ApexCode}'`,
    `AND ApexProfiling = '${levels.ApexProfiling}'`,
    `AND Callout = '${levels.Callout}'`,
    `AND Database = '${levels.Database}'`,
    `AND System = '${levels.System}'`,
    `AND Validation = '${levels.Validation}'`,
    `AND Visualforce = '${levels.Visualforce}'`,
    `AND Workflow = '${levels.Workflow}'`,
    "LIMIT 1",
  ].join(" ");
  const existing = await toolingQuery(apiBase, sessionId, soql);
  if (existing?.records?.[0]?.Id) {
    return existing.records[0].Id;
  }

  const signature = [
    levels.ApexCode,
    levels.ApexProfiling,
    levels.Callout,
    levels.Database,
    levels.System,
    levels.Validation,
    levels.Visualforce,
    levels.Workflow,
  ].join("_");
  const compact = signature.replace(/[^A-Z_]/g, "").slice(0, 28);
  const suffix = Date.now().toString(36).slice(-6).toUpperCase();
  const developerName = `SFDbg_${compact}_${suffix}`.slice(0, 40);
  const masterLabel = `SF Debugger ${suffix}`.slice(0, 80);

  const created = await toolingRequest(
    apiBase,
    sessionId,
    `/services/data/${API_VERSION}/tooling/sobjects/DebugLevel`,
    {
      method: "POST",
      body: JSON.stringify({
        DeveloperName: developerName,
        MasterLabel: masterLabel,
        ...levels,
      }),
    }
  );
  return created?.id || null;
}

export async function getTraceFlagStatus(apiBase, sessionId, userId) {
  const escapedUserId = String(userId).replace(/'/g, "\\'");
  const nowIso = toSfDateTimeIso(new Date());

  const activeSoql = [
    "SELECT Id, TracedEntityId, DebugLevelId, StartDate, ExpirationDate, LogType",
    "FROM TraceFlag",
    `WHERE TracedEntityId = '${escapedUserId}'`,
    "AND LogType = 'USER_DEBUG'",
    `AND ExpirationDate >= ${nowIso}`,
    "ORDER BY ExpirationDate DESC",
    "LIMIT 1",
  ].join(" ");
  const active = await toolingQuery(apiBase, sessionId, activeSoql);
  if (active?.records?.[0]) {
    return { active: true, traceFlag: active.records[0] };
  }

  const expiredSoql = [
    "SELECT Id, TracedEntityId, DebugLevelId, StartDate, ExpirationDate, LogType",
    "FROM TraceFlag",
    `WHERE TracedEntityId = '${escapedUserId}'`,
    "AND LogType = 'USER_DEBUG'",
    `AND ExpirationDate < ${nowIso}`,
    "ORDER BY ExpirationDate DESC",
    "LIMIT 1",
  ].join(" ");
  const expired = await toolingQuery(apiBase, sessionId, expiredSoql);
  return {
    active: false,
    expiredTraceFlag: expired?.records?.[0] || null,
  };
}

export async function createTraceFlag(apiBase, sessionId, userId, debugLevelId, durationMinutes) {
  const start = new Date();
  const end = new Date(start.getTime() + Number(durationMinutes) * 60 * 1000);
  return toolingRequest(
    apiBase,
    sessionId,
    `/services/data/${API_VERSION}/tooling/sobjects/TraceFlag`,
    {
      method: "POST",
      body: JSON.stringify({
        TracedEntityId: userId,
        DebugLevelId: debugLevelId,
        LogType: "USER_DEBUG",
        StartDate: toSfDateTimeIso(start),
        ExpirationDate: toSfDateTimeIso(end),
      }),
    }
  );
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
