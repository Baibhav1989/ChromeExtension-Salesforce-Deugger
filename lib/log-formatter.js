/**
 * Parse Salesforce Apex debug log text into structured rows for display.
 * @param {string} raw
 * @returns {{ lines: Array<{ raw: string, time: string|null, ns: string|null, event: string|null, rest: string, kind: string }>, summary: { errors: number, soql: number } }}
 */
export function parseDebugLog(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  const rawLines = text.split("\n");
  const lines = [];
  let errors = 0;
  let soql = 0;

  const lineRe =
    /^(\d{2}:\d{2}:\d{2}\.\d+)\s+\((\d+)\)\|([A-Z0-9_]+)\|(.*)$/;

  for (const rawLine of rawLines) {
    const m = rawLine.match(lineRe);
    if (!m) {
      lines.push({
        raw: rawLine,
        time: null,
        ns: null,
        event: null,
        rest: rawLine,
        kind: classifyLoose(rawLine),
      });
      continue;
    }
    const [, time, ns, event, rest] = m;
    const kind = classifyEvent(event, rest);
    if (kind === "error") errors += 1;
    if (kind === "soql") soql += 1;
    lines.push({ raw: rawLine, time, ns, event, rest, kind });
  }

  return { lines, summary: { errors, soql } };
}

function classifyLoose(line) {
  const u = line.toUpperCase();
  if (
    u.includes("FATAL_ERROR") ||
    u.includes("EXCEPTION_") ||
    u.includes("ERROR") && u.includes("|")
  ) {
    return "error";
  }
  return "meta";
}

function classifyEvent(event, rest) {
  const e = event || "";
  if (
    e === "FATAL_ERROR" ||
    e.startsWith("EXCEPTION_") ||
    e === "EXCEPTION_THROWN" ||
    e.includes("VALIDATION_FAIL") ||
    e === "UNEXPECTED_EXCEPTION"
  ) {
    return "error";
  }
  if (e === "SOQL_EXECUTE_BEGIN" || e === "SOQL_EXECUTE_END") {
    return "soql";
  }
  if (e === "METHOD_ENTRY" || e === "METHOD_EXIT") {
    return "method";
  }
  if (e === "CODE_UNIT_STARTED" || e === "CODE_UNIT_FINISHED") {
    return "codeunit";
  }
  if (e === "USER_DEBUG") {
    return "userdebug";
  }
  if (e.startsWith("DML_")) {
    return "dml";
  }
  if (e.includes("LIMIT_USAGE") || e === "CUMULATIVE_LIMIT_USAGE") {
    return "limits";
  }
  if (e === "HEAP_DUMP") {
    return "heap";
  }
  const r = (rest || "").toUpperCase();
  if (r.includes("FATAL") || r.includes("EXCEPTION")) {
    return "error";
  }
  return "default";
}

/**
 * Escape HTML
 * @param {string} s
 */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Try to extract and pretty-print JSON from USER_DEBUG or raw segments.
 * @param {string} text
 */
export function tryPrettyJson(text) {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    const idx = trimmed.indexOf("{");
    const idx2 = trimmed.indexOf("[");
    const start = idx >= 0 && idx2 >= 0 ? Math.min(idx, idx2) : idx >= 0 ? idx : idx2;
    if (start < 0) return null;
    const slice = trimmed.slice(start);
    try {
      const parsed = JSON.parse(slice);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return null;
    }
  }
}

/**
 * Highlight SOQL in SOQL_EXECUTE_BEGIN line rest.
 * @param {string} rest
 */
export function formatSoqlRest(rest) {
  const upper = rest.toUpperCase();
  const selectIdx = upper.indexOf("SELECT");
  if (selectIdx < 0) {
    return escapeHtml(rest);
  }
  const before = rest.slice(0, selectIdx);
  const query = rest.slice(selectIdx).trim();
  return `${escapeHtml(before)}<span class="soql-query">${escapeHtml(query)}</span>`;
}

/**
 * Build HTML document body content from parsed log.
 * @param {ReturnType<typeof parseDebugLog>['lines']} lines
 */
export function renderLogHtml(lines) {
  const parts = [];
  for (const row of lines) {
    const cls = [
      "log-line",
      `log-line--${row.kind}`,
      row.event ? `log-event-${row.event}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const timeCol = row.time
      ? `<span class="log-time">${escapeHtml(row.time)}</span>`
      : "";
    const nsCol = row.ns
      ? `<span class="log-ns">${escapeHtml(row.ns)}</span>`
      : "";
    const evCol = row.event
      ? `<span class="log-event">${escapeHtml(row.event)}</span>`
      : "";

    let bodyHtml = "";
    if (row.event === "USER_DEBUG" && row.rest) {
      const pipe = row.rest.indexOf("|");
      const after =
        pipe >= 0 ? row.rest.slice(pipe + 1).trim() : row.rest.trim();
      const pretty = tryPrettyJson(after);
      if (pretty) {
        bodyHtml = `<div class="user-debug-json"><pre class="json-pre">${escapeHtml(
          pretty
        )}</pre></div>`;
      } else {
        bodyHtml = `<span class="log-rest">${escapeHtml(row.rest)}</span>`;
      }
    } else if (row.event === "SOQL_EXECUTE_END" && row.rest) {
      bodyHtml = `<span class="log-rest soql-end">${escapeHtml(row.rest)}</span>`;
    } else if (row.event === "SOQL_EXECUTE_BEGIN" && row.rest) {
      bodyHtml = `<span class="log-rest">${formatSoqlRest(row.rest)}</span>`;
    } else if (row.rest != null && row.rest !== "") {
      bodyHtml = `<span class="log-rest">${escapeHtml(row.rest)}</span>`;
    }
    if (!bodyHtml) {
      bodyHtml = `<span class="log-rest">${escapeHtml(row.raw)}</span>`;
    }

    parts.push(
      `<div class="${cls}"><div class="log-line-inner">${timeCol}${nsCol}${evCol}${bodyHtml}</div></div>`
    );
  }
  return parts.join("\n");
}
