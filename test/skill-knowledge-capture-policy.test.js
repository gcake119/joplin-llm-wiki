import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("knowledge-capture-policy skill defines signal levels, templates, and gates", () => {
  const text = readRepoFile(".agents/skills/knowledge-capture-policy/SKILL.md");

  assert.match(text, /name: knowledge-capture-policy/);
  assert.match(text, /## Signal Levels/);
  assert.match(text, /### Strong Signal/);
  assert.match(text, /### Medium Signal/);
  assert.match(text, /### Low Signal/);
  assert.match(text, /## Pending Capture Template/);
  assert.match(text, /## Safety And Confirmation Gates/);
  assert.match(text, /joplin_brainstorm/);
  assert.match(text, /joplin_query/);
  assert.match(text, /joplin_confirm_capture/);
  assert.match(text, /capture_draft_id/);
  assert.match(text, /Do not call joplin_confirm_capture automatically/);
  assert.match(text, /Do not write files directly/);
});

test("joplin-knowledge-flow skill points other skills to the capture policy", () => {
  const text = readRepoFile(".agents/skills/joplin-knowledge-flow/SKILL.md");

  assert.match(text, /knowledge-capture-policy/);
  assert.match(text, /Capture Policy Integration/);
  assert.match(text, /strong signal/i);
  assert.match(text, /medium signal/i);
  assert.match(text, /MCP tools are not available/);
  assert.match(text, /Do not silently replace this workflow with ad hoc file writes/);
});

test("spectra archive skill creates only a pending capture after archive success", () => {
  const text = readRepoFile(".agents/skills/spectra-archive/SKILL.md");

  assert.match(text, /Knowledge Capture Hook/);
  assert.match(text, /After displaying the archive completion summary/);
  assert.match(text, /joplin_brainstorm/);
  assert.match(text, /capture_draft_id/);
  assert.match(text, /Do not call joplin_confirm_capture automatically/);
});

test("spectra debug skill captures verified root cause after the fix phase", () => {
  const text = readRepoFile(".agents/skills/spectra-debug/SKILL.md");

  assert.match(text, /Knowledge Capture Hook/);
  assert.match(text, /After the fix is verified/);
  assert.match(text, /root cause/i);
  assert.match(text, /joplin_brainstorm/);
  assert.match(text, /capture_draft_id/);
  assert.match(text, /Do not call joplin_confirm_capture automatically/);
});
