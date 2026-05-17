import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
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
