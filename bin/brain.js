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

const subcommand = process.argv[2] ?? "update";

if (!Object.hasOwn(commands, subcommand)) {
  console.error("Usage: brain [update|sync|compile]");
  process.exit(1);
}

const first = spawnSync(
  process.execPath,
  [path.join(root, "bin", "joplin-llm-wiki.js"), ...commands[subcommand]],
  { cwd: root, stdio: "inherit" },
);

if (first.status !== 0) {
  process.exit(first.status ?? 1);
}

if (subcommand !== "update") {
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
