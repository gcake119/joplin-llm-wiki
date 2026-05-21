import fs from "node:fs";
import path from "node:path";

import YAML from "yaml";

import { loadConfig } from "../../config/load-config.js";

/**
 * @param {string} configPath
 */
export function readConfigFileUtf8(configPath) {
  const abs = path.resolve(configPath);
  try {
    const yamlText = fs.readFileSync(abs, "utf8");
    return { ok: true, yamlText };
  } catch (e) {
    return {
      ok: false,
      code: "CONFIG_INVALID",
      message: String(/** @type {{ message?: string }} */ (e)?.message ?? e),
    };
  }
}

/**
 * Best-effort field extraction for GUI repair mode. This intentionally accepts
 * legacy keys so the settings form can load and save a cleaned config.
 *
 * @param {Record<string, unknown>} doc
 */
export function readGuiFieldsLenient(doc) {
  const raw =
    typeof doc.raw === "string" ? doc.raw
    : typeof doc.notes_root === "string" ? doc.notes_root
    : "./raw";
  const wiki =
    typeof doc.wiki === "string" ? doc.wiki
    : typeof doc.wiki_root === "string" ? doc.wiki_root
    : "./wiki";
  const ollama =
    typeof doc.ollama === "object" && doc.ollama !== null
      ? /** @type {Record<string, unknown>} */ (doc.ollama)
      : {};
  const api =
    typeof doc.joplin_data_api === "object" && doc.joplin_data_api !== null
      ? /** @type {Record<string, unknown>} */ (doc.joplin_data_api)
      : {};
  const wb =
    typeof doc.joplin_wiki_writeback === "object" &&
    doc.joplin_wiki_writeback !== null
      ? /** @type {Record<string, unknown>} */ (doc.joplin_wiki_writeback)
      : {};
  return {
    raw,
    wiki,
    ollama_base_url:
      typeof ollama.base_url === "string" ?
        ollama.base_url
      : "http://127.0.0.1:11434",
    ollama_chat_model:
      typeof ollama.chat_model === "string" ? ollama.chat_model : "gemma2:2b",
    joplin_data_api_base_url:
      typeof api.base_url === "string" ? api.base_url : "http://127.0.0.1:41184",
    joplin_wiki_writeback_enabled: wb.enabled !== false,
    artifacts_project_notebook_title:
      typeof wb.artifacts_project_notebook_title === "string" ?
        wb.artifacts_project_notebook_title
      : "",
  };
}

/**
 * Write candidate YAML to a temp file, validate with loadConfig, then replace target.
 * @param {string} configPath
 * @param {string} yamlText
 */
export async function saveConfigValidated(configPath, yamlText) {
  const abs = path.resolve(configPath);
  const dir = path.dirname(abs);
  const base = path.basename(abs);
  const tmp = path.join(dir, `.${base}.jb-health.tmp.yaml`);
  fs.writeFileSync(tmp, yamlText, "utf8");
  try {
    await loadConfig(tmp);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    const code = /** @type {Error & { code?: string }} */ (e).code;
    return {
      ok: false,
      code: code ?? "CONFIG_INVALID",
      message: String(/** @type {Error} */ (e).message ?? e),
    };
  }
  try {
    fs.copyFileSync(tmp, abs);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      code: "SAVE_FAILED",
      message: String(/** @type {{ message?: string }} */ (e)?.message ?? e),
    };
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

/**
 * Merge MVP form fields into an existing parsed config document and stringify.
 * Preserves keys not listed here at top-level / nested objects shallow merge for ollama only.
 *
 * @param {Record<string, unknown>} doc
 * @param {{
 *   raw: string,
 *   wiki: string,
 *   ollama_base_url: string,
 *   ollama_chat_model: string,
 *   joplin_data_api_base_url?: string,
 *   artifacts_project_notebook_title?: string,
 *   joplin_wiki_writeback_enabled?: boolean,
 * }} fields
 */
export function mergeMvpFields(doc, fields) {
  const raw =
    doc !== undefined && doc !== null && typeof doc === "object"
      ? YAML.stringify(doc)
      : "{}";
  const out = /** @type {Record<string, unknown>} */ (YAML.parse(raw));
  removeLegacyKeys(out);
  out.raw = fields.raw;
  out.wiki = fields.wiki;
  const ollama =
    typeof out.ollama === "object" && out.ollama !== null
      ? /** @type {Record<string, unknown>} */ (out.ollama)
      : {};
  ollama.base_url = fields.ollama_base_url;
  ollama.chat_model = fields.ollama_chat_model;
  out.ollama = ollama;

  const api =
    typeof out.joplin_data_api === "object" && out.joplin_data_api !== null
      ? /** @type {Record<string, unknown>} */ (out.joplin_data_api)
      : {};
  if (fields.joplin_data_api_base_url) {
    api.base_url = fields.joplin_data_api_base_url;
  }
  out.joplin_data_api = api;

  const wb =
    typeof out.joplin_wiki_writeback === "object" &&
    out.joplin_wiki_writeback !== null
      ? /** @type {Record<string, unknown>} */ (out.joplin_wiki_writeback)
      : {};
  if (typeof fields.joplin_wiki_writeback_enabled === "boolean") {
    wb.enabled = fields.joplin_wiki_writeback_enabled;
  }
  if (typeof fields.artifacts_project_notebook_title === "string") {
    wb.artifacts_project_notebook_title = fields.artifacts_project_notebook_title;
  }
  out.joplin_wiki_writeback = wb;
  return YAML.stringify(out);
}

/** @param {Record<string, unknown>} out */
function removeLegacyKeys(out) {
  for (const key of [
    "notes_root",
    "notes_glob",
    "wiki_root",
    "chroma",
    "chunk",
    "rag",
    "watch",
  ]) {
    delete out[key];
  }

  const ollama =
    typeof out.ollama === "object" && out.ollama !== null
      ? /** @type {Record<string, unknown>} */ (out.ollama)
      : null;
  if (ollama) {
    delete ollama.embed_model;
    delete ollama.embed_batch_size;
  }

  const ingest =
    typeof out.wiki_ingest === "object" && out.wiki_ingest !== null
      ? /** @type {Record<string, unknown>} */ (out.wiki_ingest)
      : null;
  if (ingest) {
    delete ingest.corpus_chroma_top_k;
  }

  const sync =
    typeof out.joplin_sqlite_sync === "object" && out.joplin_sqlite_sync !== null
      ? /** @type {Record<string, unknown>} */ (out.joplin_sqlite_sync)
      : null;
  const pipeline =
    sync && typeof sync.pipeline === "object" && sync.pipeline !== null
      ? /** @type {Record<string, unknown>} */ (sync.pipeline)
      : null;
  if (pipeline) {
    delete pipeline.run_index;
  }
}
