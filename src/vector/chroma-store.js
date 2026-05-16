import { ChromaClient } from "chromadb";
import path from "node:path";

/**
 * @typedef {{
 *   relative_path: string,
 *   title: string,
 *   mtime_ms: number,
 *   content_hash: string,
 *   chunk_index: number,
 *   layer: 'source'|'wiki',
 *   note_id: string,
 * }} ChunkMetadata
 */

export class ChromaStore {
  /**
   * @param {{
   *   persistPath: string,
   *   sourcesCollection: string,
   *   wikiCollection: string,
   *   host?: string,
   *   port?: number,
   * }} opts
   */
  constructor(opts) {
    this.persistPath = path.resolve(opts.persistPath);
    const host = opts.host ?? process.env.CHROMA_HOST ?? "127.0.0.1";
    const port = Number(opts.port ?? process.env.CHROMA_PORT ?? 8000);
    this.client = new ChromaClient({ host, port, ssl: false });
    this.sourcesCollection = opts.sourcesCollection;
    this.wikiCollection = opts.wikiCollection;
    /** @type {import('chromadb').Collection | null} */
    this._sources = null;
    /** @type {import('chromadb').Collection | null} */
    this._wiki = null;
  }

  /** Chroma 1.x local server expects GET /api/v2/heartbeat; chromadb@3 client uses POST — probe via listCollections instead. */
  async heartbeat() {
    await this.client.listCollections({ limit: 1 });
  }

  async initCollections() {
    this._sources = await this.client.getOrCreateCollection({
      name: this.sourcesCollection,
    });
    this._wiki = await this.client.getOrCreateCollection({
      name: this.wikiCollection,
    });
  }

  /**
   * @param {'source'|'wiki'} layer
   */
  col(layer) {
    if (!this._sources || !this._wiki)
      throw new Error("ChromaStore.initCollections() required");
    return layer === "wiki" ? this._wiki : this._sources;
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {string[]} ids
   * @param {number[][]} embeddings
   * @param {string[]} documents
   * @param {Record<string, string|number|boolean>[]} metadatas
   */
  async upsert(layer, { ids, embeddings, documents, metadatas }) {
    const c = this.col(layer);
    await c.upsert({ ids, embeddings, documents, metadatas });
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {string[]} ids
   */
  async deleteIds(layer, ids) {
    if (ids.length === 0) return;
    const c = this.col(layer);
    await c.delete({ ids });
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {number[]} queryEmbedding
   * @param {number} topK
   */
  async query(layer, queryEmbedding, topK) {
    const c = this.col(layer);
    const res = await c.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: ["documents", "metadatas", "distances"],
    });
    return res;
  }

  /**
   * @param {'source'|'wiki'} layer
   */
  async count(layer) {
    const c = this.col(layer);
    return c.count();
  }

  /**
   * Pull ids + embeddings + metadatas for lint duplicate detection (small corpora).
   * @param {'source'|'wiki'} layer
   * @param {number} limit
   */
  async peek(layer, limit = 5000) {
    const c = this.col(layer);
    const res = await c.get({
      limit,
      include: ["embeddings", "metadatas", "ids"],
    });
    return res;
  }
}
