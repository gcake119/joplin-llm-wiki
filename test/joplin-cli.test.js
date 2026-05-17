import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import { runJoplinCliPreflight } from "../src/joplin/cli-runner.js";

test("SCN-JOP-CLI-01 preflight failure surfaces JOPLIN_CLI_FAILED", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-jop-"));
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fake = path.join(binDir, "joplin");
  fs.writeFileSync(
    fake,
    "#!/usr/bin/env node\nprocess.exit(1)\n",
    { mode: 0o755 },
  );

  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
joplin_cli:
  enabled: true
  command: joplin
  preflight_argv: ["version"]
  timeout_ms: 5000
`,
    "utf8",
  );

  const prevPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${prevPath ?? ""}`;
  try {
    const cfg = await loadConfig(cfgPath);
    await assert.rejects(runJoplinCliPreflight(cfg), (e) => {
      return /** @type {Error & { code?: string }} */ (e).code === "JOPLIN_CLI_FAILED";
    });
  } finally {
    process.env.PATH = prevPath ?? "";
  }
});
