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
 * Preserves keys not listed here at top-level / nested objects shallow merge for ollama & chroma only.
 *
 * @param {Record<string, unknown>} doc
 * @param {{
 *   notes_root: string,
 *   ollama_base_url: string,
 *   ollama_embed_model: string,
 *   ollama_chat_model: string,
 *   chroma_persist_path: string,
 * }} fields
 */
export function mergeMvpFields(doc, fields) {
  const raw =
    doc !== undefined && doc !== null && typeof doc === "object"
      ? YAML.stringify(doc)
      : "{}";
  const out = /** @type {Record<string, unknown>} */ (YAML.parse(raw));
  out.notes_root = fields.notes_root;
  const ollama =
    typeof out.ollama === "object" && out.ollama !== null
      ? /** @type {Record<string, unknown>} */ (out.ollama)
      : {};
  ollama.base_url = fields.ollama_base_url;
  ollama.embed_model = fields.ollama_embed_model;
  ollama.chat_model = fields.ollama_chat_model;
  out.ollama = ollama;
  const chroma =
    typeof out.chroma === "object" && out.chroma !== null
      ? /** @type {Record<string, unknown>} */ (out.chroma)
      : {};
  chroma.persist_path = fields.chroma_persist_path;
  out.chroma = chroma;
  return YAML.stringify(out);
}
