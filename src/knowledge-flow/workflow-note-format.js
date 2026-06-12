import fs from "node:fs";
import path from "node:path";

/**
 * @param {Date | string} input
 */
export function formatSystemDateTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  const yyyy = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${month}-${day} ${hour}:${minute}`;
}

/**
 * @param {Date | string} createdAt
 */
export function createdAtBodyPrefix(createdAt) {
  return `建立時間：${formatSystemDateTime(createdAt)}\n`;
}

/**
 * @param {{
 *   workflowRoot: string,
 *   dirRel: string,
 *   slug: string,
 *   fallbackSlug: string,
 * }} args
 */
export function uniqueWorkflowNotePath(args) {
  const base = args.slug || args.fallbackSlug;
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const rel = `${args.dirRel}/${base}${suffix}.md`;
    const abs = path.join(args.workflowRoot, rel);
    if (!fs.existsSync(abs)) return { rel, abs };
  }
}
