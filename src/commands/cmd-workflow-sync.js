import { loadConfig } from "../config/load-config.js";
import { runWorkflowPullSync } from "../joplin/workflow-sync.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @param {{
 *   loadConfig?: typeof loadConfig,
 *   runWorkflowPullSync?: typeof runWorkflowPullSync,
 * }} [deps]
 * @returns {Promise<number>}
 */
export async function runWorkflowSync(ctx, deps = {}) {
  const load = deps.loadConfig ?? loadConfig;
  const sync = deps.runWorkflowPullSync ?? runWorkflowPullSync;
  const cfg = await load(ctx.configPath);
  const summary = await sync(cfg, {
    dryRun: readBool(ctx.opts, "dry-run", false),
    section: ctx.opts.get("section") ?? "all",
  });
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

function readBool(opts, key, defaultValue) {
  const raw = opts.get(key);
  if (raw === undefined) return defaultValue;
  return raw === "true" || raw === "1" || raw === "yes";
}
