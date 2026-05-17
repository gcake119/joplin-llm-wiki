#!/usr/bin/env node
/**
 * pnpm does not link a workspace/root package's own `bin` into node_modules/.bin.
 * Register a tiny shim so `pnpm exec joplin-llm-wiki …` matches acceptance commands.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binDir = path.join(root, "node_modules", ".bin");
const cli = path.join(root, "bin", "joplin-llm-wiki.js");
const shim = path.join(binDir, "joplin-llm-wiki");

fs.mkdirSync(binDir, { recursive: true });

const contents = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const cli = ${JSON.stringify(cli)};
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
`;

fs.writeFileSync(shim, contents, { mode: 0o755 });

const cliHealth = path.join(root, "bin", "joplin-llm-wiki-health-gui.js");
const shimHealth = path.join(binDir, "joplin-llm-wiki-health-gui");
const contentsHealth = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const cli = ${JSON.stringify(cliHealth)};
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
`;

fs.writeFileSync(shimHealth, contentsHealth, { mode: 0o755 });
