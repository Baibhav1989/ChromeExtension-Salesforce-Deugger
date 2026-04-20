/**
 * Collect error / exception lines for a quick summary strip.
 * @param {{ lines: Array<{ raw: string, time: string|null, event: string|null, kind: string }> }} parsed
 * @returns {Array<{ index: number, time: string|null, event: string, text: string }>}
 */
export function collectErrors(parsed) {
  const out = [];
  let i = 0;
  for (const row of parsed.lines) {
    i += 1;
    if (row.kind !== "error") continue;
    out.push({
      index: i,
      time: row.time,
      event: row.event || "ERROR",
      text: row.raw,
    });
  }
  return out;
}
