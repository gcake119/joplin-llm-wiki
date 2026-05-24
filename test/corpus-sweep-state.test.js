import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import assert from "node:assert";
import {
  defaultSweepStatePath,
  initialSweepState,
  readSweepState,
  reconcileFingerprint,
  writeSweepStateAtomic,
} from "../src/wiki/corpus-sweep-state.js";

test("corpus sweep state roundtrip via atomic write", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-st-"));
  const wikiRoot = path.join(tmp, "wiki");
  fs.mkdirSync(wikiRoot, { recursive: true });
  const p = defaultSweepStatePath(wikiRoot);
  const s = initialSweepState(11);
  s.next_offset = 4;
  s.markdown_file_count = 7;
  s.updated_at_ms = 42;
  writeSweepStateAtomic(p, s);
  const r = readSweepState(p);
  assert.ok(r);
  assert.strictEqual(r.next_offset, 4);
  assert.strictEqual(r.markdown_file_count, 7);
  assert.strictEqual(r.step_files, 11);
});

test("readSweepState returns null for corrupt JSON", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-bad-"));
  const p = path.join(tmp, "bad.json");
  fs.writeFileSync(p, "{not-json", "utf8");
  assert.strictEqual(readSweepState(p), null);
});

test("reconcileFingerprint resets offset when markdown count changes", () => {
  const s0 = initialSweepState(5);
  s0.markdown_file_count = 3;
  s0.next_offset = 7;
  const { state, fingerprint_reset } = reconcileFingerprint(s0, 4, 5);
  assert.strictEqual(fingerprint_reset, true);
  assert.strictEqual(state.next_offset, 0);
  assert.strictEqual(state.markdown_file_count, 4);
});

test("writeSweepStateAtomic CORPUS_SWEEP_STATE_IO when parent path is a file", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-io-"));
  const blocker = path.join(tmp, "block");
  fs.writeFileSync(blocker, ".", "utf8");
  const badPath = path.join(blocker, "nested", "state.json");
  assert.throws(
    () =>
      writeSweepStateAtomic(badPath, {
        schema_version: 1,
        next_offset: 0,
        markdown_file_count: 0,
        step_files: 1,
        updated_at_ms: 0,
      }),
    (e) => /** @type {{ code?: string }} */ (e).code === "CORPUS_SWEEP_STATE_IO",
  );
});
