import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { persistParentHint } from "../../src/health-gui/probes/fs-hints.js";

test("persistParentHint detects writable parent", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-hgui-fs-"));
  const chromaParent = path.join(tmp, "chroma");
  fs.mkdirSync(chromaParent, { recursive: true });
  const persist = path.join(chromaParent, "db");
  const r = persistParentHint(persist);
  assert.strictEqual(r.persistParentWritable, true);
});

test("persistParentHint false when parent path missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-hgui-fs2-"));
  const persist = path.join(tmp, "does-not-exist", "chroma");
  const r = persistParentHint(persist);
  assert.strictEqual(r.persistParentWritable, false);
  assert.ok(r.detail);
});
