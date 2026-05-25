import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { loadConfig } from "../config/load-config.js";
import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import { OllamaClient } from "../ollama/client.js";
import { runKnowledgeFlowWriteback } from "../joplin/wiki-writeback.js";

/**
 * @param {{
 *   configPath: string,
 *   question: string,
 *   opts: Map<string, string>,
 * }} args
 */
export async function queryKnowledge(args) {
  const cfg = await loadConfig(args.configPath);
  const workflowRoot = path.dirname(path.resolve(args.configPath));
  const question = args.question.trim();
  if (!question) {
    return {
      ok: false,
      status: 1,
      error: { error: "QUERY_EMPTY", message: "question text required" },
    };
  }

  const provider = args.opts.get("provider") ?? "ollama";
  if (provider !== "ollama" && provider !== "codex-agent") {
    const err = new Error("query --provider must be ollama or codex-agent");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const sourceScope = readSourceScope(args.opts);
  const wikiRoot = path.resolve(cfg.wiki);
  const rawRoot = path.resolve(cfg.raw);
  const [wiki, raw] = await Promise.all([
    sourceScope !== "raw" ? readWikiCorpus(wikiRoot, cfg.wiki_glob) : { files: [] },
    sourceScope !== "wiki" ? readRawCorpus(rawRoot, cfg.raw_glob) : { files: [] },
  ]);
  if (wiki.files.length === 0 && raw.files.length === 0) {
    return {
      ok: false,
      status: 1,
      error: {
        error: "EMPTY_KNOWLEDGE",
        message: "query requires markdown files under wiki/ or raw/",
      },
    };
  }

  const maxContextChars = readPositiveIntOpt(args.opts, "max-context-chars", 24_000);
  const knowledge = buildKnowledgeContext({ wiki, raw, sourceScope }, maxContextChars);
  const prompt = buildQueryPrompt(question, knowledge.context);
  const rawAnswer =
    provider === "ollama"
      ? await answerWithOllama(cfg, prompt)
      : await answerWithCodex(path.dirname(path.resolve(args.configPath)), prompt);

  const parsed = parseAnswerCapture(rawAnswer);
  const answer = parsed.answer.trim();
  const capture = buildCaptureDraft({
    requested: args.opts.get("capture"),
    legacyFileBack: args.opts.get("file-back"),
    parsed: parsed.capture,
    question,
    answer,
    provider,
    sourceScope,
    sources: knowledge.sources,
  });
  const pending = capture
    ? writePendingCapture({
        cfg,
        workflowRoot,
        question,
        answer,
        provider,
        sourceScope,
        capture,
      })
    : null;

  return {
    ok: true,
    status: 0,
    answer,
    sources: knowledge.sources,
    captureDraft:
      capture && pending
        ? {
            id: pending.id,
            path: pending.path,
            classification: capture.classification,
            title: capture.title,
            knowledge_sources: capture.knowledge_sources,
            confirm: `joplin-llm-wiki query --config ${args.configPath} --confirm-capture ${pending.id}`,
          }
        : null,
  };
}

/**
 * @param {{ configPath: string, id: string, opts: Map<string, string> }} args
 */
export async function confirmPendingCapture(args) {
  const cfg = await loadConfig(args.configPath);
  const workflowRoot = path.dirname(path.resolve(args.configPath));
  const pending = readPendingCapture(workflowRoot, args.id);
  if (!pending) {
    return {
      ok: false,
      status: 1,
      error: {
        error: "CAPTURE_NOT_FOUND",
        message: `pending capture not found: ${args.id}`,
      },
    };
  }
  const capture = pending.capture;
  if (capture.classification !== "brainstorming" && capture.classification !== "artifacts") {
    return {
      ok: false,
      status: 1,
      error: {
        error: "CAPTURE_INVALID",
        message: "pending capture classification must be brainstorming or artifacts",
      },
    };
  }
  const dest = captureDestination(
    workflowRoot,
    capture.classification,
    capture.title,
    args.opts,
    cfg,
  );
  if (!dest) {
    return {
      ok: false,
      status: 1,
      error: {
        error: "ARTIFACT_PROJECT_REQUIRED",
        message: "artifacts capture requires --artifact-project or joplin_wiki_writeback.artifacts_project_notebook_title",
      },
    };
  }
  fs.mkdirSync(path.dirname(dest.abs), { recursive: true });
  fs.writeFileSync(dest.abs, renderConfirmedCapture(pending, dest.rel));

  let writeback = null;
  if (args.opts.get("writeback-workflow") === "true") {
    writeback = await runKnowledgeFlowWriteback(
      cfg,
      path.resolve(cfg.wiki),
      [],
      {
        workflowRoot,
        workflowRelPaths: [dest.rel],
        artifactsProjectNotebookTitle: dest.artifactsProjectNotebookTitle,
      },
    );
  }

  cleanupFile(pending.path);
  return {
    ok: true,
    status: 0,
    capture_written: dest.rel,
    writeback,
  };
}

/** @param {{ configPath: string, id: string }} args */
export async function showPendingCapture(args) {
  const workflowRoot = path.dirname(path.resolve(args.configPath));
  const pending = readPendingCapture(workflowRoot, args.id);
  if (!pending) {
    return {
      ok: false,
      status: 1,
      error: {
        error: "CAPTURE_NOT_FOUND",
        message: `pending capture not found: ${args.id}`,
      },
    };
  }
  return { ok: true, status: 0, capture: pending.data };
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} prompt
 */
async function answerWithOllama(cfg, prompt) {
  const ollama = new OllamaClient({
    baseUrl: cfg.ollama.base_url,
    chatModel: cfg.ollama.chat_model,
    timeoutMs: cfg.ollama.timeout_ms,
  });
  return ollama.chatComplete({
    prompt,
    jsonMode: false,
    timeoutMs: cfg.ollama.timeout_ms,
  });
}

/**
 * @param {string} repoRoot
 * @param {string} prompt
 */
async function answerWithCodex(repoRoot, prompt) {
  const result = await runCodexExec(spawn, repoRoot, prompt);
  if (result.spawnFailed) {
    const err = new Error(`codex CLI unavailable: ${result.stderrTail}`);
    /** @type {Error & { code?: string }} */ (err).code = "CODEX_CLI_UNAVAILABLE";
    throw err;
  }
  if (result.exitCode !== 0) {
    const text = `${result.stderrTail}\n${result.stdoutTail}`;
    const err = new Error(`codex exec failed: ${result.stderrTail || result.stdoutTail}`);
    /** @type {Error & { code?: string }} */ (err).code = "AGENT_COMPILE_FAILED";
    if (
      /usage limit/i.test(text) ||
      /purchase more credits/i.test(text) ||
      /try again at/i.test(text)
    ) {
      /** @type {Error & { code?: string }} */ (err).code = "CODEX_USAGE_LIMIT";
    }
    throw err;
  }
  return result.finalMessage || result.stdoutTail;
}

/**
 * @param {string} question
 * @param {string} context
 */
function buildQueryPrompt(question, context) {
  return `你是個人知識庫 query agent。你可以根據下方 KNOWLEDGE CONTEXT 回答，這代表使用者知識庫，而不是外部網路。

來源優先序：
- wiki/ 是最高優先的已編譯知識層，回答應優先根據 wiki/。
- raw/ 是未編譯原始素材，只能作為原始佐證、wiki/ 不足時的補充，或使用者明確要求查原始素材時使用。
- 不得把 raw/ 未整理內容說成已編譯 wiki 結論。
- 若 wiki/ 與 raw/ 都沒有足夠證據，直接說明知識庫不足。
- 若引用本次對話提供的新資訊或任何外部內容，必須明確標示「非知識庫內容」。

wiki/ 結構：
- summaries/*.md：每個來源一份摘要
- concepts/*.md：概念條目與交叉引用
- indexes/All-Sources.md、indexes/All-Concepts.md：索引入口

回答要求：
- 使用繁體中文。
- 最後列出實際使用的來源，格式包含 layer 與相對路徑，例如 wiki:concepts/topic.md 或 raw/project/note.md。

建立新筆記判斷：
- 若這次問答值得保存為探索紀錄或成品草稿，請在回答最後輸出 CAPTURE_JSON 區塊。
- CAPTURE_JSON 必須是單一 JSON object，schema:
  {"should_create": boolean, "classification": "brainstorming"|"artifacts", "title": string, "content": string, "knowledge_sources": [{"layer":"wiki"|"raw","path":string}]}
- classification 只能是 brainstorming 或 artifacts，不能同時分類。
- 若不值得保存，輸出 {"should_create": false, "classification": "brainstorming", "title": "", "content": "", "knowledge_sources": []}。

KNOWLEDGE CONTEXT:
${context}

QUESTION:
${question}
`;
}

/**
 * @param {string} wikiRoot
 * @param {string} glob
 */
async function readWikiCorpus(wikiRoot, glob) {
  if (!fs.existsSync(wikiRoot)) return { files: [] };
  const files = await discoverMarkdown(wikiRoot, glob);
  const allowed = new Set(["summaries", "concepts", "indexes"]);
  const rows = [];
  for (const abs of files) {
    const rel = relativeUnder(wikiRoot, abs);
    const parts = rel.split("/");
    if (!allowed.has(parts[0])) continue;
    if (parts.length !== 2) continue;
    rows.push({ rel, text: fs.readFileSync(abs, "utf8") });
  }
  rows.sort((a, b) => {
    const ar = rankRel(a.rel);
    const br = rankRel(b.rel);
    return ar === br ? a.rel.localeCompare(b.rel) : ar - br;
  });
  return { files: rows };
}

/**
 * @param {string} rawRoot
 * @param {string} glob
 */
async function readRawCorpus(rawRoot, glob) {
  if (!fs.existsSync(rawRoot)) return { files: [] };
  const files = await discoverMarkdown(rawRoot, glob);
  const rows = [];
  for (const abs of files) {
    const rel = relativeUnder(rawRoot, abs);
    rows.push({ rel, text: fs.readFileSync(abs, "utf8") });
  }
  rows.sort((a, b) => a.rel.localeCompare(b.rel));
  return { files: rows };
}

/** @param {string} rel */
function rankRel(rel) {
  if (rel.startsWith("indexes/")) return 0;
  if (rel.startsWith("concepts/")) return 1;
  return 2;
}

/**
 * @param {{
 *   wiki: { files: { rel: string, text: string }[] },
 *   raw: { files: { rel: string, text: string }[] },
 *   sourceScope: "knowledge" | "wiki" | "raw",
 * }} args
 * @param {number} maxChars
 */
function buildKnowledgeContext(args, maxChars) {
  let out = "";
  /** @type {{ layer: "wiki" | "raw", path: string }[]} */
  const sources = [];
  const rows = [
    ...args.wiki.files.map((f) => ({ layer: /** @type {const} */ ("wiki"), ...f })),
    ...args.raw.files.map((f) => ({ layer: /** @type {const} */ ("raw"), ...f })),
  ];
  for (const f of rows) {
    const chunk = `\n\n--- ${f.layer}:${f.rel} ---\n${f.text.trim()}\n`;
    if (out.length + chunk.length > maxChars) break;
    out += chunk;
    sources.push({ layer: f.layer, path: f.rel });
  }
  return { context: out.trim(), sources };
}

/**
 * @param {string} answer
 * @returns {{ answer: string, capture: Record<string, unknown> | null }}
 */
function parseAnswerCapture(answer) {
  const marker = answer.search(/CAPTURE_JSON:/i);
  if (marker === -1) return { answer, capture: null };
  const visible = answer.slice(0, marker).trimEnd();
  const tail = answer.slice(marker);
  const fenced = tail.match(/CAPTURE_JSON:\s*```(?:json)?\s*([\s\S]*?)```/i);
  const rawJson = fenced?.[1] ?? tail.match(/CAPTURE_JSON:\s*({[\s\S]*})\s*$/i)?.[1];
  if (!rawJson) return { answer: visible || answer, capture: null };
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { answer: visible, capture: parsed };
    }
  } catch {
    return { answer: visible || answer, capture: null };
  }
  return { answer: visible || answer, capture: null };
}

