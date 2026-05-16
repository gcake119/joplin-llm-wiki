import fs from "node:fs";
import path from "node:path";
import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import { loadWikiSchema } from "../schema/schema-validator.js";
import { parseWikiMarkdownLenient } from "../wiki/frontmatter.js";

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   chroma: import('../vector/chroma-store.js').ChromaStore,
 *   ollama: import('../ollama/client.js').OllamaClient,
 * }} args
 */
export async function runKarpathyLint(args) {
  const { cfg, chroma, ollama } = args;

  const duplicates = await findDuplicates(cfg, chroma);
  const { orphans } = await scanSourceGraph(cfg);

  let wiki_orphans = [];
  if (cfg.wiki_root?.trim() && cfg.wiki_schema.path?.trim())
    wiki_orphans = await wikiHubOrphans(cfg);

  const judgePairs = pickContradictionPairs(duplicates, 12);
  const contradictions = await runContradictionJudge(
    judgePairs,
    ollama,
    cfg,
  ).catch((e) => {
    const err = new Error(String(e?.message ?? e));
    /** @type {Error & { code?: string }} */ (err).code = "LINT_JUDGE_FAILED";
    throw err;
  });

  /** @type {{ type: string, path: string, detail?: string }[]} */
  const schema_gaps = [];

  if (cfg.wiki_schema.path?.trim()) {
    const schema = loadWikiSchema(cfg.wiki_schema.path);
    if (cfg.wiki_root?.trim()) {
      const wikiRoot = path.resolve(cfg.wiki_root);
      for (const hub of schema.required_hub_pages) {
        const abs = path.join(wikiRoot, hub);
        if (!fs.existsSync(abs))
          schema_gaps.push({ type: "missing_hub", path: hub });
      }
      schema_gaps.push(...(await wikiFrontmatterGaps(cfg, schema)));
    }
  }

  const skipped_notes = await scanUnreadableSources(cfg);

  return {
    duplicates,
    orphans,
    contradictions,
    wiki_orphans,
    schema_gaps,
    skipped_notes,
  };
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {import('../vector/chroma-store.js').ChromaStore} chroma
 */
async function findDuplicates(cfg, chroma) {
  const threshold = cfg.lint.duplicate_similarity_threshold;
  const scope = cfg.lint.duplicate_scope;
  /** @type {{ layer: string, path: string, embedding: number[] }[]} */
  const rows = [];

  const pull = async (layer) => {
    const res = await chroma.peek(layer, 800);
    const ids = res.ids ?? [];
    const embs = res.embeddings ?? [];
    const metas = res.metadatas ?? [];
    for (let i = 0; i < ids.length; i++) {
      const emb = embs[i];
      const md = metas[i] ?? {};
      if (!Array.isArray(emb)) continue;
      rows.push({
        layer: String(md.layer ?? layer),
        path: String(md.relative_path ?? ""),
        embedding: /** @type {number[]} */ (emb),
      });
    }
  };

  if (scope === "both" || scope === "source") await pull("source");
  if (scope === "both" || scope === "wiki") await pull("wiki");

  /** @type {{ a: string, b: string, score: number }[]} */
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const sim = cosine(rows[i].embedding, rows[j].embedding);
      if (sim >= threshold)
        pairs.push({
          a: `${rows[i].layer}:${rows[i].path}`,
          b: `${rows[j].layer}:${rows[j].path}`,
          score: sim,
        });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, 500);
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function scanSourceGraph(cfg) {
  const root = path.resolve(cfg.notes_root);
  const files = await discoverMarkdown(root, cfg.notes_glob);
  /** @type {Record<string, string[]>} */
  const outbound = {};
  /** @type {Record<string, Set<string>>} */
  const backlinks = {};

  const relSet = new Set(files.map((abs) => relativeUnder(root, abs)));

  for (const abs of files) {
    const rel = relativeUnder(root, abs);
    const md = fs.readFileSync(abs, "utf8");
    const dir = path.posix.dirname(rel);
    const links = resolveInternalLinks(md, dir, relSet);
    outbound[rel] = links;
    for (const t of links) {
      backlinks[t] ??= new Set();
      backlinks[t].add(rel);
    }
  }

  /** @type {{ path: string, layer: string, reason: string }[]} */
  const orphans = [];
  if (!cfg.lint.source_link_check) return { orphans, outbound };

  for (const abs of files) {
    const rel = relativeUnder(root, abs);
    const links = outbound[rel] ?? [];
    const backs = backlinks[rel] ?? new Set();
    const meaningfulBack = [...backs].filter((x) => x !== rel);
    if (links.length === 0 && meaningfulBack.length === 0)
      orphans.push({
        path: rel,
        layer: "source",
        reason: "no_internal_links",
      });
  }
  return { orphans, outbound };
}

/**
 * @param {string} md
 * @param {string} relDir posix dir of note
 * @param {Set<string>} corpusRel
 */
function resolveInternalLinks(md, relDir, corpusRel) {
  /** @type {string[]} */
  const out = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md))) {
    let target = m[1].trim();
    if (/^[a-z]+:\/\//i.test(target)) continue;
    target = target.split("#")[0];
    if (!target) continue;
    const joined =
      relDir === "." ? target : `${relDir}/${target}`;
    const norm = joined.replace(/\\/g, "/").replace(/\/+/g, "/");
    const candidates = [norm, `${norm}.md`];
    for (const c of candidates) {
      const cleaned = path.posix.normalize(c);
      if (corpusRel.has(cleaned)) {
        out.push(cleaned);
        break;
      }
    }
  }
  return out;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function wikiHubOrphans(cfg) {
  const wikiRoot = path.resolve(cfg.wiki_root);
  const schema = loadWikiSchema(cfg.wiki_schema.path);
  const wikiFiles = await discoverMarkdown(wikiRoot, cfg.wiki.glob);
  const relSet = new Set(wikiFiles.map((abs) => relativeUnder(wikiRoot, abs)));

  /** @type {Record<string, Set<string>>} */
  const inbound = {};
  for (const abs of wikiFiles) {
    const rel = relativeUnder(wikiRoot, abs);
    const md = fs.readFileSync(abs, "utf8");
    const dir = path.posix.dirname(rel);
    const links = resolveInternalLinks(md, dir, relSet);
    for (const t of links) {
      inbound[t] ??= new Set();
      inbound[t].add(rel);
    }
  }

  /** @type {{ path: string, reason: string }[]} */
  const out = [];
  for (const hub of schema.required_hub_pages) {
    const hubNorm = hub.replace(/\\/g, "/");
    const set = inbound[hubNorm] ?? new Set();
    const real = [...set].filter((x) => x !== hubNorm);
    if (real.length === 0)
      out.push({ path: hubNorm, reason: "hub_unlinked" });
  }
  return out;
}

/**
 * @param {{ a: string, b: string, score: number }[]} duplicates
 * @param {number} max
 */
function pickContradictionPairs(duplicates, max) {
  return duplicates.slice(0, max).map((d) => ({
    left: d.a,
    right: d.b,
    score: d.score,
  }));
}

/**
 * @param {{ left: string, right: string, score: number }[]} pairs
 * @param {import('../ollama/client.js').OllamaClient} ollama
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function runContradictionJudge(pairs, ollama, cfg) {
  /** @type {{ severity: string, claim_a: string, claim_b: string, explanation: string }[]} */
  const out = [];
  const cap = cfg.lint.contradiction.max_pairs;
  for (const p of pairs.slice(0, cap)) {
    const prompt = `You compare two corpus locations flagged as highly similar.

Locations: ${p.left} vs ${p.right}
Cosine similarity (embedding space): ${p.score.toFixed(4)}

Return JSON ONLY:
{"severity":"info","claim_a":"...","claim_b":"...","explanation":"..."}

Use severity info when there is no contradiction; warn/error only if claims conflict.`;

    const text = await ollama.chatComplete({
      prompt,
      jsonMode: true,
      timeoutMs: cfg.lint.contradiction.timeout_ms,
    });
    let verdict;
    try {
      verdict = JSON.parse(text.trim());
    } catch {
      const err = new Error("contradiction judge parse failure");
      /** @type {Error & { code?: string }} */ (err).code =
        "LINT_JUDGE_FAILED";
      throw err;
    }
    out.push({
      severity: String(verdict.severity ?? "info"),
      claim_a: String(verdict.claim_a ?? ""),
      claim_b: String(verdict.claim_b ?? ""),
      explanation: String(verdict.explanation ?? ""),
    });
  }
  return out;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {import('../schema/schema-validator.js').WikiSchema} schema
 */
async function wikiFrontmatterGaps(cfg, schema) {
  /** @type {{ type: string, path: string, detail?: string }[]} */
  const gaps = [];
  const wikiRoot = path.resolve(cfg.wiki_root);
  const files = await discoverMarkdown(wikiRoot, cfg.wiki.glob);

  /** @type {Set<string>} */
  const keys = new Set();
  for (const pt of schema.page_types)
    for (const k of pt.required_frontmatter_keys) keys.add(k);

  for (const abs of files) {
    const rel = relativeUnder(wikiRoot, abs);
    const raw = fs.readFileSync(abs, "utf8");
    const { data } = parseWikiMarkdownLenient(raw);
    for (const k of keys) {
      if (!(k in data))
        gaps.push({
          type: "fm_gap",
          path: rel,
          detail: `missing ${k}`,
        });
    }
  }
  return gaps;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function scanUnreadableSources(cfg) {
  const root = path.resolve(cfg.notes_root);
  const files = await discoverMarkdown(root, cfg.notes_glob);
  /** @type {{ path: string, reason: string }[]} */
  const out = [];
  for (const abs of files) {
    try {
      const buf = fs.readFileSync(abs);
      const txt = buf.toString("utf8");
      if (/\uFFFD/.test(txt))
        out.push({
          path: relativeUnder(root, abs),
          reason: "INVALID_UTF8",
        });
    } catch {
      out.push({
        path: relativeUnder(root, abs),
        reason: "READ_FAILED",
      });
    }
  }
  return out;
}
