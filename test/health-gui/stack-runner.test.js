import assert from "node:assert";
import { EventEmitter } from "node:events";
import path from "node:path";
import { test } from "vitest";

import { runStackScript, tail512 } from "../../src/health-gui/stack/stack-script-runner.js";

test("tail512 truncates", () => {
  const s = "x".repeat(600);
  assert.strictEqual(tail512(s).length, 512);
});

test("SCN-HGUI-08 runStackScript rejects without confirmed", async () => {
  let calls = 0;
  const spawnImpl = () => {
    calls++;
    return new EventEmitter();
  };
  const r = await runStackScript(
    "/repo",
    "/tmp/cfg.yaml",
    { kind: "install-stack", confirmed: false },
    spawnImpl,
  );
  assert.strictEqual(calls, 0);
  assert.strictEqual(r.code, "CONFIRMATION_REQUIRED");
});

test("runStackScript runs bash when confirmed", async () => {
  const repoRoot = process.cwd();
  const spawnImpl = (cmd, args, _opts) => {
    assert.strictEqual(cmd, "bash");
    assert.ok(args[0].includes("install-joplin-brain-stack.sh"));
    assert.strictEqual(args[1], path.resolve(repoRoot));
    assert.strictEqual(args[2], path.resolve("/abs/cfg.yaml"));
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    queueMicrotask(() => {
      c.stdout.emit("data", "hello\n");
      c.emit("close", 0);
    });
    return c;
  };
  const r = await runStackScript(
    repoRoot,
    "/abs/cfg.yaml",
    { kind: "install-stack", confirmed: true },
    spawnImpl,
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.exitCode, 0);
  assert.ok(r.stdoutTail.includes("hello"));
});
