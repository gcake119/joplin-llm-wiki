import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import { runWikiCompileFlow } from "../src/wiki/wiki-compiler.js";
import { runWikiCompile } from "../src/commands/cmd-wiki-compile.js";
import {
  summarizeSourcesForPlanner,
  extractPathsFromModelJson,
} from "../src/wiki/wiki-planner.js";
import { heuristicTopicPaths } from "../src/wiki/topic-path-heuristic.js";
import { parseWikiMarkdown } from "../src/wiki/frontmatter.js";
import { installMockOllamaFetch } from "./helpers/mock-ollama-fetch.mjs";

test("wiki-compile dry-run with empty notes_root skips planner (NO_SOURCE_MARKDOWN)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wsep-empty-dr-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
joplin_wiki_writeback:
  enabled: false
`,
    "utf8",
  );

  let logged = "";
  const origLog = console.log;
  console.log = (line) => {
    logged = typeof line === "string" ? line : JSON.stringify(line);
  };
  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
  } finally {
    console.log = origLog;
  }
  const payload = JSON.parse(logged);
  assert.strictEqual(payload.warning, "NO_SOURCE_MARKDOWN");
  assert.deepStrictEqual(payload.paths, []);
});

test("wiki-compile fails before planner when notes_root has no markdown", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wsep-empty-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
joplin_wiki_writeback:
  enabled: false
`,
    "utf8",
  );

  await assert.rejects(
    () =>
      runWikiCompileFlow({
        ctx: {
          configPath: cfgPath,
          argv: [],
          opts: new Map(),
          flags: { help: false },
        },
      }),
    (e) =>
      /** @type {{ code?: string }} */ (e).code === "WIKI_COMPILE_ABORT" &&
      String(/** @type {Error} */ (e).message).includes("notes_glob"),
  );
});

test("wiki-compile dry-run does not mutate notes_root mtimes", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restore = installMockOllamaFetch({ embedDim: 8 });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wsep-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "src.md"), "# Src\n\nx\n", "utf8");
  fs.mkdirSync(path.join(wiki, "topics"), { recursive: true });
  fs.writeFileSync(path.join(wiki, "index.md"), "---\n---\n", "utf8");
  fs.writeFileSync(path.join(wiki, "topics/overview.md"), "---\n---\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
  - topics/overview.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 15
joplin_wiki_writeback:
  enabled: false
`,
    "utf8",
  );

  const srcAbs = path.join(notes, "src.md");
  const before = fs.statSync(srcAbs).mtimeMs;

  try {
    const cfg = await loadConfig(cfgPath);
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
    const after = fs.statSync(srcAbs).mtimeMs;
    assert.strictEqual(after, before);
    assert.strictEqual(cfg.write_back.sources_enabled, false);
  } finally {
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restore();
  }
});

test("SCN-WCC-020 planner digest count widens when corpus_mode_enabled omitted versus explicit false", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-digest-"));

  /** @returns {Promise<import("../src/config/load-config.js").AppConfig>} */
  async function cfgWithCorpus(enabledExplicitFalse) {
    const tmp = path.join(tmpRoot, enabledExplicitFalse ? "off" : "on");
    fs.mkdirSync(tmp, { recursive: true });
    const notes = path.join(tmp, "notes");
    fs.mkdirSync(notes, { recursive: true });
    for (let i = 1; i <= 45; i++) {
      const name = `n-${String(i).padStart(3, "0")}.md`;
      fs.writeFileSync(path.join(notes, name), `# ${i}\n`, "utf8");
    }

    const schemaPath = path.join(tmp, "schema.yaml");
    fs.writeFileSync(
      schemaPath,
      `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
      "utf8",
    );

    const cfgPath = path.join(tmp, "cfg.yaml");
    const corpLine = enabledExplicitFalse
      ? "  corpus_mode_enabled: false\n"
      : "";
    fs.writeFileSync(
      cfgPath,
      `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
${corpLine}joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
      "utf8",
    );
    return loadConfig(cfgPath);
  }

  const wideCfg = await cfgWithCorpus(false);
  const narrowCfg = await cfgWithCorpus(true);

  const wide = await summarizeSourcesForPlanner(wideCfg);
  const narrow = await summarizeSourcesForPlanner(narrowCfg);
  assert.strictEqual(wide.digest_paths_in_prompt_count, 45);
  assert.strictEqual(narrow.digest_paths_in_prompt_count, 40);
});

