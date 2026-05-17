/**
 * Chroma neighbor excerpt augmentation for wiki-compile writer only.
 *
 * Planner → Ollama remains HTTP chat only; this path uses embedBatch + vector
 * SDK against local persist_path (`REQ-WCC-LOCAL`, design Decision: excerpt uses
 * in-process chromadb client, not outbound Chroma HTTP).
 */

import { createVectorStore } from "../vector/store-factory.js";

/**
 * @param {unknown} detail
 */
export function emitCorpusChromaDegraded(detail) {
  console.error(
    JSON.stringify({
      warning: "CORPUS_CHROMA_DEGRADED",
      detail: String(detail),
    }),
  );
}

function normWikiRel(relPath) {
  return String(relPath).replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Optional Chroma neighbor block for wiki writer excerpt (sources collection only).
 *
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {import('../ollama/client.js').OllamaClient} ollama
 * @param {string} relPath
 * @param {{ createVectorStore?: typeof import('../vector/store-factory.js').createVectorStore }} [deps]
 * @returns {Promise<string|null>} appended markdown block body or null after degradation
 */
export async function corpusChromaAugmentFromChroma(cfg, ollama, relPath, deps) {
  const create =
    deps?.createVectorStore ??
    /** @type {typeof import('../vector/store-factory.js').createVectorStore} */ (
      createVectorStore
    );

  try {
    const store = await create({
      persistPath: cfg.chroma.persist_path,
      sourcesCollection: cfg.chroma.collection_sources,
      wikiCollection: cfg.chroma.collection_wiki,
    });
    await store.initCollections();

    /** @type {number} */
    let n;
    try {
      n = await store.count("source");
    } catch (e) {
      emitCorpusChromaDegraded(
        /** @type {Error} */ (e).message ?? e,
      );
      return null;
    }
    if (!n || n === 0) {
      emitCorpusChromaDegraded("zero_hits_or_empty_collection");
      return null;
    }

    let embedding;
    try {
      const [vec] = await ollama.embedBatch([
        normWikiRel(relPath || "index.md"),
      ]);
      embedding = vec;
      if (!embedding) throw new Error("missing embedding");
    } catch (e) {
      emitCorpusChromaDegraded(
        /** @type {Error} */ (e).message ?? e,
      );
      return null;
    }

    let res;
    try {
      res = await store.query(
        "source",
        embedding,
        cfg.wiki_ingest.corpus_chroma_top_k,
      );
    } catch (e) {
      emitCorpusChromaDegraded(
        /** @type {Error} */ (e).message ?? e,
      );
      return null;
    }

    const texts =
      Array.isArray(res.documents?.[0]) ?
        /** @type {string[]} */ (res.documents[0]).filter(
          (d) => typeof d === "string" && d.trim(),
        )
      : [];
    if (texts.length === 0) {
      emitCorpusChromaDegraded("zero_hits");
      return null;
    }

    return texts.map((t, i) => `### neighbor-${i + 1}\n\n${t}`).join("\n\n");
  } catch (e) {
    emitCorpusChromaDegraded(
      /** @type {Error} */ (e).message ?? e,
    );
    return null;
  }
}
