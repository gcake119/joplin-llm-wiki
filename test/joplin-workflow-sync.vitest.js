import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runWorkflowPullSync, runWorkflowPushSync } from "../src/joplin/workflow-sync.js";
import { runWorkflowSync, runWorkflowWriteback } from "../src/commands/cmd-workflow-sync.js";

function cfg() {
  return {
    joplin_wiki_writeback: {
      enabled: true,
      parent_notebook_title: "@llm-wiki",
      wiki_notebook_title: "wiki",
      brainstorming_notebook_title: "brainstorming",
      artifacts_notebook_title: "artifacts",
      artifacts_project_notebook_title: "ProjectA",
      topic_frontmatter_key: "domain",
      note_title_key: "title",
      max_cli_attempts: 1,
    },
    joplin_data_api: {
      base_url: "http://127.0.0.1:41184",
      token: "test-token",
      timeout_ms: 1000,
    },
  };
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-workflow-sync-"));
}

function fakeClient({ folders, notesByFolder }) {
  const updatedNotes = [];
  return {
    updatedNotes,
    pingCount: 0,
    async pingWithRetries() {
      this.pingCount++;
    },
    async listRootFolders() {
      return folders.filter((f) => f.parent_id === "");
    },
    async listChildFolders(parentId) {
      return folders.filter((f) => f.parent_id === parentId);
    },
    async listNotesInFolder(folderId) {
      return notesByFolder[folderId] ?? [];
    },
    async getNote(noteId) {
      for (const notes of Object.values(notesByFolder)) {
        const note = notes.find((n) => n.id === noteId);
        if (note) return note;
      }
      throw new Error(`missing note ${noteId}`);
    },
    async updateNoteBody(noteId, body) {
      updatedNotes.push({ noteId, body });
      for (const notes of Object.values(notesByFolder)) {
        const note = notes.find((n) => n.id === noteId);
        if (note) note.body = body;
      }
    },
  };
}

describe("REQ-JWFS-SCOPE Workflow notebook pull scope", () => {
  test("scans brainstorming and artifacts workflow notebooks without writing raw or wiki", async () => {
    const root = tmpdir();
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
        { id: "artifacts", parent_id: "root", title: "artifacts" },
        { id: "project", parent_id: "artifacts", title: "ProjectA" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "2026-05-24-sync-note", body: "Brain body" }],
        project: [{ id: "n2", title: "sync-plan", body: "Artifact body" }],
      },
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: true,
    });

    expect(summary.workflow_sync_status).toBe("ok");
    expect(summary.scanned).toBe(2);
    expect(summary.changed_files).toEqual([
      "brainstorming/chat/2026-05-24-sync-note.md",
      "artifacts/ProjectA/sync-plan.md",
    ]);
    expect(fs.existsSync(path.join(root, "raw"))).toBe(false);
    expect(fs.existsSync(path.join(root, "wiki"))).toBe(false);
  });

  test("reports missing workflow child notebooks as skipped without workspace writes", async () => {
    const root = tmpdir();
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
      ],
      notesByFolder: {},
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
    });

    expect(summary.workflow_sync_status).toBe("ok");
    expect(summary.scanned).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.changed_files).toEqual([]);
    expect(summary.details).toContainEqual(
      expect.objectContaining({
        section: "artifacts",
        status: "skipped",
        reason: "workflow_notebook_missing",
      }),
    );
    expect(fs.existsSync(path.join(root, "brainstorming"))).toBe(false);
    expect(fs.existsSync(path.join(root, "artifacts"))).toBe(false);
  });
});

describe("REQ-JWFS-MAPPING Deterministic note-to-file mapping", () => {
  test("maps brainstorming chat and health notes to matching workspace folders", async () => {
    const root = tmpdir();
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
        { id: "health", parent_id: "brain", title: "health" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "2026-05-24-sync-note", body: "Chat body" }],
        health: [{ id: "n2", title: "daily-health", body: "Health body" }],
      },
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: true,
      section: "brainstorming",
    });

    expect(summary.changed_files).toEqual([
      "brainstorming/chat/2026-05-24-sync-note.md",
      "brainstorming/health/daily-health.md",
    ]);
  });

  test("maps artifact project notes to artifacts project folder", async () => {
    const root = tmpdir();
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "artifacts", parent_id: "root", title: "artifacts" },
        { id: "project", parent_id: "artifacts", title: "ProjectA" },
      ],
      notesByFolder: {
        project: [{ id: "n1", title: "sync-plan", body: "Artifact body" }],
      },
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: true,
      section: "artifacts",
    });

    expect(summary.changed_files).toEqual(["artifacts/ProjectA/sync-plan.md"]);
  });
});

