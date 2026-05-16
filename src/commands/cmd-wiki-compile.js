import { runWikiCompileFlow } from "../wiki/wiki-compiler.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runWikiCompile(ctx) {
  await runWikiCompileFlow({ ctx });
  return 0;
}
