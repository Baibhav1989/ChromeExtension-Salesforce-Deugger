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
      const fc = getFilterCategory(null, rawLine);
      lines.push({
        raw: rawLine,
        time: null,
        ns: null,
        event: null,
        rest: rawLine,
        kind: classifyLoose(rawLine),
        filterCategory: fc,
        classMethodLabel: extractClassMethodLabel(null, rawLine),
      });
      continue;
    }
    const [, time, ns, event, rest] = m;
    const kind = classifyEvent(event, rest);
    if (kind === "error") errors += 1;
    if (kind === "soql") soql += 1;
    lines.push({
      raw: rawLine,
      time,
      ns,
      event,
      rest,
      kind,
      filterCategory: getFilterCategory(event, rest),
      classMethodLabel: extractClassMethodLabel(event, rest),
    });
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
 * Filter toggles: debug, exception, query, variable — used by the log viewer table.
 * @param {string|null} event
 * @param {string} rest
 * @returns {"debug"|"exception"|"query"|"variable"|"other"}
 */
export function getFilterCategory(event, rest) {
  const e = event || "";
  if (e === "USER_DEBUG") {
    return "debug";
  }
  if (
    e === "FATAL_ERROR" ||
    e.startsWith("EXCEPTION_") ||
    e === "EXCEPTION_THROWN" ||
    e.includes("VALIDATION_FAIL") ||
    e === "UNEXPECTED_EXCEPTION"
  ) {
    return "exception";
  }
  const r = (rest || "").toUpperCase();
  if (r.includes("FATAL") && r.includes("EXCEPTION")) {
    return "exception";
  }
  if (e === "SOQL_EXECUTE_BEGIN" || e === "SOQL_EXECUTE_END" || e.includes("QUERY_")) {
    return "query";
  }
  if (e === "VARIABLE_ASSIGNMENT") {
    return "variable";
  }
  return "other";
}

/**
 * Best-effort class / method or context column from log line rest.
 * @param {string|null} event
 * @param {string} rest
 */
export function extractClassMethodLabel(event, rest) {
  if (!rest) return "—";
  const parts = rest
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const e = event || "";

  if (e === "METHOD_ENTRY" || e === "METHOD_EXIT") {
    for (const p of parts) {
      const t = p.replace(/\(\)\s*$/u, "");
      if (/^[A-Za-z0-9_.]+\.[A-Za-z0-9_]+/u.test(t)) {
        return t.length > 120 ? `${t.slice(0, 117)}…` : t;
      }
    }
    if (parts.length >= 3) {
      const cand = parts[parts.length - 1].replace(/\(\)\s*$/u, "");
      if (cand.length < 200) return cand;
    }
    return parts[2] || parts[1] || "—";
  }

  if (e === "VARIABLE_ASSIGNMENT") {
    if (parts.length >= 3) {
      const scope = parts[1] || "";
      const name = parts[2] || "";
      return [scope, name].filter(Boolean).join(" · ") || "—";
    }
    return parts[1] || "—";
  }

  if (e === "USER_DEBUG") {
    return "Debug";
  }

  if (e === "SOQL_EXECUTE_BEGIN" || e === "SOQL_EXECUTE_END") {
    return "SOQL";
  }

  if (
    e === "EXCEPTION_THROWN" ||
    e.startsWith("EXCEPTION_") ||
    e === "FATAL_ERROR"
  ) {
    const first = parts[0] || "";
    if (first.length > 0 && first.length < 200) return first;
    return parts[1] || "Exception";
  }

  if (e === "CODE_UNIT_STARTED" || e === "CODE_UNIT_FINISHED") {
    const last = parts[parts.length - 1];
    if (last && last.length < 200) return last;
  }

  return "—";
}

/**
 * Plain detail text for the table (truncated); caller may prefer HTML via formatDetailCell.
 * @param {string|null} event
 * @param {string} rest
 * @param {number} maxLen
 */
export function getDetailPlain(event, rest, maxLen = 400) {
  if (rest == null || rest === "") return "";
  let d = rest;
  if (event === "USER_DEBUG") {
    const pipe = d.indexOf("|");
    d = pipe >= 0 ? d.slice(pipe + 1).trim() : d;
  }
  d = d.replace(/\s+/gu, " ").trim();
  if (d.length > maxLen) return `${d.slice(0, maxLen - 1)}…`;
  return d;
}

const FILTER_STORAGE_KEY = "sfDbgLogFilters";

/**
 * @returns {{ debug: boolean, exception: boolean, query: boolean, variable: boolean }}
 */
export function getDefaultLogFilters() {
  return {
    debug: true,
    exception: true,
    query: true,
    variable: true,
  };
}

export function loadLogFilters() {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return getDefaultLogFilters();
    const o = JSON.parse(raw);
    const d = getDefaultLogFilters();
    return {
      debug: o.debug !== false,
      exception: o.exception !== false,
      query: o.query !== false,
      variable: o.variable !== false,
    };
  } catch {
    return getDefaultLogFilters();
  }
}

