import { spawn } from "node:child_process";
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
  console.log(
    JSON.stringify({
      agent_compile: "ok",
      adapter: "codex-cli",
      notebook_count: prompt.match(/^- /gm)?.length ?? 0,
      stdout_tail: res.stdoutTail,
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
- 不要執行 pnpm exec joplin-llm-wiki wiki-compile。
- 不要修改 notes_root。
- 讀取 AGENTS.md、docs/llm-knowledge-flow.md、${path.relative(process.cwd(), configPath)}。
- 只讀 notes_root 內下列 notebook 目錄：
${notebookLines}
- 只寫對應 wiki_root/<notebook-slug>/ 目錄。
- 每個 wiki Markdown 檔必須使用繁體中文。
- 每個 wiki Markdown 檔必須包含 YAML frontmatter：source_refs、compiled_at、compiler_revision、domain、title。
- source_refs 必須是 notes_root 下存在的相對路徑。

目標：
- 為每個 notebook slug 建立或更新 wiki_root/<notebook-slug>/index.md 與必要的 topics/*.md。
- 保留技術名詞原文；整理成可閱讀的個人知識庫。
- 完成後回報寫入檔案清單與任何跳過原因。`;
}

/**
 * @param {typeof spawn} spawnImpl
 * @param {string} repoRoot
 * @param {string} prompt
 * @returns {Promise<{ exitCode: number | null, stdoutTail: string, stderrTail: string, spawnFailed: boolean }>}
 */
function runCodexExec(spawnImpl, repoRoot, prompt) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    const child = spawnImpl(
      "codex",
      ["exec", "--cd", repoRoot, "--sandbox", "workspace-write", prompt],
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
    child.on("error", (e) =>
      resolve({
        exitCode: null,
        stdoutTail: out.slice(-512),
        stderrTail: `${err}${/** @type {Error} */ (e).message}`.slice(-512),
        spawnFailed: true,
      }),
    );
    child.on("close", (exitCode) =>
      resolve({
        exitCode,
        stdoutTail: out.slice(-512),
        stderrTail: err.slice(-512),
        spawnFailed: false,
      }),
    );
  });
}