test("SCN-WCC-021 corpus digest rotates with corpus_digest_offset (lex order)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-rot-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes, { recursive: true });
  ["m0.md", "m1.md", "m2.md", "m3.md", "m4.md"].forEach((name, i) => {
    fs.writeFileSync(path.join(notes, name), `# row ${i}\n`, "utf8");
  });

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  corpus_digest_max_files: 500
  corpus_digest_offset: 3
  min_pages_per_run: 0
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  const cfg = await loadConfig(cfgPath);
  const bundle = await summarizeSourcesForPlanner(cfg);
  const firstLine = bundle.summary.split("\n")[0] ?? "";
  assert.ok(firstLine.startsWith("m3.md "));
});

test("SCN-WCC-022 wiki-compile telemetry includes corpus fields on dry-run summary", async () => {
  const restore = installMockOllamaFetch({ embedDim: 8 });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-tlm-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
`,
    "utf8",
  );

  fs.writeFileSync(path.join(wiki, "index.md"), "---\nstub: z\n---\n\n", "utf8");

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 5
  min_pages_per_run: 0
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  let out = "";
  const origLog = console.log;
  console.log = (line) => {
    out = typeof line === "string" ? line : JSON.stringify(line);
  };
  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
  } finally {
    console.log = origLog;
    restore();
  }

  const payload = JSON.parse(out);
  assert.strictEqual(payload.corpus_mode, true);
  assert.strictEqual(payload.corpus_digest_paths_in_prompt_count, 1);
});

test("SCN-WCC-023 corpus-mode writer prompt includes excerpt from 11th lexicographic markdown", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  /** @type {typeof fetch | undefined} */
  const origFetchSafe = /** @ignore */ (
    typeof globalThis.fetch === "function" ? globalThis.fetch : fetch
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-11-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  for (let i = 1; i <= 15; i++) {
    const name = `z-${String(i).padStart(3, "0")}.md`;
    const token =
      i === 11 ? "CORPUS_ELEVEN_TOKEN_XYZabc" : `body-${i}-\n`;
    fs.writeFileSync(path.join(notes, name), `# h\n${token}\n`, "utf8");
  }

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - hub.md
`,
    "utf8",
  );

  fs.writeFileSync(path.join(wiki, "hub.md"), "---\nstub: hub\n---\n\n", "utf8");

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 3
  min_pages_per_run: 0
  corpus_digest_offset: 0
  corpus_writer_excerpt_mode: filesystem_slice
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const prompts = [];
  /** @ignore */
  const origFetch =
    typeof origFetchSafe === "function"
      ? origFetchSafe.bind(globalThis)
      : fetch;
  let chatCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "POST") {
      return new Response("unsupported", { status: 405 });
    }
    /** @type {Record<string, unknown>} */
    let body = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      body = {};
    }
    if (url.includes("/api/embed") || url.includes("/api/embeddings")) {
      return new Response(
        JSON.stringify({ embeddings: [[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    if (url.includes("/api/chat")) {
      chatCalls++;
      const msgs = /** @type {{messages?: Array<{role:string,content:string}>}} */ (
        body
      ).messages;
      const prompt = msgs?.[msgs.length - 1]?.content ?? "";
      prompts.push(prompt);
      if (chatCalls === 1) {
        return new Response(JSON.stringify({
          message: { content: '{"paths":["topics/hyp.md"]}' },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        message: {
          content: "# Hyp\n\nok\n",
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return /** @type {typeof fetch} */ (origFetch)(input, init);
  };

  fs.mkdirSync(path.join(wiki, "topics"), { recursive: true });
  fs.writeFileSync(path.join(wiki, "topics", "hyp.md"), "---\n---\n", "utf8");

  let stdoutSummary = "";
  const origLog = console.log.bind(console);
  console.log = (line) => {
    const s = typeof line === "string" ? line : JSON.stringify(line);
    stdoutSummary = s;
    origLog(line);
  };

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map(),
        flags: { help: false },
      },
    });
  } finally {
    console.log = origLog;
    globalThis.fetch = /** @type {typeof fetch} */ (origFetch);
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
  }

  assert.ok(prompts.length >= 2);
  const writerPrompt = prompts[prompts.length - 1] ?? "";
  assert.ok(writerPrompt.includes("CORPUS_ELEVEN_TOKEN_XYZabc"));

  const parsed = JSON.parse(stdoutSummary);
  assert.strictEqual(parsed.wiki_compile, "ok");
  assert.strictEqual(parsed.corpus_mode, true);
});

test("SCN-WCC-024 PLAN_EMPTY still emits corpus telemetry when corpus defaults on", async () => {
  /** @type {typeof fetch | undefined} */
  const origFetchSafe =
    typeof globalThis.fetch === "function" ? globalThis.fetch : fetch;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-pe-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  min_pages_per_run: 0
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  let chats = 0;
  const origFetchBind =
    typeof origFetchSafe === "function"
      ? origFetchSafe.bind(globalThis)
      : fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "POST") {
      return new Response("unsupported", { status: 405 });
    }
    /** @type {Record<string, unknown>} */
    let body = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      body = {};
    }
    if (url.includes("/api/embed") || url.includes("/api/embeddings")) {
      return new Response(JSON.stringify({ embeddings: [[1, 1, 1, 1, 1, 1, 1, 1]] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/chat")) {
      chats++;
      return new Response(JSON.stringify({
        message: {
          content: '{"paths":[]}',
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return /** @type {typeof fetch} */ (origFetchBind)(input, init);
  };

  let out = "";
  const ol = console.log;
  console.log = (ln) => {
    out = typeof ln === "string" ? ln : JSON.stringify(ln);
    ol(ln);
  };

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map(),
        flags: { help: false },
      },
    });
  } finally {
    console.log = ol;
    globalThis.fetch = /** @type {typeof fetch} */ (origFetchBind);
  }

  assert.ok(chats >= 1);
  const payload = JSON.parse(out);
  assert.strictEqual(payload.warning, "PLAN_EMPTY");
  assert.strictEqual(typeof payload.planner_raw_preview, "string");
  assert.strictEqual(payload.corpus_mode, true);
  assert.strictEqual(payload.corpus_digest_paths_in_prompt_count, 1);
});

test("SCN-WCC-030 planner empty paths fall back to wiki_schema.required_hub_pages", async () => {
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":[]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-hub-fallback-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
  - topics/hub-overview.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 50
  min_pages_per_run: 0
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stderrLines = [];
  const oe = console.error.bind(console);
  console.error = (msg, ...rest) => {
    stderrLines.push(
      typeof msg === "string"
        ? msg
        : msg != null ?
          String(msg)
        : "",
    );
    oe(msg, ...rest);
  };

  let out = "";
  const ol = console.log.bind(console);
  console.log = (ln) => {
    out = typeof ln === "string" ? ln : JSON.stringify(ln);
    ol(ln);
  };

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }

  const joinedErr = stderrLines.join("\n");
  assert.ok(
    joinedErr.includes("PLAN_EMPTY_USING_SCHEMA_HUBS"),
    "stderr should advertise hub fallback",
  );

  const payload = JSON.parse(out);
  assert.strictEqual(payload.dry_run, true);
  assert.ok(Array.isArray(payload.paths));
  assert.deepStrictEqual(
    [...payload.paths].sort(),
    ["index.md", "topics/hub-overview.md"].sort(),
  );
});

test("SCN-WCC-031 PLAN_BELOW_MIN merges required_hub_pages when planner returns few paths", async () => {
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":["solo.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-below-min-topup-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
  - topics/hub-overview.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 50
  min_pages_per_run: 10
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stderrLines = [];
  const oe = console.error.bind(console);
  console.error = (msg, ...rest) => {
    stderrLines.push(
      typeof msg === "string"
        ? msg
        : msg != null ?
          String(msg)
        : "",
    );
    oe(msg, ...rest);
  };

  let out = "";
  const ol = console.log.bind(console);
  console.log = (ln) => {
    out = typeof ln === "string" ? ln : JSON.stringify(ln);
    ol(ln);
  };

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }

  const joinedErr = stderrLines.join("\n");
  assert.ok(
    joinedErr.includes("PLAN_BELOW_MIN_TOPUP_HUBS"),
    "stderr should advertise hub top-up below min",
  );
  assert.ok(
    joinedErr.includes("PLAN_BELOW_MIN"),
    "stderr should still warn when below min_soft after top-up",
  );

  const payload = JSON.parse(out);
  assert.strictEqual(payload.dry_run, true);
  assert.deepStrictEqual(
    [...payload.paths].sort(),
    ["index.md", "solo.md", "topics/hub-overview.md"].sort(),
  );
});

test("SCN-WCC-025 corpus chroma degraded path still completes wiki-compile", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":["hub.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-deg-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - hub.md
`,
    "utf8",
  );

  fs.writeFileSync(path.join(wiki, "hub.md"), "---\nstub: hub\n---\n\n", "utf8");

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
  corpus_writer_excerpt_mode: filesystem_plus_chroma
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stderrCaptured = [];
  const oe = console.error.bind(console);
  console.error = (msg, ...rest) => {
    stderrCaptured.push(String(msg));
    oe(msg, ...rest);
  };

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map(),
        flags: { help: false },
      },
    });
  } finally {
    console.error = oe;
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restore();
  }

  const joined = stderrCaptured.join("\n");
  assert.ok(joined.includes("CORPUS_CHROMA_DEGRADED"));
});

