import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import { chunkText } from "./chunker.js";
import { stripUnpairedSurrogates } from "./sanitize-text.js";
import {
  loadState,
  saveState,
  stateKey,
  statePathForChroma,
} from "./state-store.js";

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {import('../vector/chroma-store.js').ChromaStore} chroma
 * @param {import('../ollama/client.js').OllamaClient} ollama
 */
export async function indexAll(cfg, chroma, ollama) {
  const statePath = statePathForChroma(cfg.chroma.persist_path);
  const state = loadState(statePath);

  const skipped_notes = [];

  const sourcesSummary = await indexTree({
    cfg,
    chroma,
    ollama,
    state,
    layer: "source",
    rootAbs: path.resolve(cfg.notes_root),
    globPat: cfg.notes_glob,
    skipped_notes,
  });

  let wikiSummary = {
    indexed_files: 0,
    chunks_upserted: 0,
    chunks_skipped_embed: 0,
    presentRel: /** @type {Set<string>} */ (new Set()),
  };
  const wikiRoot = cfg.wiki_root?.trim();
  if (wikiRoot) {
    const absWiki = path.resolve(wikiRoot);
    if (fs.existsSync(absWiki) && fs.statSync(absWiki).isDirectory()) {
      wikiSummary = await indexTree({
        cfg,
        chroma,
        ollama,
        state,
        layer: "wiki",
        rootAbs: absWiki,
        globPat: cfg.wiki.glob,
        skipped_notes,
      });
    }
  }

  saveState(statePath, state);

  await tombstoneMissing({
    state,
    chroma,
    layer: "source",
    presentRel: sourcesSummary.presentRel,
  });
  await tombstoneMissing({
    state,
    chroma,
    layer: "wiki",
    presentRel: wikiSummary.presentRel,
  });
  saveState(statePath, state);

  return {
    indexed_files: sourcesSummary.indexed_files + wikiSummary.indexed_files,
    chunks_upserted:
      sourcesSummary.chunks_upserted + wikiSummary.chunks_upserted,
    chunks_skipped_embed:
      sourcesSummary.chunks_skipped_embed + wikiSummary.chunks_skipped_embed,
    skipped_notes,
    sources: sourcesSummary,
    wiki: wikiSummary,
  };
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   chroma: import('../vector/chroma-store.js').ChromaStore,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   state: import('./state-store.js').IndexState,
 *   layer: 'source'|'wiki',
 *   rootAbs: string,
 *   globPat: string,
 *   skipped_notes: { path: string, reason: string, layer: string }[],
 * }} args
 */
async function indexTree(args) {
  const { cfg, chroma, ollama, state, layer, rootAbs, globPat, skipped_notes } =
    args;
  const files = await discoverMarkdown(rootAbs, globPat);
  /** @type {Set<string>} */
  const presentRel = new Set();

  let indexed_files = 0;
  let chunks_upserted = 0;
  let chunks_skipped_embed = 0;

  const pendingEmbed = [];
  /** @type {{ id: string, document: string, metadata: Record<string, string|number|boolean> }[]} */
  const pendingUpsert = [];

  const flushUpsert = async () => {
    if (pendingUpsert.length === 0) return;
    const chunkTexts = pendingEmbed.map((p) => p.text);
    const embeddings = await ollama.embedBatch(chunkTexts);
    const ids = pendingUpsert.map((p) => p.id);
    const documents = pendingUpsert.map((p) => p.document);
    const metadatas = pendingUpsert.map((p) => p.metadata);
    await chroma.upsert(layer, { ids, embeddings, documents, metadatas });
    pendingEmbed.length = 0;
    pendingUpsert.length = 0;
  };

  for (const abs of files) {
    const rel = relativeUnder(rootAbs, abs);
    presentRel.add(rel);
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
      if (containsReplacementUtf8(text)) {
        skipped_notes.push({
          path: rel,
          reason: "INVALID_UTF8",
          layer,
        });
        continue;
      }
    } catch {
      skipped_notes.push({
        path: rel,
        reason: "READ_FAILED",
        layer,
      });
      continue;
    }

    indexed_files++;
    const st = fs.statSync(abs);
    const mtime_ms = Math.trunc(st.mtimeMs);
    const title = stripUnpairedSurrogates(inferTitle(text, rel));
    const noteIdMeta = stripUnpairedSurrogates(rel);
    const chunks = chunkText(
      text,
      cfg.chunk.size_chars,
      cfg.chunk.overlap_chars,
    );

    const key = stateKey(layer, rel);
    const prev = state.files[key] ?? { mtime_ms: 0, chunks: {} };

    /** @type {string[]} */
    const shrinkDeletes = [];
    for (const idxStr of Object.keys(prev.chunks)) {
      const idx = Number(idxStr);
      if (idx >= chunks.length) shrinkDeletes.push(`${layer}:${rel}:${idx}`);
    }
    if (shrinkDeletes.length) await chroma.deleteIds(layer, shrinkDeletes);

    /** @type {Record<string, string>} */
    const nextChunkHashes = {};

    for (let i = 0; i < chunks.length; i++) {
      const chunk = stripUnpairedSurrogates(chunks[i]);
      const content_hash = sha256(chunk);
      nextChunkHashes[String(i)] = content_hash;
      const id = `${layer}:${rel}:${i}`;
      const unchanged = prev.chunks[String(i)] === content_hash;
      if (unchanged) {
        chunks_skipped_embed++;
        continue;
      }

      const meta = {
        note_id: noteIdMeta,
        relative_path: noteIdMeta,
        title,
        mtime_ms,
        content_hash,
        chunk_index: i,
        layer,
      };

      pendingEmbed.push({ text: chunk });
      pendingUpsert.push({
        id,
        document: chunk,
        metadata: meta,
      });

      if (pendingUpsert.length >= cfg.ollama.embed_batch_size) {
        chunks_upserted += pendingUpsert.length;
        await flushUpsert();
      }
    }

    if (pendingUpsert.length > 0) {
      chunks_upserted += pendingUpsert.length;
      await flushUpsert();
    }

    state.files[key] = { mtime_ms, chunks: nextChunkHashes };
  }

  return {
    indexed_files,
    chunks_upserted,
    chunks_skipped_embed,
    presentRel,
  };
}

/**
 * @param {{
 *   state: import('./state-store.js').IndexState,
 *   chroma: import('../vector/chroma-store.js').ChromaStore,
 *   layer: 'source'|'wiki',
 *   presentRel: Set<string>,
 * }} args
 */
async function tombstoneMissing(args) {
  const { state, chroma, layer, presentRel } = args;
  /** @type {string[]} */
  const toDelete = [];
  for (const key of Object.keys(state.files)) {
    if (!key.startsWith(`${layer}:`)) continue;
    const rel = key.slice(layer.length + 1);
    if (presentRel.has(rel)) continue;
    const rec = state.files[key];
    if (!rec?.chunks) continue;
    for (const idx of Object.keys(rec.chunks)) {
      toDelete.push(`${layer}:${rel}:${idx}`);
    }
    delete state.files[key];
  }
  await chroma.deleteIds(layer, toDelete);
}

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function inferTitle(text, rel) {
  const m = text.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return path.basename(rel);
}

/** crude binary detection */
function containsReplacementUtf8(s) {
  return /\uFFFD/.test(s);
}
