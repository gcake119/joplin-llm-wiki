/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   chroma: import('../vector/chroma-store.js').ChromaStore,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   question: string,
 * }} args
 * @returns {Promise<{ chunks: { layer: string, relative_path: string, chunk_index: number, document: string, distance?: number }[] }>}
 */
export async function retrieveForRag(args) {
  const { cfg, chroma, ollama, question } = args;
  const embedding = (await ollama.embedBatch([question]))[0];
  const mode = cfg.rag.retrieve_mode;
  const topK = cfg.rag.top_k;

  if (mode === "sources_only") {
    const rows = await queryTop(chroma, "source", embedding, topK);
    return { chunks: rows };
  }

  if (mode === "wiki_first") {
    const wikiHits = await queryTop(chroma, "wiki", embedding, topK);
    const need = topK - wikiHits.length;
    const srcHits =
      need > 0
        ? await queryTop(chroma, "source", embedding, need)
        : [];
    return { chunks: [...wikiHits, ...srcHits] };
  }

  // merged
  const overfetch = Math.min(topK * 4, 50);
  const w = await queryTop(chroma, "wiki", embedding, overfetch);
  const s = await queryTop(chroma, "source", embedding, overfetch);
  const merged = dedupeAndRank([...w, ...s], topK);
  return { chunks: merged };
}

/**
 * @param {import('../vector/chroma-store.js').ChromaStore} chroma
 * @param {'source'|'wiki'} layer
 * @param {number[]} embedding
 * @param {number} k
 */
async function queryTop(chroma, layer, embedding, k) {
  if (k <= 0) return [];
  const res = await chroma.query(layer, embedding, k);
  const ids = res.ids?.[0] ?? [];
  const docs = res.documents?.[0] ?? [];
  const metas = res.metadatas?.[0] ?? [];
  const dists = res.distances?.[0] ?? [];
  /** @type {{ layer: string, relative_path: string, chunk_index: number, document: string, distance?: number }[]} */
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const md = metas[i] ?? {};
    const layerMeta = String(md.layer ?? layer);
    out.push({
      layer: layerMeta,
      relative_path: String(md.relative_path ?? ""),
      chunk_index: Number(md.chunk_index ?? 0),
      document: String(docs[i] ?? ""),
      distance:
        typeof dists[i] === "number" ? /** @type {number} */ (dists[i]) : undefined,
    });
  }
  return out;
}

/**
 * @param {{ layer: string, relative_path: string, chunk_index: number, document: string, distance?: number }[]} rows
 * @param {number} topK
 */
function dedupeAndRank(rows, topK) {
  const key = (r) => `${r.layer}|${r.relative_path}|${r.chunk_index}`;
  const best = new Map();
  for (const r of rows) {
    const d = r.distance ?? Number.POSITIVE_INFINITY;
    const k = key(r);
    const prev = best.get(k);
    if (!prev || d < (prev.distance ?? Number.POSITIVE_INFINITY)) best.set(k, r);
  }
  const arr = [...best.values()].sort(
    (a, b) => (a.distance ?? 0) - (b.distance ?? 0),
  );
  return arr.slice(0, topK);
}

/**
 * @param {{ chunks: { document: string, relative_path: string, layer: string }[] }} args
 * @param {number} maxChars
 */
export function buildGroundedPrompt(args, maxChars) {
  const parts = [];
  let used = 0;
  for (const c of args.chunks) {
    const block = `[${c.layer}:${c.relative_path}]\n${c.document}\n`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return `Answer in Traditional Chinese using ONLY the context excerpts below. Keep technical proper nouns in their original language when clearer. If insufficient, say in Traditional Chinese that you cannot find enough evidence in the provided context.

CONTEXT:
${parts.join("\n")}
`;
}