test("SCN-WCC-026 max_pages_per_run truncates writeFileSync count", async () => {
  const plannerPaths = Array.from({ length: 20 }, (_, i) => `nested/p${i}.md`);
  const restoreMock = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      test() {
        return JSON.stringify({ paths: plannerPaths });
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-cap-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
`,
    "utf8",
  );

  fs.writeFileSync(path.join(wiki, "index.md"), "---\n---\n", "utf8");

  fs.mkdirSync(path.join(wiki, "nested"), { recursive: true });
  for (const rel of plannerPaths) {
    const abs = path.join(wiki, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "---\n---\n", "utf8");
  }

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 3
  min_pages_per_run: 0
  corpus_mode_enabled: false
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  let wikiCompileWrites = 0;
  const origWriteFileSync = fs.writeFileSync;
  const wikiNorm = path.normalize(wiki).replace(/\\/g, "/");
  /** @ignore */
  fs.writeFileSync = (...args) => {
    const pRaw = typeof args[0] === "string" ? args[0] : String(args[0]);
    const norm = path.normalize(pRaw).replace(/\\/g, "/");
    if (norm.endsWith(".md") && norm.startsWith(wikiNorm))
      wikiCompileWrites++;
    return /** @ignore */ Reflect.apply(origWriteFileSync, fs, args);
  };

  let summary = "";
  const ol = console.log;
  console.log = (ln) => {
    summary = typeof ln === "string" ? ln : JSON.stringify(ln);
    ol(ln);
  };

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map(),
        flags: { help: false },
      },
    });
  } finally {
    console.log = ol;
    /** @ignore */
    fs.writeFileSync = origWriteFileSync;
    restoreMock();
  }

  assert.strictEqual(wikiCompileWrites, 3);
  const parsed = JSON.parse(summary);
  assert.strictEqual(parsed.truncated, true);
});

test("SCN-WCC-027 emitted wiki retains compiled frontmatter under corpus defaults", async () => {
  const restorePlanner = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      test() {
        return '{"paths":["new/page.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-fm-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - hub.md
`,
    "utf8",
  );

  fs.writeFileSync(path.join(wiki, "hub.md"), "---\nstub: hub\n---\n\n", "utf8");

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map(),
        flags: { help: false },
      },
    });

    const outAbs = path.join(wiki, "new", "page.md");
    const raw = fs.readFileSync(outAbs, "utf8");
    const { data } = parseWikiMarkdown(raw);
    assert.ok(Array.isArray(data.source_refs));
    assert.strictEqual(typeof data.compiled_at, "string");
    assert.strictEqual(typeof data.compiler_revision, "string");
  } finally {
    restorePlanner();
  }
});