describe("REQ-JWFS-WRITE and REQ-JWFS-CONFLICT", () => {
  test("dry-run reports changed file without writing workspace content", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "brainstorming", "chat"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "brainstorming", "chat", "2026-05-24-sync-note.md"),
      "old body",
    );
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "2026-05-24-sync-note", body: "new body" }],
      },
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: true,
      section: "brainstorming",
    });

    expect(summary.updated).toBe(1);
    expect(summary.changed_files).toEqual(["brainstorming/chat/2026-05-24-sync-note.md"]);
    expect(
      fs.readFileSync(path.join(root, "brainstorming", "chat", "2026-05-24-sync-note.md"), "utf8"),
    ).toBe("old body");
  });

  test("normal run updates mapped file with Joplin note body", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "artifacts", "ProjectA"), { recursive: true });
    fs.writeFileSync(path.join(root, "artifacts", "ProjectA", "sync-plan.md"), "old body");
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "artifacts", parent_id: "root", title: "artifacts" },
        { id: "project", parent_id: "artifacts", title: "ProjectA" },
      ],
      notesByFolder: {
        project: [{ id: "n1", title: "sync-plan", body: "new body" }],
      },
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "artifacts",
    });

    expect(summary.updated).toBe(1);
    expect(fs.readFileSync(path.join(root, "artifacts", "ProjectA", "sync-plan.md"), "utf8")).toBe(
      "new body",
    );
  });

  test("fetches note body by id when folder note listing omits body", async () => {
    const root = tmpdir();
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "body-from-detail", body: "detail body" }],
      },
    });
    const originalListNotes = client.listNotesInFolder.bind(client);
    client.listNotesInFolder = async (folderId) =>
      (await originalListNotes(folderId)).map(({ id, title }) => ({ id, title }));

    await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "brainstorming",
    });

    expect(fs.readFileSync(path.join(root, "brainstorming", "chat", "body-from-detail.md"), "utf8")).toBe(
      "detail body",
    );
  });

  test("duplicate target conflict is reported and not overwritten", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "artifacts", "ProjectA"), { recursive: true });
    const target = path.join(root, "artifacts", "ProjectA", "sync-plan.md");
    fs.writeFileSync(target, "original body");
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "artifacts", parent_id: "root", title: "artifacts" },
        { id: "project", parent_id: "artifacts", title: "ProjectA" },
      ],
      notesByFolder: {
        project: [
          { id: "n1", title: "sync-plan", body: "first body" },
          { id: "n2", title: "sync-plan", body: "second body" },
        ],
      },
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "artifacts",
    });

    expect(summary.conflicts).toBe(2);
    expect(summary.updated).toBe(0);
    expect(fs.readFileSync(target, "utf8")).toBe("original body");
  });

  test("path traversal candidate is rejected without writing outside workflow roots", async () => {
    const root = tmpdir();
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "../README", body: "bad body" }],
      },
    });

    const summary = await runWorkflowPullSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "brainstorming",
    });

    expect(summary.conflicts + summary.skipped).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, "README.md"))).toBe(false);
  });
});

