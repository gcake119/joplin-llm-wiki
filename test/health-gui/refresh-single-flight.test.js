import assert from "node:assert";
import { test } from "node:test";

import { createSingleFlight } from "../../src/health-gui/lib/single-flight.js";

test("createSingleFlight skips overlapping calls", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const runner = createSingleFlight(async () => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 40));
    concurrent--;
    return 1;
  });
  const results = await Promise.all([runner(), runner()]);
  const skipped = results.filter((r) => r.skipped).length;
  assert.strictEqual(skipped, 1);
  assert.strictEqual(maxConcurrent, 1);
});
