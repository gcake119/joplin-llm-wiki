import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildHealthSnapshot } from "../../src/health-gui/health-snapshot.js";

import { writeMinimalValidConfig } from "./fixtures.js";

test("buildHealthSnapshot returns CONFIG_INVALID panel when config broken", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-hgui-hs-"));
  const p = path.join(tmp, "bad.yaml");
  fs.writeFileSync(
    p,
    `joplin_wiki_writeback:
  enabled: false
`,
    "utf8",
  );
  const snap = await buildHealthSnapshot(p);
  assert.strictEqual(snap.ok, false);
  assert.strictEqual(snap.code, "CONFIG_INVALID");
});

test("buildHealthSnapshot ok path with mocked network and chroma", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-hgui-hs2-"));
  const cfgPath = writeMinimalValidConfig(tmp);
  class StubChroma {
    async heartbeat() {}
  }
  const fetchMock = async () => ({
    ok: true,
    json: async () => ({
      models: [{ name: "bge-m3" }, { name: "gemma2:2b" }],
    }),
  });
  const snap = await buildHealthSnapshot(cfgPath, {
    fetch: fetchMock,
    chroma: { ChromaStore: StubChroma },
  });
  assert.strictEqual(snap.ok, true);
  assert.strictEqual(snap.ollama?.reachable, true);
  assert.strictEqual(snap.chroma?.reachable, true);
});
