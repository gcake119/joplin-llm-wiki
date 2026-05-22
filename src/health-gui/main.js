import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";
import YAML from "yaml";

import {
  mergeMvpFields,
  readConfigFileUtf8,
  readGuiFieldsLenient,
  saveConfigValidated,
} from "./config/config-coordinator.js";
import { loadConfig } from "../config/load-config.js";
import { buildHealthSnapshot } from "./health-snapshot.js";
import { findRepoRoot } from "./lib/repo-root.js";
import { startLocalDependency } from "./deps/dependency-starter.js";
import {
  runCorpusPipeline,
  runInitPipeline,
  runLintWorkflow,
  runQueryWorkflow,
  runSnapshotPipeline,
} from "./corpus/corpus-pipeline-runner.js";
import { runStackScript } from "./stack/stack-script-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(__dirname);

/**
 * @param {string[]} argv
 */
function parseConfigArg(argv) {
  const i = argv.indexOf("--config");
  if (i === -1 || !argv[i + 1]) return null;
  return path.resolve(argv[i + 1]);
}

const rawConfig = parseConfigArg(process.argv.slice(1));
if (!rawConfig) {
  console.error("joplin-llm-wiki-health-gui: missing --config <path>");
  process.exit(1);
}
const configPath = path.resolve(rawConfig);

