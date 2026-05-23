import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { discoverMarkdown } from "../fs/note-discovery.js";
import { runWikiWriteback } from "../joplin/wiki-writeback.js";
import {
  parseWikiMarkdown,
  assertSourceRefsResolvable,
} from "../wiki/frontmatter.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @param {{ spawn?: typeof spawn, loadConfig?: typeof loadConfig, discoverMarkdown?: typeof discoverMarkdown, runWikiWriteback?: typeof runWikiWriteback }} [deps]
 */
export async function runAgentCompile(ctx, deps = {}) {
  const load = deps.loadConfig ?? loadConfig;
  const discover = deps.discoverMarkdown ?? discoverMarkdown;
  const spawnImpl = deps.spawn ?? spawn;
  const writeback = deps.runWikiWriteback ?? runWikiWriteback;
  const cfg = await load(ctx.configPath);
  const batchFallback =
    ctx.opts.get("batch") === "true" ||
    ctx.opts.get("full-library") === "false" ||
    ctx.opts.get("full-scan") === "false";
  const fullLibrary = !batchFallback;
  const task = await buildAgentCompileTask(cfg, ctx.configPath, discover, { fullLibrary });
  const { prompt, slugs } = task;
  if (ctx.opts.get("dry-run") === "true") {
    console.log(
      JSON.stringify({
        agent_compile: "dry_run",
        adapter: "codex-cli",
        full_library: fullLibrary,
        prompt,
      }),
    );
    return 0;
  }
  const repoRoot = process.cwd();
  const res = await runCodexExec(spawnImpl, repoRoot, prompt);
  if (res.spawnFailed || res.exitCode !== 0) {
    const text = `${res.stderrTail}\n${res.stdoutTail}`;
    const err = new Error(
      `codex exec failed: exit=${res.exitCode} stderr=${res.stderrTail || ""}`,
    );
    /** @type {Error & { code?: string }} */ (err).code =
      isCodexUsageLimit(text) ? "CODEX_USAGE_LIMIT" : "CODEX_CLI_UNAVAILABLE";
    throw err;
  }
  if (agentReportedFailure(res.finalMessage)) {
    const err = new Error(`codex agent reported incomplete compile: ${res.finalMessage.slice(-1000)}`);
    /** @type {Error & { code?: string }} */ (err).code = "AGENT_COMPILE_FAILED";
    throw err;
  }
  await validateAgentConceptOutputs(cfg, discover);
  const writebackSummary = await runAgentCompileWriteback(
    cfg,
    ctx.configPath,
    discover,
    writeback,
    slugs,
  );
  console.log(
    JSON.stringify({
      agent_compile: "ok",
      adapter: "codex-cli",
      full_library: fullLibrary,
      notebook_count: prompt.match(/^- /gm)?.length ?? 0,
      stdout_tail: res.stdoutTail,
      final_tail: res.finalMessage.slice(-512),
      ...writebackSummary,
    }),
  );
  return 0;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} configPath
 * @param {typeof discoverMarkdown} discover
 * @param {{ fullLibrary?: boolean }} [options]
 * @returns {Promise<{ prompt: string, slugs: string[] }>}
 */
async function buildAgentCompileTask(cfg, configPath, discover, options = {}) {
  const rawRoot = path.resolve(cfg.raw);
  const files = await discover(rawRoot, cfg.raw_glob);
  const sourceLines =
    files.map((abs) => `- ${path.relative(rawRoot, abs).replace(/\\/g, "/")}`).join("\n") ||
    "- (none)";
  const scopeRules = options.fullLibrary
    ? `- 初始化全庫掃描模式：本輪必須掃完整個 raw/ 清單，不能因 10-15 頁限制跳過來源。
- 必須為每個來源建立或更新一份 wiki/summaries/<source-slug>.md。
- 必須更新 wiki/indexes/All-Sources.md 與 wiki/indexes/All-Concepts.md，讓所有來源與概念可查。
- concepts 可依實際概念數量建立或更新；如一次輸出很多頁，仍不得建立子資料夾。
- 若受執行時間、額度或上下文限制無法完成全庫，最後必須明確列出未完成來源並包含 AGENT_COMPILE_FAILED。`
    : "- 一次最多更新 10-15 個 wiki 頁面。";
  const prompt = `請執行 joplin-llm-wiki agent-based compile workflow。

限制：
- 不要執行 pnpm exec joplin-llm-wiki agent-compile。
- 不要執行 pnpm exec joplin-llm-wiki wiki-compile。
- 不要執行 pnpm exec joplin-llm-wiki query。
- 不要執行 pnpm exec joplin-llm-wiki sqlite-sync。
- 你就是本輪編譯 agent；請直接讀取 raw/ 來源檔並直接寫入 wiki/。
- 不要修改 raw/。
- 讀取 AGENTS.md、docs/llm-knowledge-flow.md、${path.relative(process.cwd(), configPath)}。
- 只讀 raw/ 內下列來源檔：
${sourceLines}
- 只寫 wiki/summaries/*.md、wiki/concepts/*.md、wiki/indexes/*.md。
- 不得在 summaries、concepts、indexes 底下建立子資料夾。
- 每個 wiki Markdown 檔必須使用繁體中文。
- 每個 wiki Markdown 檔必須包含 YAML frontmatter：source_refs、compiled_at、compiler_revision、domain、title。
- source_refs 必須是 raw/ 下存在的相對路徑。
- 段落標題需依主題與來源證據選擇；不要套用固定模板。可選用核心結論、關鍵證據、背景、方法、步驟、決策紀錄、實踐經驗、我的實踐、外部觀點、疑點、待追蹤、術語、張力與缺口等標題，但沒有價值或沒有證據的段落必須省略。

目標：
- summaries：每個來源一份摘要，例如 wiki/summaries/<source-slug>.md；不要把多個來源混成一篇 summary。
- concepts：概念條目，例如 wiki/concepts/<concept-slug>.md；必須交叉引用相關 summaries/concepts。
- indexes：只允許 wiki/indexes/All-Sources.md 與 wiki/indexes/All-Concepts.md。
${scopeRules}
- 保留技術名詞原文；整理成可閱讀的個人知識庫。
- 完成後回報寫入檔案清單與任何跳過原因。
- 如果無法完成或沒有寫入任何 wiki 檔，最後回覆必須包含 AGENT_COMPILE_FAILED。`;
  return { prompt, slugs: [] };
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} configPath
 * @param {typeof discoverMarkdown} discover
 * @param {typeof runWikiWriteback} writeback
 * @param {string[]} slugs
 */
