import assert from "node:assert";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { runStageAction } from "../../src/health-gui/corpus/corpus-pipeline-runner.js";

const repoRoot = "/repo/abs";
const cfgAbs = "/tmp/fixture/cfg.yaml";

function makeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  return c;
}

const expectedActions = [
  [
    "concept-resume-dry-run",
    ["wiki-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "concepts", "--dry-run"],
  ],
  [
    "concept-resume-run",
    ["wiki-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "concepts"],
  ],
  [
    "agent-concept-resume-dry-run",
    ["agent-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "concepts", "--dry-run"],
  ],
  [
    "agent-concept-resume-run",
    ["agent-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "concepts"],
  ],
  [
    "writeback-resume-dry-run",
    ["wiki-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "writeback", "--dry-run"],
  ],
  [
    "writeback-resume-run",
    ["wiki-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "writeback"],
  ],
  [
    "agent-writeback-resume-dry-run",
    ["agent-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "writeback", "--dry-run"],
  ],
  [
    "agent-writeback-resume-run",
    ["agent-compile", "--config", path.resolve(cfgAbs), "--resume-stage", "writeback"],
  ],
];

for (const [kind, expectedTail] of expectedActions) {
  test(`GUI stage action ${kind} spawns fixed argv`, async () => {
    const calls = [];
    const spawnImpl = (cmd, args, opts) => {
      calls.push({ cmd, args: [...args], cwd: opts.cwd });
      const c = makeChild();
      queueMicrotask(() => c.emit("close", 0));
      return c;
    };

    const r = await runStageAction(repoRoot, cfgAbs, { kind, confirmed: true }, spawnImpl);

    assert.equal(r.ok, true);
    assert.equal(r.code, "OK");
    assert.equal(calls[0].cmd, "pnpm");
    assert.deepEqual(calls[0].args, ["exec", "joplin-llm-wiki", ...expectedTail]);
    assert.equal(calls[0].cwd, path.resolve(repoRoot));
  });
}

test("GUI stage actions share single-flight guard", async () => {
  const children = [];
  const spawnImpl = () => {
    const c = makeChild();
    children.push(c);
    return c;
  };
  const p1 = runStageAction(
    repoRoot,
    cfgAbs,
    { kind: "concept-resume-dry-run", confirmed: true },
    spawnImpl,
  );
  await new Promise((res) => setImmediate(res));

  const r2 = await runStageAction(
    repoRoot,
    cfgAbs,
    { kind: "agent-writeback-resume-run", confirmed: true },
    spawnImpl,
  );
  assert.equal(r2.ok, false);
  assert.equal(r2.code, "PIPELINE_IN_FLIGHT");
  assert.equal(children.length, 1);
  children[0].emit("close", 0);
  assert.equal((await p1).ok, true);
});

test("GUI stage action exposes parsed staged telemetry", async () => {
  const spawnImpl = () => {
    const c = makeChild();
    queueMicrotask(() => {
      c.stdout.emit(
        "data",
        `${JSON.stringify({
          compile_adapter: "agent",
          resume_stage: "concepts",
          changed_summary_paths: ["summaries/a.md"],
          concept_paths_written: ["concepts/topic.md"],
          writeback_relpaths: ["concepts/topic.md", "indexes/All-Concepts.md"],
          writeback_collision_count: 0,
          writeback_orphan_candidate_count: 1,
        })}\n`,
      );
      c.emit("close", 0);
    });
    return c;
  };

  const r = await runStageAction(
    repoRoot,
    cfgAbs,
    { kind: "agent-concept-resume-run", confirmed: true },
    spawnImpl,
  );

  assert.equal(r.ok, true);
  assert.equal(r.stageJson.compile_adapter, "agent");
  assert.equal(r.stageJson.resume_stage, "concepts");
  assert.deepEqual(r.stageJson.concept_paths_written, ["concepts/topic.md"]);
  assert.deepEqual(r.stageJson.writeback_relpaths, [
    "concepts/topic.md",
    "indexes/All-Concepts.md",
  ]);
  assert.equal(r.stageJson.writeback_orphan_candidate_count, 1);
});

test("GUI visible identity is Joplin-LLM-wiki tool", () => {
  const html = fs.readFileSync(
    path.resolve("src/health-gui/renderer/index.html"),
    "utf8",
  );
  assert.match(html, /<title>Joplin-LLM-wiki tool<\/title>/);
  assert.match(html, /<h1>Joplin-LLM-wiki tool<\/h1>/);
});