function wireIpc() {
  ipcMain.handle("get-meta", async () => ({
    configPath,
    repoRoot,
  }));

  ipcMain.handle("check-health", async () => buildHealthSnapshot(configPath));

  ipcMain.handle("read-config", async () => readConfigFileUtf8(configPath));

  ipcMain.handle("load-config-fields", async () => {
    try {
      const cfg = await loadConfig(configPath);
      return {
        ok: true,
        fields: {
          raw: cfg.raw,
          wiki: cfg.wiki,
          ollama_base_url: cfg.ollama.base_url,
          ollama_chat_model: cfg.ollama.chat_model,
          joplin_data_api_base_url: cfg.joplin_data_api.base_url,
          joplin_wiki_writeback_enabled: cfg.joplin_wiki_writeback.enabled,
          artifacts_project_notebook_title:
            cfg.joplin_wiki_writeback.artifacts_project_notebook_title,
        },
      };
    } catch (e) {
      const code = /** @type {Error & { code?: string }} */ (e).code;
      const msg = String(/** @type {Error} */ (e).message);
      if (code === "CONFIG_INVALID" && msg.includes("legacy config keys")) {
        const cur = readConfigFileUtf8(configPath);
        if (cur.ok) {
          try {
            const doc = YAML.parse(cur.yamlText) ?? {};
            if (typeof doc === "object" && doc !== null && !Array.isArray(doc)) {
              return {
                ok: true,
                repairMode: true,
                message: msg,
                fields: readGuiFieldsLenient(
                  /** @type {Record<string, unknown>} */ (doc),
                ),
              };
            }
          } catch {
            /* fall through to regular error */
          }
        }
      }
      return {
        ok: false,
        code: code ?? "CONFIG_INVALID",
        message: msg,
      };
    }
  });

  ipcMain.handle("save-config", async (_evt, yamlText) => {
    if (typeof yamlText !== "string") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "yamlText must be a string",
      };
    }
    return saveConfigValidated(configPath, yamlText);
  });

  ipcMain.handle("save-config-fields", async (_evt, fields) => {
    if (!fields || typeof fields !== "object") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "fields must be an object",
      };
    }
    const f = /** @type {Record<string, unknown>} */ (fields);
    const raw = f.raw;
    const wiki = f.wiki;
    const ollama_base_url = f.ollama_base_url;
    const ollama_chat_model = f.ollama_chat_model;
    const required = {
      raw,
      wiki,
      ollama_base_url,
      ollama_chat_model,
    };
    for (const [k, v] of Object.entries(required)) {
      if (typeof v !== "string" || v.trim() === "") {
        return {
          ok: false,
          code: "BAD_REQUEST",
          message: `missing string field: ${k}`,
        };
      }
    }
    const cur = readConfigFileUtf8(configPath);
    if (!cur.ok) return cur;
    let doc;
    try {
      doc = YAML.parse(cur.yamlText);
    } catch (e) {
      return {
        ok: false,
        code: "CONFIG_INVALID",
        message: String(/** @type {Error} */ (e).message),
      };
    }
    const yamlText = mergeMvpFields(doc, {
      raw: /** @type {string} */ (raw),
      wiki: /** @type {string} */ (wiki),
      ollama_base_url: /** @type {string} */ (ollama_base_url),
      ollama_chat_model: /** @type {string} */ (ollama_chat_model),
      joplin_data_api_base_url:
        typeof f.joplin_data_api_base_url === "string"
          ? f.joplin_data_api_base_url.trim()
          : "",
      artifacts_project_notebook_title:
        typeof f.artifacts_project_notebook_title === "string"
          ? f.artifacts_project_notebook_title.trim()
          : "",
      joplin_wiki_writeback_enabled:
        f.joplin_wiki_writeback_enabled === true ||
        f.joplin_wiki_writeback_enabled === "true",
    });
    return saveConfigValidated(configPath, yamlText);
  });

  ipcMain.handle("list-notebooks", async () => {
    return listNotebooksViaCli(repoRoot, configPath);
  });

  ipcMain.handle("save-notebook-filter", async (_evt, payload) => {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.ids)) {
      return { ok: false, code: "BAD_REQUEST", message: "ids array required" };
    }
    const cur = readConfigFileUtf8(configPath);
    if (!cur.ok) return cur;
    let doc;
    try {
      doc = YAML.parse(cur.yamlText) ?? {};
    } catch (e) {
      return { ok: false, code: "CONFIG_INVALID", message: String(/** @type {Error} */ (e).message) };
    }
    const root = /** @type {Record<string, unknown>} */ (doc);
    const sync =
      typeof root.joplin_sqlite_sync === "object" && root.joplin_sqlite_sync !== null
        ? /** @type {Record<string, unknown>} */ (root.joplin_sqlite_sync)
        : {};
    sync.notebook_filter = {
      ...(typeof sync.notebook_filter === "object" && sync.notebook_filter !== null
        ? /** @type {Record<string, unknown>} */ (sync.notebook_filter)
        : {}),
      enabled: true,
      include_notebook_ids: payload.ids.filter((x) => typeof x === "string"),
      include_notebook_paths: [],
      include_descendants: true,
      notebook_path_style: "joined_slug",
      notebook_path_separator: "-",
      source_filename: "title",
    };
    root.joplin_sqlite_sync = sync;
    return saveConfigValidated(configPath, YAML.stringify(root));
  });

  ipcMain.handle("run-stack-script", async (_evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        exitCode: null,
        stdoutTail: "",
        stderrTail: "",
      };
    }
    return runStackScript(repoRoot, configPath, /** @type {*} */ (payload));
  });

  ipcMain.handle("run-init-pipeline", async (evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        sqliteSync: {
          exitCode: null,
          stdoutTail: "",
          stderrTail: "",
          skipped: false,
        },
        wikiCompile: { exitCode: null, stdoutTail: "", stderrTail: "" },
      };
    }
    const sender = evt.sender;
    return runInitPipeline(
      repoRoot,
      configPath,
      /** @type {*} */ (payload),
      spawn,
      {},
      (p) => {
        try {
          sender.send("pipeline-progress", p);
        } catch {
          /* closed */
        }
      },
    );
  });

  ipcMain.handle("run-corpus-pipeline", async (evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        wikiCompile: { exitCode: null, stdoutTail: "", stderrTail: "" },
      };
    }
    const sender = evt.sender;
    return runCorpusPipeline(
      repoRoot,
      configPath,
      /** @type {*} */ (payload),
      spawn,
      (p) => {
        try {
          sender.send("pipeline-progress", p);
        } catch {
          /* closed */
        }
      },
    );
  });

  ipcMain.handle("run-snapshot-pipeline", async (evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        sqliteSync: {
          exitCode: null,
          stdoutTail: "",
          stderrTail: "",
          skipped: false,
        },
      };
    }
    const sender = evt.sender;
    return runSnapshotPipeline(
      repoRoot,
      configPath,
      /** @type {*} */ (payload),
      spawn,
      (p) => {
        try {
          sender.send("pipeline-progress", p);
        } catch {
          /* closed */
        }
      },
    );
  });

  ipcMain.handle("run-query", async (_evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        query: { exitCode: null, stdoutTail: "", stderrTail: "" },
      };
    }
    return runQueryWorkflow(repoRoot, configPath, /** @type {*} */ (payload), spawn);
  });

  ipcMain.handle("run-lint", async (_evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        code: "BAD_REQUEST",
        lint: { exitCode: null, stdoutTail: "", stderrTail: "" },
      };
    }
    return runLintWorkflow(repoRoot, configPath, /** @type {*} */ (payload), spawn);
  });

  ipcMain.handle("start-local-dependency", async (_evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return { ok: false, code: "BAD_REQUEST" };
    }
    return startLocalDependency(repoRoot, configPath, /** @type {*} */ (payload));
  });
}