describe("REQ-JWFS-LOCAL Local-first Data API boundary", () => {
  test("preflight failure returns JOPLIN_DATA_API_FAILED before workspace writes", async () => {
    const root = tmpdir();
    const client = {
      async pingWithRetries() {
        throw Object.assign(new Error("HTTP 403: Invalid token"), {
          code: "JOPLIN_DATA_API_FAILED",
        });
      },
      async listRootFolders() {
        throw new Error("must not list folders after failed preflight");
      },
    };

    await expect(
      runWorkflowPullSync(cfg(), {
        client,
        workflowRoot: root,
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "JOPLIN_DATA_API_FAILED" });

    expect(fs.existsSync(path.join(root, "brainstorming"))).toBe(false);
    expect(fs.existsSync(path.join(root, "artifacts"))).toBe(false);
  });
});

describe("workflow-sync CLI command wrapper", () => {
  test("prints workflow_sync_status JSON with dry-run and section options", async () => {
    const lines = [];
    const oldLog = console.log;
    console.log = (line) => lines.push(String(line));
    try {
      const status = await runWorkflowSync(
        {
          configPath: "config.yaml",
          argv: [],
          opts: new Map([
            ["dry-run", "true"],
            ["section", "brainstorming"],
          ]),
        },
        {
          loadConfig: async () => cfg(),
          runWorkflowPullSync: async (_cfg, options) => ({
            workflow_sync_status: "ok",
            dry_run: options.dryRun,
            sections: [options.section],
            scanned: 1,
            created: 0,
            updated: 1,
            unchanged: 0,
            skipped: 0,
            conflicts: 0,
            errors: 0,
            changed_files: ["brainstorming/chat/example.md"],
            details: [],
          }),
        },
      );

      expect(status).toBe(0);
      expect(JSON.parse(lines.at(-1))).toMatchObject({
        workflow_sync_status: "ok",
        dry_run: true,
        changed_files: ["brainstorming/chat/example.md"],
      });
    } finally {
      console.log = oldLog;
    }
  });
});

describe("workflow writeback workspace-to-Joplin mapping", () => {
  test("maps artifacts/<project>/<title>.md to @llm-wiki/artifacts/<project>/<title>", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "artifacts", "開發框架"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "artifacts", "開發框架", "AI UI 設計流程：從第零步視覺概念到上線前檢查.md"),
      "workspace body",
    );
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "artifacts", parent_id: "root", title: "artifacts" },
        { id: "project", parent_id: "artifacts", title: "開發框架" },
      ],
      notesByFolder: {
        project: [
          {
            id: "n1",
            title: "AI UI 設計流程：從第零步視覺概念到上線前檢查",
            body: "joplin body",
          },
        ],
      },
    });

    const summary = await runWorkflowPushSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: true,
      section: "artifacts",
    });

    expect(summary.updated).toBe(1);
    expect(summary.changed_files).toEqual([
      "artifacts/開發框架/AI UI 設計流程：從第零步視覺概念到上線前檢查.md",
    ]);
    expect(summary.details[0]).toMatchObject({
      status: "would_update",
      joplin_notebook_path: "開發框架",
      note_id: "n1",
    });
  });

  test("maps brainstorming/chat/*.md to @llm-wiki/brainstorming/chat", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "brainstorming", "chat"), { recursive: true });
    fs.writeFileSync(path.join(root, "brainstorming", "chat", "sync-note.md"), "workspace body");
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "sync-note", body: "joplin body" }],
      },
    });

    const summary = await runWorkflowPushSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: true,
      section: "brainstorming",
    });

    expect(summary.details[0]).toMatchObject({
      target_relpath: "brainstorming/chat/sync-note.md",
      status: "would_update",
      joplin_notebook_path: "chat",
    });
  });
});

