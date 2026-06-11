#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "config.yaml");

/** @type {Record<string, string[]>} */
const commands = {
  update: ["sqlite-sync", "--config", configPath],
  sync: ["sqlite-sync", "--config", configPath],
  compile: ["agent-compile", "--config", configPath],
};

const subcommand = process.argv[2] ?? "compile";

if (!Object.hasOwn(commands, subcommand)) {
  console.error("Usage: brain [update|sync|compile]");
  process.exit(1);
}

const first = spawnSync(
  process.execPath,
  [path.join(root, "bin", "joplin-llm-wiki.js"), ...commands[subcommand]],
  { cwd: root, encoding: "utf8" },
);

if (first.stdout) process.stdout.write(first.stdout);
if (first.stderr) process.stderr.write(first.stderr);

if (first.status !== 0) {
  process.exit(first.status ?? 1);
}

if (subcommand !== "update") {
  process.exit(0);
}

const syncSummary = parseLastJsonLine(first.stdout ?? "");
if (syncSummary?.raw_changed === false) {
  console.error("brain: raw unchanged, skip agent compile");
  process.exit(0);
}

const second = spawnSync(
  process.execPath,
  [
    path.join(root, "bin", "joplin-llm-wiki.js"),
    ...commands.compile,
  ],
  { cwd: root, stdio: "inherit" },
);

process.exit(second.status ?? 1);

/**
 * @param {string} text
 */
function parseLastJsonLine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {}
  }
  return null;
}
