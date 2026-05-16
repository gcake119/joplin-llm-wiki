import fs from "node:fs";
import { loadConfig } from "../config/load-config.js";
import { indexAll } from "../index/indexer.js";
import { createIndexRuntime } from "./cmd-index.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runWatch(ctx) {
  const cfg = await loadConfig(ctx.configPath);
  const { chroma, ollama } = await createIndexRuntime(cfg);

  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const summary = await indexAll(cfg, chroma, ollama);
        console.log(
          JSON.stringify({
            event: "reindex",
            indexed_files: summary.indexed_files,
            chunks_upserted: summary.chunks_upserted,
            chunks_skipped_embed: summary.chunks_skipped_embed,
            skipped_notes: summary.skipped_notes,
          }),
        );
      } catch (e) {
        console.error(
          JSON.stringify({
            error: "WATCH_REINDEX_FAILED",
            message: String(e?.message ?? e),
          }),
        );
      }
    }, cfg.watch.debounce_ms);
  };

  fs.watch(cfg.notes_root, { recursive: true }, schedule);

  console.error(
    JSON.stringify({
      watch: "started",
      notes_root: cfg.notes_root,
      debounce_ms: cfg.watch.debounce_ms,
    }),
  );

  await new Promise(() => {});
  return 0;
}
