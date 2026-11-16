#!/usr/bin/env node
const fs = require("node:fs");

const file =
  process.argv[2] ??
  "source/atomica-sdk/tests/fixtures/window_clock_vectors.json";

function fail(message) {
  console.error(`${file}: ${message}`);
  process.exit(1);
}

let vectors;
try {
  vectors = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  fail(`cannot read JSON: ${error.message}`);
}

if (
  vectors.day_secs !== 86_400 ||
  JSON.stringify(vectors.close_offsets_secs) !== "[27900,58500]"
) {
  fail("schedule must be the production 86400:[27900,58500] clock");
}
if (
  !Number.isSafeInteger(vectors.reclaim_delay_secs) ||
  !Array.isArray(vectors.rows) ||
  vectors.rows.length === 0
) {
  fail("reclaim delay and at least one vector row are required");
}

const offsets = vectors.close_offsets_secs;
for (const [index, row] of vectors.rows.entries()) {
  const day = Math.floor(row.at / vectors.day_secs);
  const secondOfDay = row.at % vectors.day_secs;
  const windowId =
    day * offsets.length +
    offsets.filter((offset) => offset <= secondOfDay).length;
  const close =
    Math.floor(windowId / offsets.length) * vectors.day_secs +
    offsets[windowId % offsets.length];
  const deadline = close + vectors.reclaim_delay_secs;
  if (
    row.window_id !== windowId ||
    row.close !== close ||
    row.deadline !== deadline
  ) {
    fail(
      `row ${index} at ${row.at} is stale: expected window_id=${windowId}, close=${close}, deadline=${deadline}`,
    );
  }
}

console.log(
  `Window vectors are current (${vectors.rows.length} rows): ${file}`,
);
