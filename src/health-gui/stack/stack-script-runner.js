import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** @type {Record<string, string>} */
export const STACK_SCRIPT_REL = {
  "install-stack": "scripts/launchd/install-joplin-brain-stack.sh",
  "uninstall-stack": "scripts/launchd/uninstall-joplin-brain-stack.sh",
};

/**
 * @param {string} s
 */
export function tail512(s) {
  if (s.length <= 512) return s;
  return s.slice(-512);
}

/**
 * @param {string} repoRoot
 * @param {string} configPathAbs 目前 GUI 啟動時的 config.yaml 絕對路徑（install 腳本必填；uninstall 會忽略多餘參數）
 * @param {{ kind: string, confirmed?: boolean }} payload
 * @param {typeof spawn} [spawnImpl]
 */
export function runStackScript(repoRoot, configPathAbs, payload, spawnImpl = spawn) {
  if (payload.confirmed !== true) {
    return Promise.resolve({
      ok: false,
      code: "CONFIRMATION_REQUIRED",
      exitCode: null,
      stdoutTail: "",
      stderrTail: "",
    });
  }
  const rel = STACK_SCRIPT_REL[/** @type {keyof typeof STACK_SCRIPT_REL} */ (payload.kind)];
  if (!rel) {
    return Promise.resolve({
      ok: false,
      code: "UNKNOWN_KIND",
      exitCode: null,
      stdoutTail: "",
      stderrTail: "",
    });
  }
  const root = path.resolve(repoRoot);
  const configAbs = path.resolve(configPathAbs);
  const scriptPath = path.join(root, rel);
  if (!fs.existsSync(scriptPath)) {
    return Promise.resolve({
      ok: false,
      code: "SCRIPT_MISSING",
      exitCode: null,
      stdoutTail: "",
      stderrTail: "",
    });
  }

  return new Promise((resolve) => {
    let out = "";
    let err = "";
    // install-joplin-brain-stack.sh 需要 <abs-repo> <abs-config.yaml>（或對應環境變數）
    const child = spawnImpl("bash", [scriptPath, root, configAbs], {
      cwd: root,
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
        code: "SPAWN_ERROR",
        exitCode: null,
        stdoutTail: tail512(out),
        stderrTail: tail512(err + String(/** @type {Error} */ (e).message)),
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        ok: exitCode === 0,
        code: exitCode === 0 ? "OK" : "SCRIPT_FAILED",
        exitCode,
        stdoutTail: tail512(out),
        stderrTail: tail512(err),
      });
    });
  });
}
