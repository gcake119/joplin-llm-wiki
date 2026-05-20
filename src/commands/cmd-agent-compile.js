import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { discoverMarkdown } from "../fs/note-discovery.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @param {{ spawn?: typeof spawn, loadConfig?: typeof loadConfig, discoverMarkdown?: typeof discoverMarkdown }} [deps]
 */
export async function runAgentCompile(ctx, deps = {}) {
  const load = deps.loadConfig ?? loadConfig;
  const discover = deps.discoverMarkdown ?? discoverMarkdown;
  const spawnImpl = deps.spawn ?? spawn;
  const cfg = await load(ctx.configPath);
  const prompt = await buildAgentCompilePrompt(cfg, ctx.configPath, discover);
  if (ctx.opts.get("dry-run") === "true") {
    console.log(JSON.stringify({ agent_compile: "dry_run", adapter: "codex-cli", prompt }));
    return 0;
  }
  const repoRoot = process.cwd();
  const res = await runCodexExec(spawnImpl, repoRoot, prompt);
  if (res.spawnFailed || res.exitCode !== 0) {
    const err = new Error(
      `codex exec failed: exit=${res.exitCode} stderr=${res.stderrTail || ""}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "CODEX_CLI_UNAVAILABLE";
    throw err;
  }
  if (agentReportedFailure(res.finalMessage)) {
    const err = new Error(`codex agent reported incomplete compile: ${res.finalMessage.slice(-1000)}`);
    /** @type {Error & { code?: string }} */ (err).code = "AGENT_COMPILE_FAILED";
    throw err;
  }
  console.log(
    JSON.stringify({
      agent_compile: "ok",
      adapter: "codex-cli",
      notebook_count: prompt.match(/^- /gm)?.length ?? 0,
      stdout_tail: res.stdoutTail,
      final_tail: res.finalMessage.slice(-512),
    }),
  );
  return 0;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} configPath
 * @param {typeof discoverMarkdown} discover
 */
async function buildAgentCompilePrompt(cfg, configPath, discover) {
  const notesRoot = path.resolve(cfg.notes_root);
  const files = await discover(notesRoot, cfg.notes_glob);
  const slugs = [...new Set(files.map((abs) => path.relative(notesRoot, abs).split(path.sep)[0]).filter(Boolean))].sort();
  const notebookLines = slugs.map((s) => `- ${s}`).join("\n") || "- (none)";
  return `請執行 joplin-llm-wiki agent-based compile workflow。

限制：
- 不要執行 pnpm exec joplin-llm-wiki agent-compile。
- 不要執行 pnpm exec joplin-llm-wiki wiki-compile。
- 不要執行 pnpm exec joplin-llm-wiki index。
- 不要執行 pnpm exec joplin-llm-wiki sqlite-sync。
- 你就是本輪編譯 agent；請直接讀取 notes_root 來源檔並直接寫入 wiki_root。
- 不要修改 notes_root。
- 讀取 AGENTS.md、docs/llm-knowledge-flow.md、${path.relative(process.cwd(), configPath)}。
- 只讀 notes_root 內下列 notebook 目錄：
${notebookLines}
- 只寫對應 wiki_root/<notebook-slug>/ 目錄。
- 每個 wiki Markdown 檔必須使用繁體中文。
- 每個 wiki Markdown 檔必須包含 YAML frontmatter：source_refs、compiled_at、compiler_revision、domain、title。
- source_refs 必須是 notes_root 下存在的相對路徑。
- domain isolation 是硬限制：每個 wiki_root/<notebook-slug>/ 只能整理 notes_root/<同一 notebook-slug>/ 內的來源。
- 每個 wiki 檔 frontmatter 的 domain 必須等於所在目錄的 <notebook-slug>。
- 每個 wiki 檔的 source_refs 必須全部以同一個 <notebook-slug>/ 開頭；不得引用其他 notebook slug 的來源。
- 不得建立跨 notebook 的總結、比較、合併主題或全庫綜合頁。即使不同 notebook 有相似主題，也要分別寫在各自的 wiki_root/<notebook-slug>/。
- 寫作時只可根據當前 notebook slug 的來源內容下結論；不可把其他 notebook 的人物、主題、專案、日期或觀點混入。

目標：
- 逐一處理每個 notebook slug。處理某個 slug 時，先只讀 notes_root/<notebook-slug>/，再只寫 wiki_root/<notebook-slug>/index.md 與必要的 topics/*.md。
- 保留技術名詞原文；整理成可閱讀的個人知識庫。
- 若某個 notebook slug 來源不足，請在該 slug 的 index.md 簡短說明不足，不要借用其他 notebook 的材料補內容。
- 完成後回報寫入檔案清單與任何跳過原因。
- 如果無法完成或沒有寫入任何 wiki 檔，最後回覆必須包含 AGENT_COMPILE_FAILED。`;
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
    /沒有寫入\s*wiki_root/.test(finalMessage) ||
    /沒有寫入任何\s*wiki/.test(finalMessage) ||
    /failed to initialize in-process app-server client/i.test(finalMessage)
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
