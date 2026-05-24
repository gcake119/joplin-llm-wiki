import { describe, expect, test } from "vitest";
import {
  callKnowledgeFlowTool,
  listKnowledgeFlowTools,
  validateToolInput,
} from "../src/mcp/tools.js";

describe("REQ-MCP-WORKFLOW-SYNC MCP workflow pull sync tool", () => {
  test("joplin_sync_workflow_notes is listed and validates section input", () => {
    const tool = listKnowledgeFlowTools().find((item) => item.name === "joplin_sync_workflow_notes");

    expect(tool?.description).toMatch(/workflow/i);
    expect(tool?.inputSchema.properties.section.enum).toEqual([
      "brainstorming",
      "artifacts",
      "all",
    ]);
    expect(validateToolInput("joplin_sync_workflow_notes", { section: "invalid" })).toEqual({
      ok: false,
      error: {
        code: "INPUT_INVALID",
        message: "section must be one of: brainstorming, artifacts, all",
      },
    });
  });

  test("joplin_sync_workflow_notes returns structured dry-run summary", async () => {
    const result = await callKnowledgeFlowTool(
      "joplin_sync_workflow_notes",
      {
        config_path: "config.yaml",
        dry_run: true,
        section: "brainstorming",
      },
      {
        loadConfig: async () => ({ loaded: true }),
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

    expect(result).toMatchObject({
      ok: true,
      workflow_sync_status: "ok",
      dry_run: true,
      changed_files: ["brainstorming/chat/example.md"],
    });
  });
});
