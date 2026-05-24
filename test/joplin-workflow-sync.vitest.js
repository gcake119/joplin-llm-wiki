import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runWorkflowPullSync } from "../src/joplin/workflow-sync.js";
import { runWorkflowSync } from "../src/commands/cmd-workflow-sync.js";

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
  return {
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
