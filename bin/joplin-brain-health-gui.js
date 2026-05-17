#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
/** @type {string} */
const electronPath = require("electron");

function parseConfig(argv) {
  const i = argv.indexOf("--config");
  if (i === -1 || !argv[i + 1]) return null;
  const raw = argv[i + 1];
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

const configPath = parseConfig(process.argv.slice(2));
if (!configPath) {
  console.error("joplin-brain-health-gui: --config <path> is required");
  process.exit(1);
}

const mainJs = path.join(repoRoot, "src", "health-gui", "main.js");

const child = spawn(electronPath, [mainJs, "--config", configPath], {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env },
});

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
