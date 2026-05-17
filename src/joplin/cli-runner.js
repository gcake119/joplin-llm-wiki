import { spawn } from "node:child_process";

/**
 * Run Joplin CLI with `cfg.joplin_cli.command` as executable and `argvArgs` as arguments
 * (e.g. `['ls','/','-f','json']`). Collects stdout/stderr; rejects on non-zero exit, timeout, or spawn error.
 *
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string[]} argvArgs
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export async function runJoplinCliProcess(cfg, argvArgs) {
  const cmd = cfg.joplin_cli.command;
  const timeoutMs = cfg.joplin_cli.timeout_ms;

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, argvArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(t);
      reject(cliFail(`spawn failed: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          cliFail(
            `exit ${code}${stderr ? `: ${stderr.trim()}` : ""}${stdout ? `; out: ${stdout.slice(0, 500)}` : ""}`,
          ),
        );
    });
  });
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export async function runJoplinCliPreflight(cfg) {
  if (!cfg.joplin_cli.enabled) return;
  await runJoplinCliProcess(cfg, cfg.joplin_cli.preflight_argv);
}

/**
 * @param {string} message
 */
function cliFail(message) {
  const err = new Error(message);
  /** @type {Error & { code?: string }} */ (err).code = "JOPLIN_CLI_FAILED";
  return err;
}
