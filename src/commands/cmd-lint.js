import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { createVectorStore } from "../vector/store-factory.js";
import { OllamaClient } from "../ollama/client.js";
import { runKarpathyLint } from "../lint/karpathy-lint-engine.js";
import { writeLintReports } from "../report/report-writer.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runLint(ctx) {
  const cfg = await loadConfig(ctx.configPath);
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

  const payload = await runKarpathyLint({ cfg, chroma, ollama });
  const strictPayload = {
    duplicates: payload.duplicates,
    orphans: payload.orphans,
    contradictions: payload.contradictions,
    wiki_orphans: payload.wiki_orphans,
    schema_gaps: payload.schema_gaps,
    skipped_notes: payload.skipped_notes,
  };

  console.log(JSON.stringify(strictPayload, null, 2));

  writeLintReports({
    outDir: cfg.lint.out_dir,
    stem: "karpathy-lint",
    payload: strictPayload,
  });

  return 0;
}
