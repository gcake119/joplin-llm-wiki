/**
 * Deterministic topic wiki paths when the LLM planner cannot meet min_topic quota.
 */

/**
 * @param {string} rel basename or rel path from raw
 */
function basenameOf(rel) {
  const norm = rel.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : norm;
}

/**
 * @param {string} s
 */
function slugify(s) {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Bucket digest source paths by basename prefix; emit stable topic wiki paths.
 *
 * @param {{
 *   digestRelPaths: string[],
 *   effectiveOffset: number,
 *   minTopic: number,
 *   maxTopic: number,
 * }} args
 * @returns {string[]}
 */
export function heuristicTopicPaths(args) {
  const { digestRelPaths, effectiveOffset, minTopic, maxTopic } = args;
  const n = digestRelPaths.length;
  if (n === 0 || maxTopic <= 0) return [];

  const want = Math.max(0, Math.min(maxTopic, Math.max(minTopic, 1)));
  /** @type {Map<string, string[]>} */
  const buckets = new Map();
  for (const rel of digestRelPaths) {
    const base = basenameOf(rel).replace(/\.md$/i, "");
    const key = topicKeyFromBasename(base);
    const arr = buckets.get(key) ?? [];
    arr.push(rel);
    buckets.set(key, arr);
  }

  let keys = [...buckets.keys()].sort();
  if (keys.length < want && n > keys.length) {
    const sorted = [...digestRelPaths].sort();
    const chunk = Math.max(1, Math.ceil(sorted.length / want));
    keys = [];
    for (let i = 0; i < sorted.length; i += chunk) {
      keys.push(`shard-${i}`);
      buckets.set(`shard-${i}`, sorted.slice(i, i + chunk));
    }
  }

  const off = Math.trunc(effectiveOffset);
  const out = [];
  for (let i = 0; i < keys.length && out.length < want; i++) {
    const group = slugify(keys[i]) || `topic-${off}-${i}`;
    const file = slugify(`${keys[i]}-知識筆記`) || `topic-note-${off}-${i}`;
    out.push(`concepts/${file || group}.md`);
  }

  return dedupePaths(out).slice(0, want);
}

/**
 * @param {string} base
 */
function topicKeyFromBasename(base) {
  const cleaned = base
    .normalize("NFC")
    .replace(/[_()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "綜合整理";
  const parts = cleaned.split(/[-:：|｜]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join("-");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).join("-");
  return cleaned.slice(0, 32);
}

/** @param {string[]} paths */
function dedupePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    const n = p.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!n || n.includes("..") || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * @param {string} norm forward-slash wiki path
 * @param {Set<string>} hubSet normalized hubs
 */
export function isTopicWikiPath(norm, hubSet) {
  if (!/\.md$/i.test(norm)) return false;
  if (!norm.startsWith("concepts/")) return false;
  return !hubSet.has(norm);
}

/**
 * Bare exported note filename (hash.md) mistaken as wiki path.
 *
 * @param {string} norm
 */
export function looksLikeSourceBasename(norm) {
  if (norm.includes("/")) return false;
  if (!/\.md$/i.test(norm)) return false;
  const stem = norm.replace(/\.md$/i, "");
  return /^[0-9a-f]{8,64}$/i.test(stem) || /^[0-9a-f-]{16,}$/i.test(stem);
}
