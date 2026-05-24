import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "vitest";
import assert from "node:assert";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin/joplin-llm-wiki.js");

test("joplin-llm-wiki --help exits 0", () => {
  const out = execFileSync(process.execPath, [cli, "--help"], {
    encoding: "utf8",
    cwd: root,
  });
  assert.match(out, /joplin-llm-wiki/i);
});

test("wiki-compile --help mentions full-library default and batch fallback", () => {
  const out = execFileSync(process.execPath, [cli, "wiki-compile", "--help"], {
    encoding: "utf8",
    cwd: root,
  });
  assert.match(out, /defaults to a full-library corpus sweep/i);
  assert.match(out, /--batch=true\|false/);
});

test("wiki-compile and agent-compile help document staged concept and writeback resume", () => {
  const wikiOut = execFileSync(process.execPath, [cli, "wiki-compile", "--help"], {
    encoding: "utf8",
    cwd: root,
  });
  const agentOut = execFileSync(process.execPath, [cli, "agent-compile", "--help"], {
    encoding: "utf8",
    cwd: root,
  });

  for (const out of [wikiOut, agentOut]) {
    assert.match(out, /--resume-stage concepts\|writeback/);
    assert.match(out, /concepts.*local/i);
    assert.match(out, /writeback.*Joplin/i);
  }
});