/**
 * Keep better-sqlite3 out of the Electron main process. Electron 33 uses its
 * own native module ABI, while the CLI uses the user's Node runtime.
 *
 * @param {string} root
 * @param {string} config
 * @returns {Promise<{ ok: boolean, code?: string, message?: string, notebooks?: unknown[], selectedIds?: string[], enabled?: boolean }>}
 */
function listNotebooksViaCli(root, config) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const outPath = path.join(
      os.tmpdir(),
      `joplin-llm-wiki-notebooks-${process.pid}-${Date.now()}.json`,
    );
    const child = spawn(
      "pnpm",
      [
        "exec",
        "joplin-llm-wiki",
        "sqlite-sync",
        "--config",
        config,
        "--list-notebooks-json=true",
        "--list-notebooks-json-out",
        outPath,
      ],
      { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on("error", (e) => {
      try {
        fs.unlinkSync(outPath);
      } catch {
        /* ignore */
      }
      resolve({
        ok: false,
        code: "SQLITE_OPEN_FAILED",
        message: String(/** @type {Error} */ (e).message ?? e),
      });
    });
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        try {
          fs.unlinkSync(outPath);
        } catch {
          /* ignore */
        }
        const line = stderr
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .at(-1);
        const parsed = parseJsonObject(line);
        resolve({
          ok: false,
          code: typeof parsed?.error === "string" ? parsed.error : "SQLITE_OPEN_FAILED",
          message:
            typeof parsed?.message === "string"
              ? parsed.message
              : stderr.slice(-1000) || `sqlite-sync exited ${exitCode}`,
        });
        return;
      }
      let fileText = "";
      try {
        fileText = fs.readFileSync(outPath, "utf8");
      } catch (e) {
        resolve({
          ok: false,
          code: "SQLITE_OPEN_FAILED",
          message: `sqlite-sync did not write notebook JSON file: ${String(
            /** @type {Error} */ (e).message ?? e,
          )}; stdout tail: ${stdout.slice(-500)}`,
        });
        return;
      } finally {
        try {
          fs.unlinkSync(outPath);
        } catch {
          /* ignore */
        }
      }
      const parsed = parseJsonObject(fileText) ?? parseNotebookPayload(stdout);
      if (!parsed || !Array.isArray(parsed.notebooks)) {
        resolve({
          ok: false,
          code: "SQLITE_OPEN_FAILED",
          message: `sqlite-sync notebook JSON was invalid; file bytes=${fileText.length}; stdout tail: ${stdout.slice(-500)}`,
        });
        return;
      }
      resolve({
        ok: true,
        notebooks: parsed.notebooks,
        selectedIds: Array.isArray(parsed.selectedIds)
          ? parsed.selectedIds.filter((x) => typeof x === "string")
          : [],
        enabled: parsed.enabled === true,
      });
    });
  });
}

/**
 * @param {string | undefined} line
 * @returns {Record<string, unknown> | null}
 */
function parseJsonObject(line) {
  if (!line) return null;
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? /** @type {Record<string, unknown>} */ (parsed)
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} stdout
 * @returns {Record<string, unknown> | null}
 */
function parseNotebookPayload(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = parseJsonObject(lines[i]);
    if (parsed && Array.isArray(parsed.notebooks)) return parsed;
  }
  return null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

wireIpc();

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
