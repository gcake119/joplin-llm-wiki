import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * @returns {Promise<{ port: number, persist: string, proc: import('child_process').ChildProcess }>}
 */
export async function startTestChromaServer() {
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), "jb-chroma-"));
  const port = 8800 + Math.floor(Math.random() * 700);
  const chromaBin = path.resolve(process.cwd(), "node_modules/.bin/chroma");

  const proc = spawn(
    chromaBin,
    ["run", "--path", persist, "--host", "127.0.0.1", "--port", String(port)],
    { stdio: "ignore" },
  );

  const heartbeatUrl = `http://127.0.0.1:${port}/api/v2/heartbeat`;

  let lastErr;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(heartbeatUrl, { method: "GET" });
      if (!res.ok)
        throw new Error(`${res.status}: ${await res.text().catch(() => "")}`);
      return { port, persist, proc };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  try {
    proc.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  throw new Error(`chroma server failed to start: ${lastErr}`);
}

/**
 * @param {import('child_process').ChildProcess} proc
 */
export function stopProcess(proc) {
  try {
    proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}
