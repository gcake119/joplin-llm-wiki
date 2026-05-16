import fg from "fast-glob";
import path from "node:path";

/**
 * @param {string} rootAbs
 * @param {string} globPat
 * @returns {Promise<string[]>} absolute file paths
 */
export async function discoverMarkdown(rootAbs, globPat) {
  const entries = await fg(globPat, {
    cwd: rootAbs,
    absolute: true,
    onlyFiles: true,
    dot: false,
  });
  return entries.sort();
}

/**
 * @param {string} rootAbs
 * @param {string} fileAbs
 */
export function relativeUnder(rootAbs, fileAbs) {
  return path.relative(rootAbs, fileAbs).split(path.sep).join("/");
}
