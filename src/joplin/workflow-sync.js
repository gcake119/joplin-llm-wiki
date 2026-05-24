import fs from "node:fs";
import path from "node:path";
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
