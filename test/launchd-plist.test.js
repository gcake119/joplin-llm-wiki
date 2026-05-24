import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sqliteSyncPlist = path.join(
  root,
  "scripts",
  "launchd",
  "com.joplin-brain.sqlite-sync.plist.example",
);

function readPlistJson(file) {
  return JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", file], {
    encoding: "utf8",
  }));
}

test("sqlite-sync LaunchAgent restarts on non-zero exit with throttle", () => {
  const plist = readPlistJson(sqliteSyncPlist);

  assert.deepEqual(plist.KeepAlive, { SuccessfulExit: false });
  assert.equal(Number.isInteger(plist.ThrottleInterval), true);
  assert.equal(plist.ThrottleInterval > 0, true);
  assert.equal("StartInterval" in plist, false);
});

test("sqlite-sync LaunchAgent stays local-only and does not embed token", () => {
  const plist = readPlistJson(sqliteSyncPlist);
  const text = fs.readFileSync(sqliteSyncPlist, "utf8");

  assert.equal(plist.Label, "com.joplin-brain.sqlite-sync");
  assert.ok(plist.ProgramArguments.includes("__REPO_ROOT__/scripts/launchd/run-sqlite-sync.sh"));
  assert.equal(plist.EnvironmentVariables.REPO_ROOT, "__REPO_ROOT__");
  assert.equal(plist.EnvironmentVariables.JOPLIN_LLMWIKI_CONFIG, "__CONFIG_ABS__");
  assert.equal(/token/i.test(text), false);
});