describe("workflow writeback safety", () => {
  test("dry-run reports updates without writing Joplin note body", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "brainstorming", "chat"), { recursive: true });
    fs.writeFileSync(path.join(root, "brainstorming", "chat", "sync-note.md"), "workspace body");
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "sync-note", body: "joplin body" }],
      },
    });

    await runWorkflowPushSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: true,
      section: "brainstorming",
    });

    expect(client.updatedNotes).toEqual([]);
  });

  test("normal run updates the existing mapped Joplin note", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "artifacts", "ProjectA"), { recursive: true });
    fs.writeFileSync(path.join(root, "artifacts", "ProjectA", "sync-plan.md"), "workspace body");
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "artifacts", parent_id: "root", title: "artifacts" },
        { id: "project", parent_id: "artifacts", title: "ProjectA" },
      ],
      notesByFolder: {
        project: [{ id: "n1", title: "sync-plan", body: "joplin body" }],
      },
    });

    const summary = await runWorkflowPushSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "artifacts",
    });

    expect(summary.updated).toBe(1);
    expect(client.updatedNotes).toEqual([{ noteId: "n1", body: "workspace body" }]);
  });

  test("duplicate matching notes are conflicts and are not updated", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "artifacts", "ProjectA"), { recursive: true });
    fs.writeFileSync(path.join(root, "artifacts", "ProjectA", "sync-plan.md"), "workspace body");
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "artifacts", parent_id: "root", title: "artifacts" },
        { id: "project", parent_id: "artifacts", title: "ProjectA" },
      ],
      notesByFolder: {
        project: [
          { id: "n1", title: "sync-plan", body: "first body" },
          { id: "n2", title: "sync-plan", body: "second body" },
        ],
      },
    });

    const summary = await runWorkflowPushSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "artifacts",
    });

    expect(summary.conflicts).toBe(2);
    expect(client.updatedNotes).toEqual([]);
  });

  test("missing note is reported as would_create and is not updated", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "brainstorming", "chat"), { recursive: true });
    fs.writeFileSync(path.join(root, "brainstorming", "chat", "missing.md"), "workspace body");
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
      ],
      notesByFolder: {
        chat: [],
      },
    });

    const summary = await runWorkflowPushSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "brainstorming",
    });

    expect(summary.missing).toBe(1);
    expect(summary.would_create).toBe(1);
    expect(summary.updated).toBe(0);
    expect(client.updatedNotes).toEqual([]);
  });

  test("workspace and Joplin changes since baseline are reported as conflict", async () => {
    const root = tmpdir();
    fs.mkdirSync(path.join(root, "brainstorming", "chat"), { recursive: true });
    fs.mkdirSync(path.join(root, ".joplin-llm-wiki"), { recursive: true });
    fs.writeFileSync(path.join(root, "brainstorming", "chat", "sync-note.md"), "workspace changed");
    fs.writeFileSync(
      path.join(root, ".joplin-llm-wiki", "workflow-sync-state.json"),
      JSON.stringify(
        {
          schema_version: 1,
          updated_at_ms: 1,
          workflow_root: root,
          files: {
            "brainstorming/chat/sync-note.md": {
              note_id: "n1",
              workspace_sha256:
                "7f83b1657ff1fc53b92dc18148a1d65dfa135d0b781853702322aecd2eaa6096",
              note_sha256:
                "7f83b1657ff1fc53b92dc18148a1d65dfa135d0b781853702322aecd2eaa6096",
            },
          },
        },
        null,
        2,
      ),
    );
    const client = fakeClient({
      folders: [
        { id: "root", parent_id: "", title: "@llm-wiki" },
        { id: "brain", parent_id: "root", title: "brainstorming" },
        { id: "chat", parent_id: "brain", title: "chat" },
      ],
      notesByFolder: {
        chat: [{ id: "n1", title: "sync-note", body: "joplin changed" }],
      },
    });

    const summary = await runWorkflowPushSync(cfg(), {
      client,
      workflowRoot: root,
      dryRun: false,
      section: "brainstorming",
    });

    expect(summary.conflicts).toBe(1);
    expect(summary.details[0]).toMatchObject({
      status: "conflict",
      reason: "both_sides_changed",
    });
    expect(client.updatedNotes).toEqual([]);
  });
});

describe("workflow-writeback CLI command wrapper", () => {
  test("defaults to dry-run and prints workflow writeback JSON", async () => {
    const lines = [];
    const oldLog = console.log;
    console.log = (line) => lines.push(String(line));
    try {
      const status = await runWorkflowWriteback(
        {
          configPath: "config.yaml",
          argv: [],
          opts: new Map([["section", "artifacts"]]),
        },
        {
          loadConfig: async () => cfg(),
          runWorkflowPushSync: async (_cfg, options) => ({
            workflow_sync_status: "ok",
            workflow_sync_direction: "workspace_to_joplin",
            dry_run: options.dryRun,
            sections: [options.section],
            scanned: 1,
            created: 0,
            updated: 1,
            unchanged: 0,
            skipped: 0,
            conflicts: 0,
            missing: 0,
            would_create: 0,
            errors: 0,
            changed_files: ["artifacts/ProjectA/example.md"],
            details: [],
          }),
        },
      );

      expect(status).toBe(0);
      expect(JSON.parse(lines.at(-1))).toMatchObject({
        workflow_sync_direction: "workspace_to_joplin",
        dry_run: true,
      });
    } finally {
      console.log = oldLog;
    }
  });
});
