import { ChromaClient } from "chromadb";
import path from "node:path";

/**
 * @param {'upsert'|'delete'} op
 * @param {unknown} err
 */
function wrapChromaWriteError(op, err) {
  const msg = String(/** @type {{ message?: string }} */ (err)?.message ?? err);
  const hints = [];
  if (/dimension|mismatch|embedding|vector|Expected dim|incompatible/i.test(msg)) {
    hints.push(
      "若曾更換 ollama.embed_model，或 Chroma collection 由舊版／其他嵌入維度建立，請：清空 chroma.persist_path、刪除既有 collection，或改用新的 collection_sources／collection_wiki 名稱後再執行 index。",
    );
  }
  if (/metadata|Metadatas|422|Unprocessable/i.test(msg)) {
    hints.push(
      "若錯誤與 metadata 或 API 格式有關，請確認 Chroma server 與 chromadb 套件版本相容。",
    );
  }
  if (/lone leading surrogate|lone surrogate|parse the request body as JSON/i.test(msg)) {
    hints.push(
      "若訊息與 surrogate／JSON parse 有關，請升級套件後重跑 index（索引會剔除切塊後不合法的 UTF-16 組合以利 Chroma）。",
    );
  }
  const suffix = hints.length ? `\n${hints.join("\n")}` : "";
  const out = new Error(
    `Chroma ${op} failed (${msg}).${suffix}`,
  );
  /** @type {Error & { code?: string; cause?: unknown }} */ (out).code =
    "CHROMA_ERROR";
  /** @type {Error & { code?: string; cause?: unknown }} */ (out).cause = err;
  return out;
}

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
      embeddingFunction: null,
    });
    this._wiki = await this.client.getOrCreateCollection({
      name: this.wikiCollection,
      embeddingFunction: null,
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
    try {
      await c.upsert({ ids, embeddings, documents, metadatas });
    } catch (e) {
      throw wrapChromaWriteError("upsert", e);
    }
  }

  /**
   * @param {'source'|'wiki'} layer
   * @param {string[]} ids
   */
  async deleteIds(layer, ids) {
    if (ids.length === 0) return;
    const c = this.col(layer);
    try {
      await c.delete({ ids });
    } catch (e) {
      throw wrapChromaWriteError("delete", e);
    }
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