// Planner paths chosen so wiki path hash ⇒ distinct rotated windows (same offset mod 10 is rare fix).
test("SCN-WCC-029 per-wiki-path source_refs rotate instead of repeating lex-first trio", async () => {
  const restorePlanner = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      test() {
        return '{"paths":["idx/0a.md","idx/1b.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-src-ref-rot-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  for (let i = 0; i < 10; i++) {
    fs.writeFileSync(
      path.join(notes, `${i.toString().padStart(2, "0")}n.md`),
      `# note ${i}\n`,
      "utf8",
    );
  }

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map(),
        flags: { help: false },
      },
    });

    const raw1 = fs.readFileSync(path.join(wiki, "idx/0a.md"), "utf8");
    const raw2 = fs.readFileSync(path.join(wiki, "idx/1b.md"), "utf8");
    const d1 = parseWikiMarkdown(raw1);
    const d2 = parseWikiMarkdown(raw2);
    const refs1 = [.../** @type {string[]} */ (d1.data.source_refs)].sort();
    const refs2 = [.../** @type {string[]} */ (d2.data.source_refs)].sort();
    assert.strictEqual(Array.isArray(d1.data.source_refs), true);
    assert.strictEqual(Array.isArray(d2.data.source_refs), true);
    assert.notDeepStrictEqual(
      refs1,
      refs2,
      "expected different wiki paths to cite different rotated source_refs windows",
    );
  } finally {
    restorePlanner();
  }
});

