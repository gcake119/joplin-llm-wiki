import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * @typedef {{ data: Record<string, unknown>, body: string }} ParsedWikiMd
 */

/**
 * @param {string} markdown
 * @returns {ParsedWikiMd}
 */
export function parseWikiMarkdown(markdown) {
  if (!markdown.startsWith("---\n")) {
    fmThrow("missing opening wiki frontmatter delimiter");
  }
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    fmThrow("unterminated wiki frontmatter");
  }
  const fmRaw = markdown.slice(4, end);
  const body = markdown.slice(end + "\n---\n".length);
  let data;
  try {
    data = YAML.parse(fmRaw) ?? {};
  } catch {
    fmThrow("invalid yaml frontmatter");
  }
  if (typeof data !== "object" || data === null) fmThrow("frontmatter must map");
  return { data: /** @type {Record<string, unknown>} */ (data), body };
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} body
 */
export function serializeWikiPage(data, body) {
  const fm = YAML.stringify(data).trimEnd();
  return `---\n${fm}\n---\n${body}`;
}

/**
 * @param {Record<string, unknown>} data
 */
export function validateCompiledFrontmatter(data) {
  const refs = data.source_refs;
  if (!Array.isArray(refs) || refs.some((x) => typeof x !== "string"))
    fmThrow("source_refs must be string[]");
  if (typeof data.compiled_at !== "string" || data.compiled_at.trim() === "")
    fmThrow("compiled_at required ISO8601 string");
  if (
    typeof data.compiler_revision !== "string" ||
    data.compiler_revision.trim() === ""
  )
    fmThrow("compiler_revision required string");
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} notesRootAbs
 */
export function assertSourceRefsResolvable(data, notesRootAbs) {
  validateCompiledFrontmatter(data);
  const refs = /** @type {string[]} */ (data.source_refs);
  for (const ref of refs) {
    const abs = path.resolve(notesRootAbs, ref);
    const rel = path.relative(notesRootAbs, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel))
      fmThrow(`source_refs escapes notes_root: ${ref}`);
    if (!fs.existsSync(abs)) fmThrow(`source_refs not found: ${ref}`);
  }
}

/**
 * @param {string} msg
 */
function fmThrow(msg) {
  const err = new Error(msg);
  /** @type {Error & { code?: string }} */ (err).code = "FRONTMATTER_INVALID";
  throw err;
}

/**
 * Lenient parse for lint / discovery (missing frontmatter ok).
 * @param {string} markdown
 * @returns {ParsedWikiMd}
 */
export function parseWikiMarkdownLenient(markdown) {
  if (!markdown.startsWith("---\n")) {
    return { data: {}, body: markdown };
  }
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    return { data: {}, body: markdown };
  }
  const fmRaw = markdown.slice(4, end);
  const body = markdown.slice(end + "\n---\n".length);
  try {
    const data = YAML.parse(fmRaw) ?? {};
    if (typeof data !== "object" || data === null)
      return { data: {}, body: markdown };
    return { data: /** @type {Record<string, unknown>} */ (data), body };
  } catch {
    return { data: {}, body: markdown };
  }
}
