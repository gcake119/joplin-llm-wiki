import { loadConfig } from "../config/load-config.js";
import { createVectorStore } from "../vector/store-factory.js";
import { OllamaClient } from "../ollama/client.js";
import {
  retrieveForRag,
  buildGroundedPrompt,
} from "../rag/rag-service.js";
import path from "node:path";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runAsk(ctx) {
  const question = ctx.argv.join(" ").trim();
  if (!question) {
    console.error(
      JSON.stringify({
        error: "QUERY_EMPTY",
        message: "question text required",
      }),
    );
    return 1;
  }

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

  const { chunks } = await retrieveForRag({
    cfg,
    chroma,
    ollama,
    question,
  });
  if (chunks.length === 0) {
    console.error(
      JSON.stringify({
        error: "EMPTY_CORPUS",
        message: "retrieval returned zero chunks",
      }),
    );
    return 1;
  }

  const grounded = buildGroundedPrompt(
    { chunks },
    cfg.rag.max_context_chars,
  );
  const prompt = `${grounded}\n\nQUESTION:\n${question}\n`;
  const answer = await ollama.chatComplete({
    prompt,
    jsonMode: false,
    timeoutMs: cfg.ollama.timeout_ms,
  });

  const sources = chunks.map((c) => ({
    relative_path: c.relative_path,
    layer: c.layer,
  }));

  console.log(answer.trim());
  console.log(`SOURCES ${JSON.stringify(sources)}`);
  return 0;
}