test("SCN-WCC-SWEEP-OFFSET corpus sweep advances effective_offset across windows", async () => {
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":["page.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-sweep-off-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");
  fs.writeFileSync(path.join(notes, "b.md"), "# b\n", "utf8");
  fs.writeFileSync(path.join(notes, "c.md"), "# c\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 5
  min_pages_per_run: 0
  corpus_digest_max_files: 40
  corpus_auto_sweep:
    enabled: true
    max_windows_per_invocation: 3
    step_files: 1
    advance_state_on_dry_run: true
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stderrLines = [];
  const oe = console.error.bind(console);
  console.error = (msg, ...rest) => {
    stderrLines.push(
      typeof msg === "string"
        ? msg
        : msg != null ?
          String(msg)
        : "",
    );
    oe(msg, ...rest);
  };

  /** @type {string[]} */
  const stdoutLines = [];
  const ol = console.log.bind(console);
  console.log = (ln) => {
    stdoutLines.push(typeof ln === "string" ? ln : JSON.stringify(ln));
    ol(ln);
  };

  try {
    const code = await runWikiCompile({
      configPath: cfgPath,
      argv: [],
      opts: new Map([["dry-run", "true"]]),
      flags: { help: false },
    });
    assert.strictEqual(code, 0);

    const winMsgs = stderrLines
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter((o) => o && o.warning === "CORPUS_SWEEP_WINDOW");
    assert.strictEqual(winMsgs.length, 3);
    assert.deepStrictEqual(
      winMsgs.map((w) => w.effective_offset),
      [0, 1, 2],
    );
    assert.strictEqual(winMsgs[0].digest_count, 3);

    const summary = JSON.parse(stdoutLines[stdoutLines.length - 1]);
    assert.strictEqual(summary.corpus_sweep.windows_executed, 3);
    assert.strictEqual(summary.corpus_sweep.cycle_complete, true);
    assert.strictEqual(summary.corpus_sweep.truncated, false);
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }
});

test("SCN-WI-SWEEP-DRY-NO-ADVANCE dry-run default runs single sweep window", async () => {
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":["page.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-dry-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "n.md"), "# n\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 5
  min_pages_per_run: 0
  corpus_digest_max_files: 40
  corpus_auto_sweep:
    enabled: true
    max_windows_per_invocation: 10
    advance_state_on_dry_run: false
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stderrLines = [];
  const oe = console.error.bind(console);
  console.error = (msg, ...rest) => {
    stderrLines.push(typeof msg === "string" ? msg : String(msg ?? ""));
    oe(msg, ...rest);
  };

  const ol = console.log.bind(console);
  console.log = () => {};

  try {
    await runWikiCompile({
      configPath: cfgPath,
      argv: [],
      opts: new Map([["dry-run", "true"]]),
      flags: { help: false },
    });

    const wins = stderrLines.filter((s) => s.includes("CORPUS_SWEEP_WINDOW"));
    assert.strictEqual(wins.length, 1);
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }
});

