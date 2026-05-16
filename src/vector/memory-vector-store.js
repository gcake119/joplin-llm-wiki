/**
 * Test-only in-process vector store implementing the subset of ChromaStore used by joplin-brain.
 * Enable with env `JOPLIN_BRAIN_TEST_MEMORY_VECTOR=1`.
 */
export class MemoryVectorStore {
  /**
   * @param {{
   *   persistPath: string,
   *   sourcesCollection: string,
   *   wikiCollection: string,
   * }} opts
   */
  constructor(opts) {
    this.persistPath = opts.persistPath;
    this.sourcesCollection = opts.sourcesCollection;
    this.wikiCollection = opts.wikiCollection;
    /** @type {Map<'source'|'wiki', Map<string, { embedding: number[], document: string, metadata: Record<string, string|number|boolean> }>>} */
    this._layers = new Map([
      ["source", new Map()],
      ["wiki", new Map()],
    ]);
  }

  async heartbeat() {}

  async initCollections() {}

  /**
   * @param {'source'|'wiki'} layer
   */
  table(layer) {
    const key = layer === "wiki" ? "wiki" : "source";
    return /** @type {Map<string, any>} */ (this._layers.get(key));
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {{ ids: string[], embeddings: number[][], documents: string[], metadatas: Record<string, string|number|boolean>[] }} batch
   */
  async upsert(layer, { ids, embeddings, documents, metadatas }) {
    const t = this.table(layer);
    for (let i = 0; i < ids.length; i++) {
      t.set(ids[i], {
        embedding: embeddings[i],
        document: documents[i],
        metadata: metadatas[i] ?? {},
      });
    }
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {string[]} ids
   */
  async deleteIds(layer, ids) {
    const t = this.table(layer);
    for (const id of ids) t.delete(id);
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {number[]} queryEmbedding
   * @param {number} topK
   */
  async query(layer, queryEmbedding, topK) {
    const t = this.table(layer);
    /** @type {{ id: string, score: number, doc: string, meta: Record<string, string|number|boolean> }[]} */
    const scored = [];
    for (const [id, rec] of t.entries()) {
      const sim = cosine(rec.embedding, queryEmbedding);
      scored.push({
        id,
        score: -sim,
        doc: rec.document,
        meta: rec.metadata,
      });
    }
    scored.sort((a, b) => a.score - b.score);
    const sel = scored.slice(0, topK);
    return {
      ids: [sel.map((s) => s.id)],
      documents: [sel.map((s) => s.doc)],
      metadatas: [sel.map((s) => s.meta)],
      distances: [sel.map((s) => -s.score)],
    };
  }

  /**
   * @param {'source'|'wiki'} layer
   */
  async count(layer) {
    return this.table(layer).size;
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {number} limit
   */
  async peek(layer, limit) {
    const t = this.table(layer);
    const ids = [];
    const embeddings = [];
    const metadatas = [];
    let n = 0;
    for (const [id, rec] of t.entries()) {
      if (n++ >= limit) break;
      ids.push(id);
      embeddings.push(rec.embedding);
      metadatas.push(rec.metadata);
    }
    return { ids, embeddings, metadatas };
  }
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
