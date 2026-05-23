import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "scripts", "launchd", "run-sqlite-sync.sh");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-launchd-"));
}

function writeConfig(dir, compileMode) {
  const cfg = path.join(dir, `${compileMode}.yaml`);
  fs.writeFileSync(
    cfg,
    `raw: ./raw
wiki: ./wiki
joplin_wiki_writeback:
  enabled: false
joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  pipeline:
    compile_mode: ${compileMode}
`,
  );
  return cfg;
}

function writeExecutable(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function runWrapper({ compileMode, curlExit = 22, waitTimeout = "0" }) {
  const dir = tmpdir();
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const curlMarker = path.join(dir, "curl-called");
  const pnpmMarker = path.join(dir, "pnpm-called");
  writeExecutable(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
echo "$@" >> ${JSON.stringify(curlMarker)}
exit ${curlExit}
`,
  );
  writeExecutable(
    path.join(bin, "pnpm"),
    `#!/usr/bin/env bash
echo "$@" >> ${JSON.stringify(pnpmMarker)}
exit 0
`,
  );
  const cfg = writeConfig(dir, compileMode);
  execFileSync("bash", [script], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REPO_ROOT: root,
      JOPLIN_LLMWIKI_CONFIG: cfg,
      MLS_WAIT_TIMEOUT_SEC: waitTimeout,
      MLS_WAIT_INTERVAL_SEC: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    curlCalled: fs.existsSync(curlMarker),
    pnpmCalled: fs.existsSync(pnpmMarker),
  };
}

test("sqlite-sync LaunchAgent readiness skips Ollama for agent compile mode", () => {
  const result = runWrapper({ compileMode: "agent" });

  assert.equal(result.curlCalled, false);
  assert.equal(result.pnpmCalled, true);
});

test("sqlite-sync LaunchAgent readiness skips Ollama for off compile mode", () => {
  const result = runWrapper({ compileMode: "off" });

  assert.equal(result.curlCalled, false);
  assert.equal(result.pnpmCalled, true);
});

test("sqlite-sync LaunchAgent readiness waits for Ollama for local compile mode", () => {
  const result = runWrapper({ compileMode: "local", curlExit: 0, waitTimeout: "5" });

  assert.equal(result.curlCalled, true);
  assert.equal(result.pnpmCalled, true);
});
