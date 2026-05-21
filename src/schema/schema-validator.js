import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * @typedef {{
 *   schema_version: string,
 *   page_types: Array<{
 *     id: string,
 *     required_frontmatter_keys: string[],
 *     required_outbound_link_patterns: string[],
 *   }>,
 *   required_hub_pages: string[],
 * }} WikiSchema
 */

/**
 * @param {string} schemaPath
 * @returns {WikiSchema}
 */
export function loadWikiSchema(schemaPath) {
  const abs = path.resolve(schemaPath);
  let raw;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    schemaThrow(`cannot read wiki schema: ${abs}`);
  }
  /** @type {unknown} */
  const doc = YAML.parse(raw);
  if (typeof doc !== "object" || doc === null)
    schemaThrow("schema root must be mapping");
  const o = /** @type {Record<string, unknown>} */ (doc);
  if (typeof o.schema_version !== "string" || o.schema_version.trim() === "")
    schemaThrow("missing schema_version");
  if (!Array.isArray(o.page_types) || o.page_types.length === 0)
    schemaThrow("page_types must be a non-empty array");
  /** @type {WikiSchema['page_types']} */
  const page_types = [];
  const seen = new Set();
  for (const pt of o.page_types) {
    if (typeof pt !== "object" || pt === null) schemaThrow("invalid page_types entry");
    const p = /** @type {Record<string, unknown>} */ (pt);
    if (typeof p.id !== "string" || p.id.trim() === "")
      schemaThrow("page_types[].id required");
    if (seen.has(p.id)) schemaThrow(`duplicate page type id: ${p.id}`);
    seen.add(p.id);
    const rf = p.required_frontmatter_keys;
    const ro = p.required_outbound_link_patterns;
    if (!Array.isArray(rf) || !rf.every((x) => typeof x === "string"))
      schemaThrow(`page_types[${p.id}].required_frontmatter_keys invalid`);
    if (!Array.isArray(ro) || !ro.every((x) => typeof x === "string"))
      schemaThrow(`page_types[${p.id}].required_outbound_link_patterns invalid`);
    page_types.push({
      id: p.id,
      required_frontmatter_keys: /** @type {string[]} */ (rf),
      required_outbound_link_patterns: /** @type {string[]} */ (ro),
    });
  }
  const hubs = o.required_hub_pages;
  if (!Array.isArray(hubs) || !hubs.every((x) => typeof x === "string"))
    schemaThrow("required_hub_pages must be string array");

  return {
    schema_version: o.schema_version,
    page_types,
    required_hub_pages: /** @type {string[]} */ (hubs),
  };
}

/**
 * @param {WikiSchema} schema
 * @param {Set<string>} plannedPaths rel paths under wiki
 * @param {string} wikiRootAbs
 */
export function assertHubCoverage(schema, plannedPaths, wikiRootAbs) {
  for (const hub of schema.required_hub_pages) {
    const onDisk = fs.existsSync(path.join(wikiRootAbs, hub));
    const planned = plannedPaths.has(hub.replace(/\\/g, "/"));
    if (!onDisk && !planned)
      schemaThrow(
        `required hub missing and not planned: ${hub}`,
      );
  }
}

/**
 * @param {string} msg
 */
function schemaThrow(msg) {
  const err = new Error(msg);
  /** @type {Error & { code?: string }} */ (err).code = "SCHEMA_INVALID";
  throw err;
}