/**
 * @param {{
 *   requested: string | undefined,
 *   legacyFileBack: string | undefined,
 *   parsed: Record<string, unknown> | null,
 *   question: string,
 *   answer: string,
 *   provider: string,
 *   sourceScope: string,
 *   sources: { layer: "wiki" | "raw", path: string }[],
 * }} args
 * @returns {{ classification: "brainstorming" | "artifacts", title: string, content: string, knowledge_sources: { layer: "wiki" | "raw", path: string }[] } | null}
 */
function buildCaptureDraft(args) {
  if (args.legacyFileBack === "false" || args.requested === "false") return null;
  const forced =
    args.requested === "brainstorming" || args.requested === "artifacts"
      ? args.requested
      : null;

  if (forced) {
    return normalizeCapture({
      should_create: true,
      classification: forced,
      title: args.parsed?.title,
      content: args.parsed?.content,
      knowledge_sources: args.parsed?.knowledge_sources,
    }, args);
  }

  if (!args.parsed || args.parsed.should_create !== true) return null;
  return normalizeCapture(args.parsed, args);
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ question: string, answer: string, sources: { layer: "wiki" | "raw", path: string }[] }} fallback
 * @returns {{ classification: "brainstorming" | "artifacts", title: string, content: string, knowledge_sources: { layer: "wiki" | "raw", path: string }[] } | null}
 */
