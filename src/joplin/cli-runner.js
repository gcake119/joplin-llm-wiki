import { spawn } from "node:child_process";

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export async function runJoplinCliPreflight(cfg) {
  if (!cfg.joplin_cli.enabled) return;
  const cmd = cfg.joplin_cli.command;
  const argv = [cmd, ...cfg.joplin_cli.preflight_argv];
  const timeoutMs = cfg.joplin_cli.timeout_ms;

  await new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
    });
    let stderr = "";
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
      if (code === 0) resolve(undefined);
      else
        reject(
          cliFail(
            `exit ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
          ),
        );
    });
  });
}

/**
 * @param {string} message
 */
function cliFail(message) {
  const err = new Error(message);
  /** @type {Error & { code?: string }} */ (err).code = "JOPLIN_CLI_FAILED";
  return err;
}
