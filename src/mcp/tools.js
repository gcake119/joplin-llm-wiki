import path from "node:path";
import { TOOL_SCHEMAS, validateToolInput } from "./schema.js";
import { loadConfig } from "../config/load-config.js";
import { runKnowledgeFlowWriteback } from "../joplin/wiki-writeback.js";
import { runWorkflowPullSync } from "../joplin/workflow-sync.js";
import {
  confirmPendingCapture,
  queryKnowledge,
  showPendingCapture,
} from "../knowledge-flow/query-service.js";
import { writeProjectArchive } from "../knowledge-flow/archive-service.js";
import { runKnowledgeFlowCommand } from "../knowledge-flow/orchestration-service.js";

const TOOL_NAMES = [
  "joplin_query",
  "joplin_show_capture",
  "joplin_confirm_capture",
  "joplin_brainstorm",
  "joplin_suggest_archive_project",
  "joplin_archive_project",
  "joplin_sync_sources",
  "joplin_compile_wiki",
  "joplin_sync_workflow_notes",
];

export function listKnowledgeFlowTools() {
  return TOOL_NAMES.map((name) => ({
    name,
    description: toolDescription(name),
    inputSchema: TOOL_SCHEMAS[name].inputSchema,
    outputSchema: TOOL_SCHEMAS[name].outputSchema,
  }));
}

export { validateToolInput };

/**
 * @param {string} name
 * @param {Record<string, unknown>} input
 * @param {{ spawnImpl?: import("node:child_process").spawn, cwd?: string, loadConfig?: typeof loadConfig, runWorkflowPullSync?: typeof runWorkflowPullSync }} [deps]
 */
export async function callKnowledgeFlowTool(name, input, deps = {}) {
  const validation = validateToolInput(name, input);
  if (!validation.ok) return { ok: false, error: validation.error };

  switch (name) {
    case "joplin_query":
      return safeCall(() => callQuery(validation.value));
    case "joplin_show_capture":
      return safeCall(() => callShowCapture(validation.value));
    case "joplin_confirm_capture":
      return safeCall(() => callConfirmCapture(validation.value));
    case "joplin_brainstorm":
      return safeCall(() => callBrainstorm(validation.value));
    case "joplin_suggest_archive_project":
      return safeCall(() => callSuggestArchiveProject(validation.value));
    case "joplin_archive_project":
      return safeCall(() => callArchiveProject(validation.value));
    case "joplin_sync_sources":
      return safeCall(() => callSyncSources(validation.value, deps));
    case "joplin_compile_wiki":
      return safeCall(() => callCompileWiki(validation.value, deps));
    case "joplin_sync_workflow_notes":
      return safeCall(() => callSyncWorkflowNotes(validation.value, deps));
    default:
      return toolNotImplemented(name);
  }
}

/** @param {() => Promise<unknown>} fn */
async function safeCall(fn) {
  try {
    return await fn();
  } catch (e) {
    return {
      ok: false,
      error: {
        code: /** @type {Error & { code?: string }} */ (e).code ?? "TOOL_FAILED",
        message: redactSecrets(
          e instanceof Error ? e.message : String(e ?? "tool failed"),
        ),
      },
    };
  }
}

/** @param {string} name */
function toolNotImplemented(name) {
  return {
    ok: false,
    error: {
      code: "TOOL_NOT_IMPLEMENTED",
      message: `tool handler not implemented yet: ${name}`,
    },
  };
}

/** @param {string} message */
function redactSecrets(message) {
  return message.replace(/token[=:]\s*[^,\s]+/gi, "token=<redacted>");
}