test("SCN-WI-SWEEP-BUDGET max_pages_per_run enforced per sweep window", async () => {
  const many = Array.from({ length: 20 }, (_, i) => `"x/${i}.md"`).join(",");
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return `{"paths":[${many}]}`;
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-budget-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "y.md"), "# y\n", "utf8");
  fs.writeFileSync(path.join(notes, "z.md"), "# z\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 3
  min_pages_per_run: 0
  corpus_digest_max_files: 40
  corpus_auto_sweep:
    enabled: true
    max_windows_per_invocation: 2
    step_files: 1
    advance_state_on_dry_run: true
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stdoutLines = [];
  const ol = console.log.bind(console);
  console.log = (ln) => {
    stdoutLines.push(typeof ln === "string" ? ln : JSON.stringify(ln));
    ol(ln);
  };

  const oe = console.error.bind(console);
  console.error = () => {};

  try {
    await runWikiCompile({
      configPath: cfgPath,
      argv: [],
      opts: new Map([["dry-run", "true"]]),
      flags: { help: false },
    });

    const payloads = stdoutLines
      .slice(0, -1)
      .map((s) => JSON.parse(s))
      .filter((p) => p.dry_run === true);
    assert.strictEqual(payloads.length, 2);
    assert.strictEqual(payloads[0].paths.length, 3);
    assert.strictEqual(payloads[1].paths.length, 3);
    assert.strictEqual(payloads[0].truncated, true);
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }
});

test("SCN-WI-SWEEP-FPR fingerprint mismatch resets offset", async () => {
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":["page.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-fpr-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "one.md"), "# 1\n", "utf8");
  fs.writeFileSync(path.join(notes, "two.md"), "# 2\n", "utf8");

  const stateDir = path.join(wiki, ".joplin-llm-wiki");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "corpus-sweep-state.json"),
    JSON.stringify({
      schema_version: 1,
      next_offset: 9,
      markdown_file_count: 1,
      step_files: 40,
      updated_at_ms: 1,
    }),
    "utf8",
  );

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 5
  min_pages_per_run: 0
  corpus_digest_max_files: 40
  corpus_auto_sweep:
    enabled: true
    max_windows_per_invocation: 1
    advance_state_on_dry_run: false
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stderrLines = [];
  const oe = console.error.bind(console);
  console.error = (msg, ...rest) => {
    stderrLines.push(typeof msg === "string" ? msg : String(msg ?? ""));
    oe(msg, ...rest);
  };

  const ol = console.log.bind(console);
  console.log = () => {};

  try {
    await runWikiCompile({
      configPath: cfgPath,
      argv: [],
      opts: new Map([["dry-run", "true"]]),
      flags: { help: false },
    });

    const joined = stderrLines.join("\n");
    assert.ok(joined.includes("CORPUS_SWEEP_FINGERPRINT_RESET"));
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }
});

test("SCN-WCC-040 planner accepts JSON alias key items", () => {
  const { paths, aliasKey } = extractPathsFromModelJson(
    { items: ["topics/foo.md", "topics/bar.md"] },
    { rejectSourcePaths: true },
  );
  assert.strictEqual(aliasKey, "items");
  assert.deepStrictEqual(paths, ["topics/foo.md", "topics/bar.md"]);
});