function normalizeCapture(raw, fallback) {
  const classification = raw.classification;
  if (classification !== "brainstorming" && classification !== "artifacts") return null;
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : fallback.question.slice(0, 120);
  const content =
    typeof raw.content === "string" && raw.content.trim()
      ? raw.content.trim()
      : `# 問題\n\n${fallback.question}\n\n# 回答\n\n${fallback.answer}`;
  const knowledge_sources = normalizeKnowledgeSources(raw.knowledge_sources, fallback.sources);
  return { classification, title, content, knowledge_sources };
}

/**
 * @param {unknown} raw
 * @param {{ layer: "wiki" | "raw", path: string }[]} fallback
 */
function normalizeKnowledgeSources(raw, fallback) {
  if (!Array.isArray(raw)) return fallback;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const layer = /** @type {{ layer?: unknown }} */ (item).layer;
    const p = /** @type {{ path?: unknown }} */ (item).path;
    if ((layer === "wiki" || layer === "raw") && typeof p === "string" && p.trim()) {
      out.push({ layer, path: p.trim() });
    }
  }
  return out.length ? out : fallback;
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   workflowRoot: string,
 *   question: string,
 *   answer: string,
 *   provider: string,
 *   sourceScope: string,
 *   capture: { classification: "brainstorming" | "artifacts", title: string, content: string, knowledge_sources: { layer: "wiki" | "raw", path: string }[] },
 * }} args
 */
