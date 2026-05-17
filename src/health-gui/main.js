import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";
import YAML from "yaml";

import {
  mergeMvpFields,
  readConfigFileUtf8,
  saveConfigValidated,
} from "./config/config-coordinator.js";
import { loadConfig } from "../config/load-config.js";
import { buildHealthSnapshot } from "./health-snapshot.js";
import { findRepoRoot } from "./lib/repo-root.js";
import { startLocalDependency } from "./deps/dependency-starter.js";
import { runCorpusPipeline, runInitPipeline } from "./corpus/corpus-pipeline-runner.js";
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
    chromaHost: process.env.CHROMA_HOST ?? "127.0.0.1",
    chromaPort: process.env.CHROMA_PORT ?? "8000",
  }));

  ipcMain.handle("check-health", async () => buildHealthSnapshot(configPath));

  ipcMain.handle("read-config", async () => readConfigFileUtf8(configPath));

  ipcMain.handle("load-config-fields", async () => {
    try {
      const cfg = await loadConfig(configPath);
      return {
        ok: true,
        fields: {
          notes_root: cfg.notes_root,
          ollama_base_url: cfg.ollama.base_url,
          ollama_embed_model: cfg.ollama.embed_model,
          ollama_chat_model: cfg.ollama.chat_model,
          chroma_persist_path: cfg.chroma.persist_path,
        },
      };
    } catch (e) {
      const code = /** @type {Error & { code?: string }} */ (e).code;
      return {
        ok: false,
        code: code ?? "CONFIG_INVALID",
        message: String(/** @type {Error} */ (e).message),
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
    const notes_root = f.notes_root;
    const ollama_base_url = f.ollama_base_url;
    const ollama_embed_model = f.ollama_embed_model;
    const ollama_chat_model = f.ollama_chat_model;
    const chroma_persist_path = f.chroma_persist_path;
    for (const [k, v] of Object.entries({
      notes_root,
      ollama_base_url,
      ollama_embed_model,
      ollama_chat_model,
      chroma_persist_path,
    })) {
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
      notes_root: /** @type {string} */ (notes_root),
      ollama_base_url: /** @type {string} */ (ollama_base_url),
      ollama_embed_model: /** @type {string} */ (ollama_embed_model),
      ollama_chat_model: /** @type {string} */ (ollama_chat_model),
      chroma_persist_path: /** @type {string} */ (chroma_persist_path),
    });
    return saveConfigValidated(configPath, yamlText);
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
        index: { exitCode: null, stdoutTail: "", stderrTail: "" },
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
        index: { exitCode: null, stdoutTail: "", stderrTail: "" },
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

  ipcMain.handle("start-local-dependency", async (_evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return { ok: false, code: "BAD_REQUEST" };
    }
    return startLocalDependency(repoRoot, configPath, /** @type {*} */ (payload));
  });
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
