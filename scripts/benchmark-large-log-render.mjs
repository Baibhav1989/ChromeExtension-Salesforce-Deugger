/**
 * Parse + partial render benchmarks for huge logs (same code paths as the extension).
 * Usage: node scripts/benchmark-large-log-render.mjs [path-to-log]
 */
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";
import { fileURLToPath } from "url";

import {
  buildLogDataRowsHtml,
  filterLogLines,
  getDefaultLogFilters,
  parseDebugLog,
  renderFullRawLogHtml,
  segmentLogLines,
} from "../lib/log-formatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOG = path.join(__dirname, "..", "fixtures", "dummy-18mb.log");

const logPath = path.resolve(process.argv[2] || DEFAULT_LOG);

if (!fs.existsSync(logPath)) {
  console.error(`Missing file: ${logPath}`);
  console.error("Run: node scripts/generate-dummy-log.mjs");
  process.exit(1);
}

console.log(`Reading ${logPath} …`);
let t0 = performance.now();
const raw = fs.readFileSync(logPath, "utf8");
console.log(`read: ${((performance.now() - t0) / 1000).toFixed(2)}s (${(raw.length / 1024 / 1024).toFixed(2)} MiB chars)`);

t0 = performance.now();
const parsed = parseDebugLog(raw);
console.log(`parseDebugLog: ${((performance.now() - t0) / 1000).toFixed(2)}s (${parsed.lines.length} lines)`);

// Extension "large raw" path: single text node — effectively free vs building HTML
t0 = performance.now();
const rawLen = raw.length;
void rawLen;
console.log(`large-raw path (text assign): ~0s logical — ${rawLen} chars`);

// Old path sample only (full log would hang / huge string)
const SAMPLE_LINES = 2000;
const sampleParsed = { lines: parsed.lines.slice(0, SAMPLE_LINES) };
t0 = performance.now();
const sampleHtml = renderFullRawLogHtml(sampleParsed.lines);
console.log(`renderFullRawLogHtml (${SAMPLE_LINES} lines): ${((performance.now() - t0) / 1000).toFixed(3)}s (${(sampleHtml.length / 1024).toFixed(1)} KiB html)`);

const filters = getDefaultLogFilters();
t0 = performance.now();
const filtered = filterLogLines(parsed.lines, filters);
console.log(`filterLogLines (all on): ${((performance.now() - t0) / 1000).toFixed(2)}s (${filtered.length} rows)`);

t0 = performance.now();
const segments = segmentLogLines(filtered);
console.log(`segmentLogLines: ${((performance.now() - t0) / 1000).toFixed(3)}s (${segments.length} sections)`);

let errSeq = 0;
let soqlSeq = 0;
const assignErrorRowId = () => {
  errSeq += 1;
  return `log-error-row-${errSeq}`;
};
const assignSoqlRowId = () => {
  soqlSeq += 1;
  return `log-soql-row-${soqlSeq}`;
};

const CHUNK = 450;
let chunkMs = 0;
let totalRowHtmlChars = 0;
for (const seg of segments) {
  for (let off = 0; off < seg.lines.length; off += CHUNK) {
    const slice = seg.lines.slice(off, off + CHUNK);
    t0 = performance.now();
    const html = buildLogDataRowsHtml(slice, false, assignErrorRowId, assignSoqlRowId);
    chunkMs += performance.now() - t0;
    totalRowHtmlChars += html.length;
  }
}
console.log(
  `buildLogDataRowsHtml (all rows, ${CHUNK}-line chunks): ${(chunkMs / 1000).toFixed(2)}s total CPU (${(totalRowHtmlChars / 1024 / 1024).toFixed(2)} MiB row HTML)`
);

console.log("\nDone. Open the extension details page with this log in Salesforce, or use the generated file for manual testing.");