function writePendingCapture(args) {
  const dir = pendingCaptureDir(args.workflowRoot);
  fs.mkdirSync(dir, { recursive: true });
  const id = createPendingCaptureId({
    now: new Date(),
    timezone: args.cfg.knowledge_flow.pending_capture_id_timezone,
    title: args.capture.title,
  });
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify({
    id,
    created_at: new Date().toISOString(),
    question: args.question,
    answer: args.answer,
    provider: args.provider,
    source_scope: args.sourceScope,
    capture: args.capture,
  }, null, 2));
  return { id, path: file };
}

/**
 * @param {{
 *   now: Date,
 *   timezone: string,
 *   title: string,
 *   hash?: string,
 * }} args
 */
export function createPendingCaptureId(args) {
  const stamp = args.timezone === "UTC"
    ? args.now.toISOString().replace(/[:.]/g, "-")
    : formatLocalTimestamp(args.now, args.timezone);
  const slug = slugify(args.title).slice(0, 48) || "capture";
  const hash = args.hash ?? crypto.randomBytes(4).toString("hex");
  return `${stamp}-${slug}-${hash}`;
}

/**
 * @param {Date} date
 * @param {string} timezone
 */
function formatLocalTimestamp(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}T${byType.get("hour")}-${byType.get("minute")}-${byType.get("second")}`;
}

/**
 * @param {string} workflowRoot
 * @param {string} id
 */
function readPendingCapture(workflowRoot, id) {
  const file = path.join(pendingCaptureDir(workflowRoot), `${path.basename(id)}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    path: file,
    data,
    capture: data.capture,
    question: String(data.question ?? ""),
    answer: String(data.answer ?? ""),
    provider: String(data.provider ?? ""),
    source_scope: String(data.source_scope ?? "knowledge"),
    created_at: String(data.created_at ?? new Date().toISOString()),
  };
}

/** @param {string} workflowRoot */
function pendingCaptureDir(workflowRoot) {
  return path.join(workflowRoot, ".joplin-llm-wiki", "pending-captures");
}

