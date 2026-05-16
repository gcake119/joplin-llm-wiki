import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { createVectorStore } from "../vector/store-factory.js";
import { OllamaClient } from "../ollama/client.js";
import { indexAll } from "../index/indexer.js";
import { runJoplinCliPreflight } from "../joplin/cli-runner.js";

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export async function createIndexRuntime(cfg) {
  await runJoplinCliPreflight(cfg);

  const chroma = await createVectorStore({
    persistPath: cfg.chroma.persist_path,
    sourcesCollection: cfg.chroma.collection_sources,
    wikiCollection: cfg.chroma.collection_wiki,
  });

  try {
    await chroma.heartbeat();
    await chroma.initCollections();
  } catch (e) {
    const err = new Error(
      `Chroma unavailable (${e?.message ?? e}). Start a local server: pnpm exec chroma run --path ${path.resolve(cfg.chroma.persist_path)}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "CHROMA_ERROR";
    throw err;
  }

  const ollama = new OllamaClient({
    baseUrl: cfg.ollama.base_url,
    embedModel: cfg.ollama.embed_model,
    chatModel: cfg.ollama.chat_model,
    timeoutMs: cfg.ollama.timeout_ms,
    embedBatchSize: cfg.ollama.embed_batch_size,
  });

  return { chroma, ollama };
}

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runIndex(ctx) {
  const cfg = await loadConfig(ctx.configPath);
  const { chroma, ollama } = await createIndexRuntime(cfg);

  const summary = await indexAll(cfg, chroma, ollama);
  console.log(
    JSON.stringify({
      indexed_files: summary.indexed_files,
      chunks_upserted: summary.chunks_upserted,
      chunks_skipped_embed: summary.chunks_skipped_embed,
      skipped_notes: summary.skipped_notes,
    }),
  );
  return 0;
}