async function runAgentCompileWriteback(cfg, configPath, discover, writeback, slugs) {
  if (cfg.joplin_wiki_writeback?.enabled !== true) {
    return {};
  }
  const wikiRoot = path.resolve(cfg.wiki);
  const wikiFiles = await discover(wikiRoot, "**/*.md");
  const relPaths = wikiFiles
    .map((abs) => path.relative(wikiRoot, abs).replace(/\\/g, "/"))
    .filter(isDownstreamWritebackPath)
    .sort();
  return writeback(cfg, wikiRoot, relPaths, {
    dryRun: false,
  });
}

/** @param {string} rel */
function isDownstreamWritebackPath(rel) {
  const parts = rel.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  if (!parts[1].endsWith(".md")) return false;
  if (parts[0] === "concepts") return true;
  return parts[0] === "indexes" && parts[1] === "All-Concepts.md";
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {typeof discoverMarkdown} discover
 */
async function validateAgentConceptOutputs(cfg, discover) {
  const wikiRoot = path.resolve(cfg.wiki);
  if (!fs.existsSync(wikiRoot)) return;
  const conceptFiles = await discover(wikiRoot, "concepts/*.md");
  try {
    for (const abs of conceptFiles) {
      const parsed = parseWikiMarkdown(fs.readFileSync(abs, "utf8"));
      assertSourceRefsResolvable(parsed.data, cfg.raw);
      const title = String(parsed.data.title ?? "").trim();
      const h1 = firstMarkdownH1(parsed.body);
      if (!title || !h1 || title !== h1) {
        throw new Error(
          `concept title/H1 mismatch: ${path.relative(wikiRoot, abs).replace(/\\/g, "/")}`,
        );
      }
    }
  } catch (e) {
    const err = new Error(String(e?.message ?? e));
    /** @type {Error & { code?: string }} */ (err).code = "AGENT_COMPILE_FAILED";
    throw err;
  }
}

/** @param {string} body */
function firstMarkdownH1(body) {
  const line = body.split(/\r?\n/).find((l) => /^#\s+/.test(l));
  return line ? line.replace(/^#\s+/, "").trim() : "";
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
      `joplin-llm-wiki-agent-final-${process.pid}-${Date.now()}.txt`,
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
    child.stdout?.on("data", (c) => {
      out += String(c);
      if (out.length > 12000) out = out.slice(-12000);
    });
    child.stderr?.on("data", (c) => {
      err += String(c);
      if (err.length > 12000) err = err.slice(-12000);
    });
    child.on("error", (e) => {
      cleanupFile(finalPath);
      resolve({
        exitCode: null,
        stdoutTail: out.slice(-512),
        stderrTail: `${err}${/** @type {Error} */ (e).message}`.slice(-512),
        finalMessage: "",
        spawnFailed: true,
      });
    });
    child.on("close", (exitCode) => {
      const finalMessage = readTextFileBestEffort(finalPath);
      cleanupFile(finalPath);
      resolve({
        exitCode,
        stdoutTail: out.slice(-512),
        stderrTail: err.slice(-512),
        finalMessage,
        spawnFailed: false,
      });
    });
  });
}

/**
 * @param {string} finalMessage
 */
function agentReportedFailure(finalMessage) {
  return (
    /AGENT_COMPILE_FAILED/.test(finalMessage) ||
    /CODEX_CLI_UNAVAILABLE/.test(finalMessage) ||
    /結果未完成/.test(finalMessage) ||
    /寫入檔案清單[：:]\s*無/.test(finalMessage) ||
    /沒有寫入\s*wiki/.test(finalMessage) ||
    /沒有寫入任何\s*wiki/.test(finalMessage) ||
    /failed to initialize in-process app-server client/i.test(finalMessage)
  );
}

/** @param {string} text */
function isCodexUsageLimit(text) {
  return (
    /usage limit/i.test(text) ||
    /purchase more credits/i.test(text) ||
    /try again at/i.test(text)
  );
}

/**
 * @param {string} file
 */
function readTextFileBestEffort(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * @param {string} file
 */
function cleanupFile(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}
