import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import YAML from "yaml";

import {
  mergeMvpFields,
  saveConfigValidated,
} from "../../src/health-gui/config/config-coordinator.js";
import { loadConfig } from "../../src/config/load-config.js";

import { writeMinimalValidConfig } from "./fixtures.js";

test("saveConfigValidated rejects invalid YAML and leaves original intact", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-hgui-cfg-"));
  const cfgPath = writeMinimalValidConfig(tmp);
  const before = fs.readFileSync(cfgPath, "utf8");
  const bad = "notes_root: [ broken";
  const res = await saveConfigValidated(cfgPath, bad);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(fs.readFileSync(cfgPath, "utf8"), before);
});

test("saveConfigValidated writes valid YAML and loadConfig succeeds (SCN-HGUI-07)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-hgui-cfg2-"));
  const cfgPath = writeMinimalValidConfig(tmp);
  const cur = await loadConfig(cfgPath);
  const doc = YAML.parse(fs.readFileSync(cfgPath, "utf8"));
  const yamlText = mergeMvpFields(doc, {
    notes_root: cur.notes_root,
    ollama_base_url: cur.ollama.base_url,
    ollama_embed_model: cur.ollama.embed_model,
    ollama_chat_model: cur.ollama.chat_model,
    chroma_persist_path: cur.chroma.persist_path,
  });
  const res = await saveConfigValidated(cfgPath, yamlText);
  assert.strictEqual(res.ok, true);
  await loadConfig(cfgPath);
});
