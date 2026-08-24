/**
 * Writes a Salesforce-shaped Apex debug log of approximately TARGET_BYTES (default 18 MiB).
 * Usage: node scripts/generate-dummy-log.mjs [targetMiB]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const DEFAULT_TARGET = 18 * 1024 * 1024;

const targetMiB = Number(process.argv[2]);
const TARGET_BYTES = Number.isFinite(targetMiB) && targetMiB > 0
  ? Math.round(targetMiB * 1024 * 1024)
  : DEFAULT_TARGET;

const OUT = path.join(FIXTURES_DIR, `dummy-${Math.round(TARGET_BYTES / 1024 / 1024)}mb.log`);

fs.mkdirSync(FIXTURES_DIR, { recursive: true });

const EVENTS = [
  "USER_DEBUG",
  "METHOD_ENTRY",
  "METHOD_EXIT",
  "SOQL_EXECUTE_BEGIN",
  "SOQL_EXECUTE_END",
  "CODE_UNIT_STARTED",
  "CODE_UNIT_FINISHED",
  "DML_BEGIN",
  "DML_END",
];

function pad6(n) {
  return String(n).padStart(6, "0");
}

const ws = fs.createWriteStream(OUT);
let written = 0;
let lineNum = 0;

while (written < TARGET_BYTES) {
  const h = Math.floor(lineNum / 100000) % 24;
  const m = Math.floor(lineNum / 1000) % 60;
  const s = lineNum % 60;
  const ms = lineNum % 1000;
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  const ns = String((lineNum % 999) + 1);
  const ev = EVENTS[lineNum % EVENTS.length];
  const payload = `[${pad6(lineNum)}]|SomeClass.someMethod: line ${lineNum}|EXECUTE|[${pad6(lineNum)}]|SELECT Id,Name FROM Account WHERE Name LIKE '%${pad6(lineNum)}%' LIMIT 10`;
  const line = `${time} (${ns})|${ev}|${payload}\n`;
  ws.write(line);
  written += Buffer.byteLength(line, "utf8");
  lineNum += 1;
}

await new Promise((resolve, reject) => {
  ws.end((err) => (err ? reject(err) : resolve()));
});

const stat = fs.statSync(OUT);
console.log(`Wrote ${OUT}`);
console.log(`Lines: ${lineNum}, size: ${(stat.size / 1024 / 1024).toFixed(2)} MiB (${stat.size} bytes)`);
