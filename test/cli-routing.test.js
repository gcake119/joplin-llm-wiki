import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin/joplin-llm-wiki.js");

function run(argv) {
  return execFileSync(process.execPath, [cli, ...argv], {
    encoding: "utf8",
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runThrows(argv) {
  try {
    execFileSync(process.execPath, [cli, ...argv], {
      encoding: "utf8",
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return null;
  } catch (e) {
    return e;
  }
}

test("unknown subcommand exits 1", () => {
  const err = runThrows(["not-a-real-command"]);
  assert.ok(err);
  assert.strictEqual(err.status, 1);
});

test("known command --help exits 0", () => {
  const out = run(["query", "--help"]);
  assert.match(out, /query/i);
});

test("agent-compile help documents full-library default and batch fallback", () => {
  const out = run(["agent-compile", "--help"]);
  assert.match(out, /By default, scans every raw\/ source/);
  assert.match(out, /--batch=true\|false/);
  assert.match(out, /--full-library=true\|false/);
});

test("removed ask and index commands are unknown", () => {
  assert.strictEqual(runThrows(["ask"])?.status, 1);
  assert.strictEqual(runThrows(["index"])?.status, 1);
});
