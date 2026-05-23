const COMMON_CONFIG = {
  config_path: {
    type: "string",
    description: "Path to config.yaml. Defaults to ./config.yaml when omitted.",
  },
};

export const TOOL_SCHEMAS = {
  joplin_query: {
    inputSchema: objectSchema({
      question: { type: "string", minLength: 1 },
      source_scope: enumSchema(["knowledge", "wiki", "raw"]),
      provider: enumSchema(["ollama", "codex-agent"]),
      capture: enumSchema(["auto", "brainstorming", "artifacts", "false"]),
      ...COMMON_CONFIG,
    }, ["question"]),
    outputSchema: objectSchema({
      answer: { type: "string" },
      sources: { type: "array" },
      capture_draft_id: { type: "string" },
    }),
  },
  joplin_show_capture: {
    inputSchema: objectSchema({
      capture_id: { type: "string", minLength: 1 },
      ...COMMON_CONFIG,
    }, ["capture_id"]),
    outputSchema: objectSchema({ capture: { type: "object" } }),
  },
  joplin_confirm_capture: {
    inputSchema: objectSchema({
      capture_id: { type: "string", minLength: 1 },
      writeback_workflow: { type: "boolean" },
      artifact_project: { type: "string" },
      confirmed_project: { type: "boolean" },
      ...COMMON_CONFIG,
    }, ["capture_id"]),
    outputSchema: objectSchema({
      capture_written: { type: "string" },
      writeback: { type: ["object", "null"] },
    }),
  },
  joplin_brainstorm: {
    inputSchema: objectSchema({
      topic: { type: "string", minLength: 1 },
      context: { type: "string" },
      source_scope: enumSchema(["knowledge", "wiki", "raw"]),
      provider: enumSchema(["ollama", "codex-agent"]),
      save: { type: "boolean" },
      ...COMMON_CONFIG,
    }, ["topic"]),
    outputSchema: objectSchema({
      answer: { type: "string" },
      sources: { type: "array" },
      capture_draft_id: { type: "string" },
    }),
  },
  joplin_suggest_archive_project: {
    inputSchema: objectSchema({
      title: { type: "string" },
      content: { type: "string", minLength: 1 },
      context: { type: "string" },
    }, ["content"]),
    outputSchema: objectSchema({
      suggested_projects: { type: "array" },
      suggested_title: { type: "string" },
      requires_user_confirmation: { type: "boolean" },
    }),
  },
  joplin_archive_project: {
    inputSchema: objectSchema({
      project: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      content: { type: "string" },
      capture_id: { type: "string" },
      confirmed_project: { type: "boolean" },
      writeback_workflow: { type: "boolean" },
      ...COMMON_CONFIG,
    }, ["project", "title", "confirmed_project"]),
    outputSchema: objectSchema({
      archive_written: { type: "string" },
      writeback: { type: ["object", "null"] },
    }),
  },
  joplin_sync_sources: {
    inputSchema: objectSchema({
      mode: enumSchema(["normal", "export_only", "snapshot_only"]),
      ...COMMON_CONFIG,
    }),
    outputSchema: orchestrationOutputSchema(),
  },
  joplin_compile_wiki: {
    inputSchema: objectSchema({
      mode: enumSchema(["local", "agent"]),
      dry_run: { type: "boolean" },
      batch: { type: "boolean" },
      ...COMMON_CONFIG,
    }),
    outputSchema: orchestrationOutputSchema(),
  },
};

/**
 * @param {string} name
 * @param {unknown} raw
 */
export function validateToolInput(name, raw) {
  const schema = TOOL_SCHEMAS[name]?.inputSchema;
  if (!schema) {
    return {
      ok: false,
      error: { code: "TOOL_UNKNOWN", message: `unknown tool: ${name}` },
    };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: { code: "INPUT_INVALID", message: "input must be an object" },
    };
  }
  const value = /** @type {Record<string, unknown>} */ (raw);
  for (const required of schema.required ?? []) {
    const v = value[required];
    if (typeof v !== "string" || !v.trim()) {
      if (typeof v !== "boolean") {
        return {
          ok: false,
          error: { code: "INPUT_INVALID", message: `${required} is required` },
        };
      }
    }
  }
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const v = value[key];
    if (v === undefined) continue;
    if (prop && typeof prop === "object" && Array.isArray(prop.enum)) {
      if (!prop.enum.includes(v)) {
        return {
          ok: false,
          error: {
            code: "INPUT_INVALID",
            message: `${key} must be one of: ${prop.enum.join(", ")}`,
          },
        };
      }
    }
  }
  if (name === "joplin_archive_project" && value.confirmed_project !== true) {
    return {
      ok: false,
      error: {
        code: "PROJECT_CONFIRMATION_REQUIRED",
        message: "confirmed_project must be true before archiving",
      },
    };
  }
  return { ok: true, value: { ...value } };
}

/**
 * @param {Record<string, unknown>} properties
 * @param {string[]} [required]
 */
function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/** @param {string[]} values */
function enumSchema(values) {
  return { type: "string", enum: values };
}

function orchestrationOutputSchema() {
  return objectSchema({
    exit_code: { type: "number" },
    stdout_summary: { type: "string" },
    stderr_summary: { type: "string" },
    error_code: { type: "string" },
  });
}
