import { spawn } from "node:child_process";
import path from "node:path";

/**
 * @param {{
 *   configPath: string,
 *   subcommand: string,
 *   extraArgs?: string[],
 *   cwd?: string,
 *   spawnImpl?: typeof spawn,
 * }} args
 */
export function runKnowledgeFlowCommand(args) {
  const spawnImpl = args.spawnImpl ?? spawn;
  const cwd = args.cwd ?? path.dirname(path.resolve(args.configPath));
  const argv = [
    "exec",
    "joplin-llm-wiki",
    args.subcommand,
    "--config",
    args.configPath,
    ...(args.extraArgs ?? []),
  ];
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    const child = spawnImpl("pnpm", argv, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (c) => {
      out += String(c);
      if (out.length > 65536) out = out.slice(-65536);
    });
    child.stderr?.on("data", (c) => {
      err += String(c);
      if (err.length > 65536) err = err.slice(-65536);
    });
    child.on("error", (e) => {
      resolve({
        ok: false,
        exit_code: null,
        stdout_summary: tail(out),
        stderr_summary: tail(String(e.message || e)),
        error_code: "SPAWN_FAILED",
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        exit_code: code,
        stdout_summary: tail(out),
        stderr_summary: tail(err),
        error_code: code === 0 ? null : "COMMAND_FAILED",
      });
    });
  });
}

/** @param {string} text */
function tail(text) {
  return text.length > 8000 ? text.slice(-8000) : text;
}
