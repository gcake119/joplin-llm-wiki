import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createJoplinDataApiClient } from "./data-api-client.js";

const VALID_SECTIONS = new Set(["all", "brainstorming", "artifacts"]);
const BRAINSTORMING_FOLDERS = new Set(["chat", "health"]);

export async function runWorkflowPullSync(cfg, options = {}) {
  const workflowRoot = path.resolve(options.workflowRoot ?? process.cwd());
  const dryRun = options.dryRun === true;
  const section = normalizeSection(options.section);
  const sections =
    section === "all" ? ["brainstorming", "artifacts"] : [section];
  const client =
    options.client ?? createJoplinDataApiClient(cfg, { fetch: options.fetch });
  const summary = emptySummary({ dryRun, sections });

  try {
    await client.pingWithRetries();
  } catch (e) {
    const err = new Error(
      e instanceof Error ? e.message : "Joplin Data API preflight failed",
    );
    err.code = "JOPLIN_DATA_API_FAILED";
    throw err;
  }

  const root = await findRootFolder(client, cfg.joplin_wiki_writeback.parent_notebook_title);
  if (!root) {
    for (const s of sections) {
      recordSkipped(summary, {
        section: s,
        status: "skipped",
        reason: "workflow_root_missing",
      });
    }
    return summary;
  }

  const candidates = [];
  for (const s of sections) {
    if (s === "brainstorming") {
      candidates.push(
        ...(await collectBrainstormingCandidates(cfg, client, root, workflowRoot, summary)),
      );
    } else {
      candidates.push(
        ...(await collectArtifactCandidates(cfg, client, root, workflowRoot, summary)),
      );
    }
  }

  const safeCandidates = markDuplicateConflicts(candidates, summary);
  for (const c of safeCandidates) {
    if (c.status !== "pending") continue;
    summary.scanned++;
    await applyCandidate(c, summary, { dryRun });
  }

  if (!dryRun) {
    writeWorkflowSyncState(
      workflowSyncStatePath(workflowRoot),
      buildStateFromDetails(summary.details, workflowRoot),
    );
  }

  return summary;
}

export async function runWorkflowPushSync(cfg, options = {}) {
  const workflowRoot = path.resolve(options.workflowRoot ?? process.cwd());
  const dryRun = options.dryRun !== false;
  const section = normalizeSection(options.section);
  const sections =
    section === "all" ? ["brainstorming", "artifacts"] : [section];
  const client =
    options.client ?? createJoplinDataApiClient(cfg, { fetch: options.fetch });
  const summary = emptySummary({ dryRun, sections });
  summary.workflow_sync_direction = "workspace_to_joplin";
  summary.missing = 0;
  summary.would_create = 0;

  try {
    await client.pingWithRetries();
  } catch (e) {
    const err = new Error(
      e instanceof Error ? e.message : "Joplin Data API preflight failed",
    );
    err.code = "JOPLIN_DATA_API_FAILED";
    throw err;
  }

  const root = await findRootFolder(client, cfg.joplin_wiki_writeback.parent_notebook_title);
  if (!root) {
    for (const s of sections) {
      recordSkipped(summary, {
        section: s,
        status: "skipped",
        reason: "workflow_root_missing",
      });
    }
    return summary;
  }

  const statePath = workflowSyncStatePath(workflowRoot);
  const previousState = readWorkflowSyncState(statePath);
  const nextState = previousState ?? emptyWorkflowSyncState(workflowRoot);

  for (const s of sections) {
    const baseFolder = await findChild(
      client,
      root.id,
      s === "brainstorming"
        ? cfg.joplin_wiki_writeback.brainstorming_notebook_title
        : cfg.joplin_wiki_writeback.artifacts_notebook_title,
    );
    if (!baseFolder) {
      recordSkipped(summary, {
        section: s,
        status: "skipped",
        reason: "workflow_notebook_missing",
      });
      continue;
    }
    const candidates = collectWorkspaceCandidates(workflowRoot, s, summary);
    for (const candidate of candidates) {
      summary.scanned++;
      await applyPushCandidate(candidate, {
        client,
        baseFolder,
        dryRun,
        previousState,
        nextState,
        summary,
      });
    }
  }

  if (!dryRun) writeWorkflowSyncState(statePath, nextState);
  return summary;
}