test("SCN-WCC-041 planner retries hub-only then accepts topics", async () => {
  let calls = 0;
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        calls++;
        if (calls === 1) {
          return '{"paths":["index.md","topics/overview.md"]}';
        }
        return '{"paths":["topics/a.md","topics/b.md","topics/c.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-041-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(notes, `n${i}.md`), `# ${i}\n`, "utf8");
  }

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
  - topics/overview.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 8
  min_pages_per_run: 0
  min_topic_pages_per_run: 3
  max_planner_rounds: 3
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  const ol = console.log.bind(console);
  const oe = console.error.bind(console);
  console.log = () => {};
  console.error = () => {};

  try {
    const result = await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
    assert.strictEqual(result.dryRun, true);
    assert.ok(calls >= 2);
    const topicPaths = result.paths.filter((p) => p.startsWith("topics/"));
    assert.ok(
      topicPaths.length >= 3,
      `expected >=3 topic paths, got ${topicPaths.join(",")}`,
    );
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }
});

test("SCN-WCC-042 heuristic top-up when planner stays hub-only", async () => {
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":["index.md","topics/overview.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-042-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "aa1111.md"), "# a\n", "utf8");
  fs.writeFileSync(path.join(notes, "aa2222.md"), "# b\n", "utf8");
  fs.writeFileSync(path.join(notes, "bb3333.md"), "# c\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
  - topics/overview.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 8
  min_pages_per_run: 0
  min_topic_pages_per_run: 3
  max_planner_rounds: 2
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stderrLines = [];
  const oe = console.error.bind(console);
  console.error = (msg, ...rest) => {
    stderrLines.push(typeof msg === "string" ? msg : String(msg ?? ""));
    oe(msg, ...rest);
  };
  const ol = console.log.bind(console);
  console.log = () => {};

  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
    const joined = stderrLines.join("\n");
    assert.ok(joined.includes("PLAN_TOPIC_TOPUP_HEURISTIC"));
    const topUp = heuristicTopicPaths({
      digestRelPaths: ["aa1111.md", "aa2222.md", "bb3333.md"],
      effectiveOffset: 0,
      minTopic: 3,
      maxTopic: 6,
    });
    assert.ok(topUp.length >= 3);
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }
});

test("SCN-WCC-043 run_until_cycle_complete finishes small corpus", async () => {
  const restore = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      /** @ignore */
      test() {
        return '{"paths":["topics/win.md"]}';
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wcc-043-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# a\n", "utf8");
  fs.writeFileSync(path.join(notes, "b.md"), "# b\n", "utf8");
  fs.writeFileSync(path.join(notes, "c.md"), "# c\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 5
  min_pages_per_run: 0
  min_topic_pages_per_run: 0
  corpus_digest_max_files: 40
  corpus_auto_sweep:
    enabled: true
    max_windows_per_invocation: 2
    step_files: 1
    run_until_cycle_complete: true
    max_total_windows_per_invocation: 50
    advance_state_on_dry_run: true
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  /** @type {string[]} */
  const stdoutLines = [];
  const ol = console.log.bind(console);
  console.log = (ln) => {
    stdoutLines.push(typeof ln === "string" ? ln : JSON.stringify(ln));
    ol(ln);
  };
  const oe = console.error.bind(console);
  console.error = () => {};

  try {
    const exitCode = await runWikiCompile({
      configPath: cfgPath,
      argv: [],
      opts: new Map(),
      flags: { help: false },
    });
    assert.strictEqual(exitCode, 0);
    const summary = JSON.parse(stdoutLines[stdoutLines.length - 1]);
    assert.strictEqual(summary.corpus_sweep.cycle_complete, true);
    assert.strictEqual(summary.corpus_sweep.run_until_cycle_complete, true);
    assert.ok(summary.corpus_sweep.total_windows_executed >= 3);
  } finally {
    console.log = ol;
    console.error = oe;
    restore();
  }
});

