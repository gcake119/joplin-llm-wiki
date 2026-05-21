import { loadConfig } from "../config/load-config.js";
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
  const payload = await runKarpathyLint({ cfg });
  const strictPayload = {
    duplicates: payload.duplicates,
    orphans: payload.orphans,
    contradictions: payload.contradictions,
    wiki_orphans: payload.wiki_orphans,
    schema_gaps: payload.schema_gaps,
    skipped_notes: payload.skipped_notes,
    brainstorming_followups: payload.brainstorming_followups,
  };

  console.log(JSON.stringify(strictPayload, null, 2));

  writeLintReports({
    outDir: cfg.lint.out_dir,
    stem: "karpathy-lint",
    payload: strictPayload,
  });

  return 0;
}