function normalizeSection(section = "all") {
  const value = String(section || "all").trim();
  if (!VALID_SECTIONS.has(value)) {
    const err = new Error(
      "workflow-sync section must be one of: brainstorming, artifacts, all",
    );
    err.code = "CONFIG_INVALID";
    throw err;
  }
  return value;
}

function emptySummary({ dryRun, sections }) {
  return {
    workflow_sync_status: "ok",
    dry_run: dryRun,
    sections,
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    changed_files: [],
    details: [],
  };
}

async function findRootFolder(client, rootTitle) {
  const roots = await client.listRootFolders();
  return roots.find((f) => f.title === rootTitle) ?? null;
}

async function findChild(client, parentId, title) {
  const children = await client.listChildFolders(parentId);
  return children.find((f) => f.title === title) ?? null;
}

async function collectBrainstormingCandidates(cfg, client, root, workflowRoot, summary) {
  const brain = await findChild(
    client,
    root.id,
    cfg.joplin_wiki_writeback.brainstorming_notebook_title,
  );
  if (!brain) {
    recordSkipped(summary, {
      section: "brainstorming",
      status: "skipped",
      reason: "workflow_notebook_missing",
    });
    return [];
  }

  const out = [];
  const children = await client.listChildFolders(brain.id);
  for (const folder of children) {
    if (!folder.title || !BRAINSTORMING_FOLDERS.has(folder.title)) {
      recordSkipped(summary, {
        section: "brainstorming",
        folder_id: folder.id,
        folder_title: folder.title,
        status: "skipped",
        reason: "unsupported_brainstorming_folder",
      });
      continue;
    }
    const notes = await client.listNotesInFolder(folder.id);
    for (const note of notes) {
      const fullNote = await noteWithBody(client, note);
      out.push(
        buildCandidate({
          workflowRoot,
          section: "brainstorming",
          folderParts: [folder.title],
          note: fullNote,
        }),
      );
    }
  }
  return out;
}

async function collectArtifactCandidates(cfg, client, root, workflowRoot, summary) {
  const artifacts = await findChild(
    client,
    root.id,
    cfg.joplin_wiki_writeback.artifacts_notebook_title,
  );
  if (!artifacts) {
    recordSkipped(summary, {
      section: "artifacts",
      status: "skipped",
      reason: "workflow_notebook_missing",
    });
    return [];
  }

  const out = [];
  const projects = await client.listChildFolders(artifacts.id);
  for (const project of projects) {
    const notes = await client.listNotesInFolder(project.id);
    for (const note of notes) {
      const fullNote = await noteWithBody(client, note);
      out.push(
        buildCandidate({
          workflowRoot,
          section: "artifacts",
          folderParts: [project.title ?? ""],
          note: fullNote,
        }),
      );
    }
  }
  return out;
}

async function noteWithBody(client, note) {
  if (typeof note.body === "string") return note;
  if (typeof client.getNote === "function" && typeof note.id === "string") {
    const full = await client.getNote(note.id);
    return { ...note, ...full };
  }
  return note;
}

function buildCandidate({ workflowRoot, section, folderParts, note }) {
  const rawParts = [...folderParts, note.title ?? ""];
  const safeParts = [];
  for (const part of rawParts) {
    const safe = safePathSegment(part);
    if (!safe) {
      return {
        status: "conflict",
        section,
        note,
        reason: "unsafe_path",
      };
    }
    safeParts.push(safe);
  }
  const filename = `${safeParts.at(-1)}.md`;
  const dirs = safeParts.slice(0, -1);
  const targetRel = path.posix.join(section, ...dirs, filename);
  const targetAbs = path.resolve(workflowRoot, targetRel);
  const allowedRoot = path.resolve(workflowRoot, section);
  if (!isInside(targetAbs, allowedRoot)) {
    return {
      status: "conflict",
      section,
      note,
      target_relpath: targetRel,
      target_abspath: targetAbs,
      reason: "target_outside_allowed_root",
    };
  }
  return {
    status: "pending",
    section,
    note,
    body: typeof note.body === "string" ? note.body : "",
    target_relpath: targetRel,
    target_abspath: targetAbs,
  };
}