export function saveLogFilters(filters) {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

/**
 * @param {Array<{ filterCategory?: string }>} lines
 * @param {{ debug: boolean, exception: boolean, query: boolean, variable: boolean }} filters
 */
export function filterLogLines(lines, filters) {
  const showAllCategories =
    filters.debug && filters.exception && filters.query && filters.variable;

  return lines.filter((line) => {
    if (showAllCategories) return true;

    const cat = line.filterCategory || "other";
    if (cat === "other") return true;
    if (cat === "debug" && filters.debug) return true;
    if (cat === "exception" && filters.exception) return true;
    if (cat === "query" && filters.query) return true;
    if (cat === "variable" && filters.variable) return true;
    return false;
  });
}

/**
 * @param {{ event: string|null, rest: string, kind?: string, filterCategory?: string }} row
 */
export function formatDetailCellHtml(row) {
  if (row.event === "USER_DEBUG" && row.rest) {
    const pipe = row.rest.indexOf("|");
    const after = pipe >= 0 ? row.rest.slice(pipe + 1).trim() : row.rest.trim();
    const pretty = tryPrettyJson(after);
    if (pretty) {
      return `<pre class="json-pre json-pre--inline">${escapeHtml(pretty)}</pre>`;
    }
  }
  if (row.event === "SOQL_EXECUTE_BEGIN" && row.rest) {
    return formatSoqlRest(row.rest);
  }
  if (row.event === "SOQL_EXECUTE_END" && row.rest) {
    return `<span class="soql-end">${escapeHtml(row.rest)}</span>`;
  }
  return escapeHtml(getDetailPlain(row.event, row.rest, 4000));
}

/**
 * Split filtered log lines into Salesforce-style sections: leading header lines
 * (no timestamp), then groups starting at each CODE_UNIT_STARTED.
 * @param {Array<any>} filteredLines
 * @returns {Array<{ title: string, lines: Array<any> }>}
 */
export function segmentLogLines(filteredLines) {
  /** @type {Array<{ title: string, lines: Array<any> }>} */
  const sections = [];
  let i = 0;
  /** @type {Array<any>} */
  const preamble = [];
  while (i < filteredLines.length && !filteredLines[i].time) {
    preamble.push(filteredLines[i]);
    i += 1;
  }
  if (preamble.length) {
    sections.push({ title: "Header & metadata", lines: preamble });
  }

  const rest = filteredLines.slice(i);
  if (!rest.length) {
    return sections;
  }

  /** @type {{ title: string, lines: Array<any> } | null} */
  let current = null;
  for (const row of rest) {
    if (row.event === "CODE_UNIT_STARTED") {
      if (current && current.lines.length) {
        sections.push(current);
      }
      current = {
        title: formatCodeUnitSectionTitle(row.rest),
        lines: [row],
      };
    } else {
      if (!current) {
        current = { title: "Execution", lines: [] };
      }
      current.lines.push(row);
    }
  }
  if (current && current.lines.length) {
    sections.push(current);
  }
  return sections;
}

/**
 * @param {string} rest
 */
function formatCodeUnitSectionTitle(rest) {
  const raw = (rest || "").trim();
  if (!raw) {
    return "Code unit";
  }
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || raw;
  const t = last.length > 100 ? `${last.slice(0, 97)}…` : last;
  return `Code unit · ${t}`;
}

/**
 * @param {Array<any>} lines
 */
function renderLogDataTableHtml(lines) {
  const rows = lines
    .map((row) => {
      const time = escapeHtml(row.time || "—");
      const type = escapeHtml(row.event || "—");
      const cm = escapeHtml(row.classMethodLabel || "—");
      const detail = formatDetailCellHtml(row);
      const err = row.filterCategory === "exception" || row.kind === "error";
      const trClass = err ? "log-data-row log-data-row--error" : "log-data-row";
      return `<tr class="${trClass}"><td class="col-time">${time}</td><td class="col-type"><code>${type}</code></td><td class="col-class">${cm}</td><td class="col-detail">${detail}</td></tr>`;
    })
    .join("");
  return `<div class="log-table-scroll"><table class="log-data-table" role="grid"><thead><tr><th scope="col">Time</th><th scope="col">Log type</th><th scope="col">Class / method / context</th><th scope="col">Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * @param {Array<any>} filteredLines
 */
export function renderLogTableHtml(filteredLines) {
  if (!filteredLines.length) {
    return `<p class="log-table-empty">No log lines match the current filters. Turn on one or more categories above.</p>`;
  }
  const segments = segmentLogLines(filteredLines);
  const blocks = segments
    .map((seg, idx) => {
      const safeTitle = escapeHtml(seg.title);
      const count = seg.lines.length;
      const table = renderLogDataTableHtml(seg.lines);
      return `<section class="log-section" aria-labelledby="log-section-${idx}">
<h3 class="log-section__title" id="log-section-${idx}">${safeTitle} <span class="log-section__count">${count} line${count === 1 ? "" : "s"}</span></h3>
${table}
</section>`;
    })
    .join("");
  return `<div class="log-sections">${blocks}</div>`;
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
