import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { corpusChromaAugmentFromChroma } from "../src/wiki/corpus-chroma-excerpt.js";
import { MemoryVectorStore } from "../src/vector/memory-vector-store.js";

/**
 * @param {string} tmp
 * @param {Partial<{ corpus_chroma_top_k: number }>} [wikiIngestExtras]
 */
function minimalCorpusAugmentCfg(tmp, wikiIngestExtras = {}) {
  return {
    chroma: {
      persist_path: path.join(tmp, "chroma"),
      collection_sources: "src",
      collection_wiki: "wiki",
    },
    wiki_ingest: { corpus_chroma_top_k: 2, ...wikiIngestExtras },
  };
}

/** Embeddings seeded for `neighbor-` documents (bucket `i`). */
function seedEmbedding(bucket) {
  return Array.from(
    { length: 8 },
    (_, j) => (bucket === 1 ? 2 : 0) + Math.sin(j),
  );
}

test("corpusChromaAugmentFromChroma returns neighbor markdown from seeded MemoryVectorStore", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-corpus-chr-"));

  /** @returns {Promise<MemoryVectorStore>} */
  const factory = async (opts) => {
    const ms = new MemoryVectorStore(opts);
    const mk = [];
    /** @type {number[][]} */
    const em = [];
    /** @type {string[]} */
    const doc = [];
    /** @type {Record<string, string|number|boolean>[]} */
    const meta = [];
    for (let i = 0; i < 3; i++) {
      mk.push(`id_${i}`);
      em.push(seedEmbedding(i));
      doc.push(`CORPUS_CHROMA_STUB_LINE_${i}`);
      meta.push({ relative_path: `f${i}.md` });
    }
    await ms.upsert("source", {
      ids: mk,
      embeddings: em,
      documents: doc,
      metadatas: meta,
    });
    return ms;
  };

  const queryVec = seedEmbedding(1);
  /** Embedding stub avoids global fetch (parallel tests mutate `fetch`). */
  /** @type {Pick<import("../src/ollama/client.js").OllamaClient, "embedBatch">} */
  const ollamaStub = {
    async embedBatch(/** @type {string[]}*/ inputs) {
      return inputs.map(() => [...queryVec]);
    },
  };

  /** @type {import('../src/config/load-config.js').AppConfig} */
  const cfg = /** @type {any} */ (minimalCorpusAugmentCfg(tmp));

  const block = await corpusChromaAugmentFromChroma(
    cfg,
    /** @type {import("../src/ollama/client.js").OllamaClient} */
    /** @ignore */ (
      /** @type {unknown} */ (ollamaStub)
    ),
    "hub/page.md",
    { createVectorStore: factory },
  );
  assert.ok(block);
  assert.match(String(block), /CORPUS_CHROMA_STUB_LINE_/);
});

test("corpusChromaAugmentFromChroma logs CORPUS_CHROMA_DEGRADED when query throws", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-corpus-dg-"));

  class BadQueryStore {
    async initCollections() {}
    async count() {
      return 5;
    }
    async query() {
      throw new Error("boom_query");
    }
  }

  /** @type {Pick<import("../src/ollama/client.js").OllamaClient, "embedBatch">} */
  const ollamaStub = {
    async embedBatch(inputs) {
      return inputs.map(() => Array.from({ length: 8 }, () => 0.05));
    },
  };

  /** @type {import('../src/config/load-config.js').AppConfig} */
  const cfg = /** @type {any} */ (minimalCorpusAugmentCfg(tmp));

  const lines = [];
  const origErr = console.error.bind(console);
  console.error = (msg) => {
    lines.push(String(msg));
    origErr(msg);
  };
  try {
    const block = await corpusChromaAugmentFromChroma(
      cfg,
      /** @type {import("../src/ollama/client.js").OllamaClient} */
      /** @ignore */ (
        /** @type {unknown} */ (ollamaStub)
      ),
      "x.md",
      {
        createVectorStore: async () =>
          /** @type {unknown} */ (new BadQueryStore()),
      },
    );
    assert.strictEqual(block, null);
    const joined = lines.join("\n");
    assert.ok(joined.includes("CORPUS_CHROMA_DEGRADED"));
    assert.ok(joined.includes("boom_query"));
  } finally {
    console.error = origErr;
  }
});