function safePathSegment(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "." || raw === "..") return null;
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) return null;
  const cleaned = raw
    .replace(/[\u0000-\u001f:*?"<>|#]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  return cleaned.replace(/\.md$/i, "");
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function markDuplicateConflicts(candidates, summary) {
  const byTarget = new Map();
  for (const c of candidates) {
    if (c.status !== "pending") {
      recordConflict(summary, c);
      continue;
    }
    const list = byTarget.get(c.target_relpath) ?? [];
    list.push(c);
    byTarget.set(c.target_relpath, list);
  }

  const out = [];
  for (const list of byTarget.values()) {
    if (list.length > 1) {
      for (const c of list) {
        recordConflict(summary, { ...c, status: "conflict", reason: "duplicate_target" });
      }
      continue;
    }
    out.push(list[0]);
  }
  return out;
}

async function applyCandidate(candidate, summary, { dryRun }) {
  try {
    const exists = fs.existsSync(candidate.target_abspath);
    const current =
      exists ? fs.readFileSync(candidate.target_abspath, "utf8") : null;
    if (current === candidate.body) {
      summary.unchanged++;
      summary.details.push(detail(candidate, "unchanged", "content_equal"));
      return;
    }
    summary.changed_files.push(candidate.target_relpath);
    if (exists) summary.updated++;
    else summary.created++;
    summary.details.push(detail(candidate, exists ? "updated" : "created"));
    if (dryRun) return;
    fs.mkdirSync(path.dirname(candidate.target_abspath), { recursive: true });
    fs.writeFileSync(candidate.target_abspath, candidate.body);
  } catch (e) {
    summary.errors++;
    summary.details.push({
      ...detail(candidate, "error", "write_failed"),
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function recordSkipped(summary, item) {
  summary.skipped++;
  summary.details.push(item);
}

function recordConflict(summary, candidate) {
  summary.conflicts++;
  summary.details.push(detail(candidate, "conflict", candidate.reason ?? "conflict"));
}

function detail(candidate, status, reason = undefined) {
  return {
    section: candidate.section,
    note_id: candidate.note?.id,
    title: candidate.note?.title,
    target_relpath: candidate.target_relpath,
    status,
    ...(reason ? { reason } : {}),
  };
}

function collectWorkspaceCandidates(workflowRoot, section, summary) {
  const sectionRoot = path.resolve(workflowRoot, section);
  if (!fs.existsSync(sectionRoot)) return [];
  const out = [];
  for (const abs of listMarkdownFiles(sectionRoot)) {
    const rel = path.relative(workflowRoot, abs).split(path.sep).join("/");
    const parts = rel.split("/");
    const filename = parts.at(-1) ?? "";
    const title = filename.replace(/\.md$/i, "");
    const folderParts = parts.slice(1, -1);
    if (!title || folderParts.length === 0) {
      recordSkipped(summary, {
        section,
        target_relpath: rel,
        status: "skipped",
        reason: "unsupported_workflow_path",
      });
      continue;
    }
    if (section === "brainstorming" && !BRAINSTORMING_FOLDERS.has(folderParts[0])) {
      recordSkipped(summary, {
        section,
        target_relpath: rel,
        status: "skipped",
        reason: "unsupported_brainstorming_folder",
      });
      continue;
    }
    if (!folderParts.every(safePathSegment) || !safePathSegment(title)) {
      recordConflict(summary, {
        section,
        target_relpath: rel,
        note: { title },
        reason: "unsafe_path",
      });
      continue;
    }
    out.push({
      section,
      folderParts,
      title,
      target_relpath: rel,
      target_abspath: abs,
      body: fs.readFileSync(abs, "utf8"),
    });
  }
  return out;
}

function listMarkdownFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(abs);
    }
  }
  return out.sort();
}

async function applyPushCandidate(candidate, ctx) {
  try {
    const folder = await findFolderByParts(ctx.client, ctx.baseFolder, candidate.folderParts);
    if (!folder) {
      recordMissing(ctx.summary, candidate, "folder_missing");
      return;
    }
    const matches = (await ctx.client.listNotesInFolder(folder.id)).filter(
      (note) => note.title === candidate.title,
    );
    if (matches.length === 0) {
      recordMissing(ctx.summary, candidate, "note_missing");
      return;
    }
    if (matches.length > 1) {
      for (const note of matches) {
        recordConflict(ctx.summary, {
          ...candidate,
          note,
          reason: "duplicate_note",
        });
      }
      return;
    }
    const note = await noteWithBody(ctx.client, matches[0]);
    const noteBody = typeof note.body === "string" ? note.body : "";
    const workspaceHash = sha256(candidate.body);
    const noteHash = sha256(noteBody);
    const previous = ctx.previousState?.files?.[candidate.target_relpath];
    if (previous && previous.note_id !== note.id) {
      recordConflict(ctx.summary, {
        ...candidate,
        note,
        reason: "note_identity_changed",
      });
      return;
    }
    if (
      previous &&
      previous.workspace_sha256 !== workspaceHash &&
      previous.note_sha256 !== noteHash &&
      noteBody !== candidate.body
    ) {
      recordConflict(ctx.summary, {
        ...candidate,
        note,
        reason: "both_sides_changed",
      });
      return;
    }
    if (
      previous &&
      previous.workspace_sha256 === workspaceHash &&
      previous.note_sha256 !== noteHash &&
      noteBody !== candidate.body
    ) {
      recordConflict(ctx.summary, {
        ...candidate,
        note,
        reason: "joplin_changed",
      });
      return;
    }
    if (noteBody === candidate.body) {
      ctx.summary.unchanged++;
      ctx.summary.details.push({
        ...detail({ ...candidate, note }, "unchanged", "content_equal"),
        joplin_notebook_path: candidate.folderParts.join("/"),
      });
      updateWorkflowStateFile(ctx.nextState, candidate, note, workspaceHash, noteHash);
      return;
    }
    ctx.summary.updated++;
    ctx.summary.changed_files.push(candidate.target_relpath);
    ctx.summary.details.push({
      ...detail({ ...candidate, note }, ctx.dryRun ? "would_update" : "updated"),
      joplin_notebook_path: candidate.folderParts.join("/"),
    });
    if (!ctx.dryRun) {
      await ctx.client.updateNoteBody(note.id, candidate.body);
      updateWorkflowStateFile(ctx.nextState, candidate, note, workspaceHash, workspaceHash);
    }
  } catch (e) {
    ctx.summary.errors++;
    ctx.summary.details.push({
      ...detail(candidate, "error", "writeback_failed"),
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function findFolderByParts(client, baseFolder, parts) {
  let current = baseFolder;
  for (const part of parts) {
    const child = await findChild(client, current.id, part);
    if (!child) return null;
    current = child;
  }
  return current;
}

function recordMissing(summary, candidate, reason) {
  summary.missing++;
  summary.would_create++;
  summary.details.push({
    section: candidate.section,
    title: candidate.title,
    target_relpath: candidate.target_relpath,
    status: "would_create",
    reason,
    joplin_notebook_path: candidate.folderParts.join("/"),
  });
}

function workflowSyncStatePath(workflowRoot) {
  return path.join(workflowRoot, ".joplin-llm-wiki", "workflow-sync-state.json");
}

function emptyWorkflowSyncState(workflowRoot) {
  return {
    schema_version: 1,
    updated_at_ms: Date.now(),
    workflow_root: path.resolve(workflowRoot),
    files: {},
  };
}

function readWorkflowSyncState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (parsed?.schema_version !== 1 || typeof parsed.files !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWorkflowSyncState(statePath, state) {
  const next = { ...state, updated_at_ms: Date.now() };
  const dir = path.dirname(statePath);
  const tmp = path.join(dir, `.${path.basename(statePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, statePath);
}

function buildStateFromDetails(details, workflowRoot) {
  const state = emptyWorkflowSyncState(workflowRoot);
  for (const item of details) {
    if (!["created", "updated", "unchanged"].includes(item.status)) continue;
    if (!item.target_relpath || !item.note_id) continue;
    const abs = path.resolve(workflowRoot, item.target_relpath);
    if (!fs.existsSync(abs)) continue;
    const hash = sha256(fs.readFileSync(abs, "utf8"));
    state.files[item.target_relpath] = {
      note_id: item.note_id,
      workspace_sha256: hash,
      note_sha256: hash,
    };
  }
  return state;
}

function updateWorkflowStateFile(state, candidate, note, workspaceHash, noteHash) {
  state.files[candidate.target_relpath] = {
    note_id: note.id,
    workspace_sha256: workspaceHash,
    note_sha256: noteHash,
  };
}

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}
