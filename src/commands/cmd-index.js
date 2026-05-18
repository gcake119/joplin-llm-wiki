import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { createVectorStore } from "../vector/store-factory.js";
import { OllamaClient } from "../ollama/client.js";
import { indexAll } from "../index/indexer.js";
import { runJoplinDataApiPreflight } from "../joplin/data-api-client.js";

/**
 * 若 collection 內已有向量，維度須與目前 `ollama.embed_model` 一致；否則首次 upsert 才由 Chroma 回錯。
 *
 * @param {{
 *   peek: (layer: 'source'|'wiki', limit: number) => Promise<{
 *     embeddings?: (number[] | null)[] | null,
 *   }>,
 * }} chroma
 * @param {import('../ollama/client.js').OllamaClient} ollama
 */
async function assertChromaMatchesOllamaEmbedding(chroma, ollama) {
  const probe = await ollama.embedBatch(["."]);
  const dim = probe[0]?.length ?? 0;
  if (!dim) {
    const err = new Error(
      "Ollama returned an empty embedding for dimension probe.",
    );
    /** @type {Error & { code?: string }} */ (err).code = "OLLAMA_UNAVAILABLE";
    throw err;
  }
  for (const layer of /** @type {const} */ (["source", "wiki"])) {
    let snap;
    try {
      snap = await chroma.peek(layer, 1);
    } catch {
      continue;
    }
    const first = snap?.embeddings?.[0];
    if (Array.isArray(first) && first.length > 0 && first.length !== dim) {
      const err = new Error(
        `Chroma ${layer} collection stores dimension ${first.length} but current ollama.embed_model produced ${dim}. Clear chroma.persist_path or use new collection_sources/collection_wiki names, then re-index.`,
      );
      /** @type {Error & { code?: string }} */ (err).code = "CHROMA_ERROR";
      throw err;
    }
  }
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export async function createIndexRuntime(cfg) {
  if (cfg.joplin_wiki_writeback.enabled) {
    await runJoplinDataApiPreflight(cfg);
  }

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

  await assertChromaMatchesOllamaEmbedding(chroma, ollama);

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
