import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const installer = fs.readFileSync(path.join(root, "scripts", "install-mcp.sh"), "utf8");

test("install-mcp installs all repo-provided global skills", () => {
  assert.match(installer, /GLOBAL_SKILLS=/);
  assert.match(installer, /joplin-knowledge-flow/);
  assert.match(installer, /knowledge-capture-policy/);
  assert.match(installer, /for skill in "\$\{GLOBAL_SKILLS\[@\]\}"/);
  assert.match(installer, /print_global_skill_paths/);
  assert.match(installer, /\$HOME\/\.agents\/skills\/\$skill/);
  assert.match(installer, /\$HOME\/\.cursor\/skills\/\$skill/);
  assert.match(installer, /\$\(print_global_skill_paths\)/);
});

test("install-mcp output lists the capture policy skill", () => {
  assert.match(
    installer,
    /Installed global skill:\n\$\(\s*print_global_skill_paths\s*\)/,
  );
  assert.match(
    installer,
    /print_global_skill_paths\(\)\s*{\s*for skill in "\$\{GLOBAL_SKILLS\[@\]\}"/,
  );
});