/** @param {Record<string, unknown>} input */
async function callQuery(input) {
  const opts = new Map();
  if (typeof input.source_scope === "string") opts.set("source-scope", input.source_scope);
  if (typeof input.provider === "string") opts.set("provider", input.provider);
  if (typeof input.capture === "string" && input.capture !== "auto") {
    opts.set("capture", input.capture);
  }
  const result = await queryKnowledge({
    configPath: readConfigPath(input),
    question: String(input.question ?? ""),
    opts,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    answer: result.answer,
    sources: result.sources,
    capture_draft_id: result.captureDraft?.id ?? null,
  };
}

/** @param {Record<string, unknown>} input */
async function callShowCapture(input) {
  const result = await showPendingCapture({
    configPath: readConfigPath(input),
    id: String(input.capture_id ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, capture: result.capture };
}

/** @param {Record<string, unknown>} input */
async function callConfirmCapture(input) {
  const opts = new Map();
  if (typeof input.artifact_project === "string") {
    opts.set("artifact-project", input.artifact_project);
  }
  if (input.writeback_workflow === true) {
    opts.set("writeback-workflow", "true");
  }
  const result = await confirmPendingCapture({
    configPath: readConfigPath(input),
    id: String(input.capture_id ?? ""),
    opts,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    capture_written: result.capture_written,
    writeback: result.writeback,
  };
}

/** @param {Record<string, unknown>} input */
async function callBrainstorm(input) {
  const opts = new Map([["capture", "brainstorming"]]);
  if (typeof input.source_scope === "string") opts.set("source-scope", input.source_scope);
  if (typeof input.provider === "string") opts.set("provider", input.provider);
  const context = typeof input.context === "string" && input.context.trim()
    ? `\n\n${input.context.trim()}`
    : "";
  const result = await queryKnowledge({
    configPath: readConfigPath(input),
    question: `${String(input.topic ?? "").trim()}${context}`,
    opts,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    answer: result.answer,
    sources: result.sources,
    capture_draft_id: result.captureDraft?.id ?? null,
  };
}

/** @param {Record<string, unknown>} input */
async function callSuggestArchiveProject(input) {
  const title = String(input.title ?? "").trim();
  const content = String(input.content ?? "").trim();
  const context = String(input.context ?? "").trim();
  if (!content) {
    return {
      ok: false,
      error: { code: "ARCHIVE_CONTENT_REQUIRED", message: "content is required" },
    };
  }
  const suggestions = suggestProjectNames({ title, content, context });
  return {
    ok: true,
    suggested_projects: suggestions,
    suggested_title: title || summarizeTitle(content),
    requires_user_confirmation: true,
  };
}

/** @param {{ title: string, content: string, context: string }} args */
function suggestProjectNames(args) {
  const text = `${args.title}\n${args.content}\n${args.context}`.toLowerCase();
  /** @type {{ name: string, reason: string }[]} */
  const out = [];
  const pathMatch = args.context.match(/(?:^|\s|\/)([a-z0-9][a-z0-9-]{2,})(?:\s|$)/gi);
  const lastPathPart = pathMatch?.at(-1)?.replace(/^[\s/]+|[\s/]+$/g, "");
  if (lastPathPart) {
    pushUnique(out, lastPathPart, "Derived from the provided workspace or context path.");
  }
  if (/tainan|台南|臺南/.test(text)) {
    pushUnique(out, "tainan-city", "Matches the city or workspace mentioned in the content.");
  }
  if (/1999|petition|陳情/.test(text)) {
    pushUnique(out, "1999-dispatch", "Matches 1999 dispatch or petition handling work.");
  }
  if (/health|衛生|稽查|派案/.test(text)) {
    pushUnique(out, "health-dispatch-monitor", "Matches health bureau dispatch monitoring work.");
  }
  if (/opinion|輿情/.test(text)) {
    pushUnique(out, "opinion-monitor", "Matches public opinion monitoring work.");
  }
  pushUnique(out, slugify(args.title || summarizeTitle(args.content)), "Derived from the archive title.");
  return out.slice(0, 3);
}

/**
 * @param {{ name: string, reason: string }[]} out
 * @param {string} name
 * @param {string} reason
 */
function pushUnique(out, name, reason) {
  const normalized = slugify(name);
  if (!normalized || out.some((item) => item.name === normalized)) return;
  out.push({ name: normalized, reason });
}

/** @param {string} s */
function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** @param {string} content */
function summarizeTitle(content) {
  return content.trim().split(/\n+/)[0]?.slice(0, 80).trim() || "archive";
}

/** @param {Record<string, unknown>} input */
function readConfigPath(input) {
  return typeof input.config_path === "string" && input.config_path.trim()
    ? input.config_path
    : "./config.yaml";
}

/** @param {Record<string, unknown>} input */
async function callArchiveProject(input) {
  const content = typeof input.content === "string" ? input.content : "";
  if (!content.trim()) {
    return {
      ok: false,
      error: { code: "ARCHIVE_CONTENT_REQUIRED", message: "content is required" },
    };
  }
  const configPath = readConfigPath(input);
  const workflowRoot = pathDirname(configPath);
  const written = writeProjectArchive({
    workflowRoot,
    project: String(input.project ?? ""),
    title: String(input.title ?? ""),
    content,
  });
  let writeback = null;
  if (input.writeback_workflow === true) {
    const cfg = await loadConfig(configPath);
    writeback = await runKnowledgeFlowWriteback(
      cfg,
      path.resolve(cfg.wiki),
      [],
      {
        workflowRoot,
        workflowRelPaths: [written.rel],
        artifactsProjectNotebookTitle: written.project,
      },
    );
  }
  return {
    ok: true,
    archive_written: written.rel,
    writeback,
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ spawnImpl?: import("node:child_process").spawn, cwd?: string }} deps
 */
async function callSyncSources(input, deps) {
  const mode = typeof input.mode === "string" ? input.mode : "normal";
  const extraArgs =
    mode === "export_only" ? ["--export-only"]
    : mode === "snapshot_only" ? ["--snapshot-only"]
    : [];
  const result = await runKnowledgeFlowCommand({
    configPath: readConfigPath(input),
    subcommand: "sqlite-sync",
    extraArgs,
    spawnImpl: deps.spawnImpl,
    cwd: deps.cwd,
  });
  return {
    ok: result.ok,
    exit_code: result.exit_code,
    stdout_summary: result.stdout_summary,
    stderr_summary: result.stderr_summary,
    error_code: result.error_code,
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ spawnImpl?: import("node:child_process").spawn, cwd?: string }} deps
 */
async function callCompileWiki(input, deps) {
  const mode = typeof input.mode === "string" ? input.mode : "local";
  const extraArgs = [];
  if (input.dry_run === true) extraArgs.push("--dry-run");
  if (input.batch === true) extraArgs.push("--batch=true");
  const result = await runKnowledgeFlowCommand({
    configPath: readConfigPath(input),
    subcommand: mode === "agent" ? "agent-compile" : "wiki-compile",
    extraArgs,
    spawnImpl: deps.spawnImpl,
    cwd: deps.cwd,
  });
  return {
    ok: result.ok,
    exit_code: result.exit_code,
    stdout_summary: result.stdout_summary,
    stderr_summary: result.stderr_summary,
    error_code: result.error_code,
  };
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ loadConfig?: typeof loadConfig, runWorkflowPullSync?: typeof runWorkflowPullSync }} deps
 */
async function callSyncWorkflowNotes(input, deps) {
  const configPath = readConfigPath(input);
  const load = deps.loadConfig ?? loadConfig;
  const sync = deps.runWorkflowPullSync ?? runWorkflowPullSync;
  const cfg = await load(configPath);
  const summary = await sync(cfg, {
    dryRun: input.dry_run === true,
    section: typeof input.section === "string" ? input.section : "all",
    workflowRoot: pathDirname(configPath),
  });
  return {
    ok: true,
    ...summary,
  };
}

/** @param {string} filePath */
function pathDirname(filePath) {
  return path.dirname(path.resolve(filePath));
}

/** @param {string} name */
function toolDescription(name) {
  switch (name) {
    case "joplin_query":
      return "Answer a question from local wiki/raw knowledge and optionally create a pending capture.";
    case "joplin_show_capture":
      return "Read a pending capture without modifying it.";
    case "joplin_confirm_capture":
      return "Confirm a pending capture into brainstorming or artifacts workflow notes.";
    case "joplin_brainstorm":
      return "Brainstorm from local knowledge with a brainstorming capture intent.";
    case "joplin_suggest_archive_project":
      return "Suggest project names before archiving an artifact.";
    case "joplin_archive_project":
      return "Archive confirmed project content under artifacts/<project>.";
    case "joplin_sync_sources":
      return "Run the local Joplin SQLite source synchronization workflow.";
    case "joplin_compile_wiki":
      return "Run local or Codex-agent wiki compilation.";
    case "joplin_sync_workflow_notes":
      return "Pull @llm-wiki brainstorming/artifacts workflow edits from local Joplin back to workspace files.";
    default:
      return "joplin-llm-wiki knowledge-flow tool.";
  }
}