/**
 * @param {string} workflowRoot
 * @param {"brainstorming" | "artifacts"} classification
 * @param {string} title
 * @param {Map<string, string>} opts
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
function captureDestination(workflowRoot, classification, title, opts, cfg) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify(title).slice(0, 64) || "capture";
  if (classification === "brainstorming") {
    const rel = `brainstorming/chat/${stamp}-${slug}.md`;
    return { rel, abs: path.join(workflowRoot, rel), artifactsProjectNotebookTitle: "" };
  }
  const project = opts.get("artifact-project") || cfg.joplin_wiki_writeback.artifacts_project_notebook_title;
  if (!project || !project.trim()) return null;
  const projectSlug = slugify(project).slice(0, 64) || "project";
  const rel = `artifacts/${projectSlug}/${stamp}-${slug}.md`;
  return { rel, abs: path.join(workflowRoot, rel), artifactsProjectNotebookTitle: project.trim() };
}

/**
 * @param {{ capture: { title: string, classification: string, content: string, knowledge_sources: { layer: string, path: string }[] }, question: string, answer: string, provider: string, source_scope: string, created_at: string }} pending
 * @param {string} rel
 */
function renderConfirmedCapture(pending, rel) {
  const c = pending.capture;
  const savedContent = c.classification === "artifacts"
    ? c.content
    : `# 保存內容\n\n${c.content}`;
  return `---
title: "${yamlString(c.title)}"
created_at: "${yamlString(pending.created_at)}"
provider: "${yamlString(pending.provider)}"
source_scope: "${yamlString(pending.source_scope)}"
capture_classification: "${yamlString(c.classification)}"
capture_path: "${yamlString(rel)}"
knowledge_sources:
${c.knowledge_sources.map((s) => `  - layer: "${yamlString(s.layer)}"\n    path: "${yamlString(s.path)}"`).join("\n")}
---

# 問題

${pending.question}

# 回答

${pending.answer}

${savedContent}
`;
}

/** @param {string} s */
function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** @param {string} s */
function yamlString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * @param {Map<string, string>} opts
 * @param {string} key
 * @param {number} def
 */
function readPositiveIntOpt(opts, key, def) {
  const raw = opts.get(key);
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return def;
  return n;
}

/**
 * @param {typeof spawn} spawnImpl
 * @param {string} repoRoot
 * @param {string} prompt
 * @returns {Promise<{ exitCode: number | null, stdoutTail: string, stderrTail: string, finalMessage: string, spawnFailed: boolean }>}
 */
function runCodexExec(spawnImpl, repoRoot, prompt) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    const finalPath = path.join(
      os.tmpdir(),
      `joplin-llm-wiki-query-final-${process.pid}-${Date.now()}.txt`,
    );
    const child = spawnImpl(
      "codex",
      [
        "exec",
        "--cd",
        repoRoot,
        "--sandbox",
        "workspace-write",
        "--output-last-message",
        finalPath,
        prompt,
      ],
      { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.on("error", (e) => {
      resolve({
        exitCode: null,
        stdoutTail: tail(out),
        stderrTail: tail(String(e.message || e)),
        finalMessage: "",
        spawnFailed: true,
      });
    });
    child.stdout?.on("data", (c) => {
      out += String(c);
      if (out.length > 65536) out = out.slice(-65536);
    });
    child.stderr?.on("data", (c) => {
      err += String(c);
      if (err.length > 65536) err = err.slice(-65536);
    });
    child.on("close", (code) => {
      let finalMessage = "";
      if (fs.existsSync(finalPath)) {
        finalMessage = fs.readFileSync(finalPath, "utf8").trim();
        cleanupFile(finalPath);
      }
      resolve({
        exitCode: code,
        stdoutTail: tail(out),
        stderrTail: tail(err),
        finalMessage,
        spawnFailed: false,
      });
    });
  });
}

/** @param {string} text */
function tail(text) {
  return text.length > 8000 ? text.slice(-8000) : text;
}

/** @param {string} file */
function cleanupFile(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // best effort cleanup
  }
}

/** @param {Map<string, string>} opts */
function readSourceScope(opts) {
  const raw = opts.get("source-scope") ?? "knowledge";
  if (raw !== "knowledge" && raw !== "wiki" && raw !== "raw") {
    const err = new Error("query --source-scope must be knowledge, wiki, or raw");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return raw;
}
