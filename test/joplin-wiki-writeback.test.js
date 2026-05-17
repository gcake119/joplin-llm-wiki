import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import {
  runWikiWriteback,
  normalizeWikiWritebackTopic,
  summarizeWikiWritebackDry,
} from "../src/joplin/wiki-writeback.js";
import { runWikiCompileFlow } from "../src/wiki/wiki-compiler.js";
import { installMockOllamaFetch } from "./helpers/mock-ollama-fetch.mjs";

function fakeJoplinExit0(tmp) {
  const p = path.join(tmp, "fake-joplin-exit-0");
  fs.writeFileSync(
    p,
    "#!/usr/bin/env node\nprocess.exit(0);\n",
    { mode: 0o755 },
  );
  return p;
}

function baseCfgYaml(tmp, notes, wiki, schemaPath, extra = "") {
  return `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
joplin_cli:
  enabled: true
  command: joplin
  preflight_argv:
    - config
    - version
  timeout_ms: 5000
${extra}
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`;
}

test("SCN-JWKB-CFG-01 Writeback enabled without Joplin CLI fails fast", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-cfg-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ""
joplin_wiki_writeback:
  enabled: true
joplin_cli:
  enabled: false
  command: joplin
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(cfgPath),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-JWKB-CFG-02 Defaults match notebook tree convention", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-cfg2-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ""
joplin_cli:
  enabled: true
  command: joplin
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(cfgPath);
  assert.strictEqual(cfg.joplin_wiki_writeback.enabled, true);
  assert.strictEqual(cfg.joplin_wiki_writeback.parent_notebook_title, "note-wiki");
  assert.strictEqual(cfg.joplin_wiki_writeback.topic_frontmatter_key, "domain");
  assert.strictEqual(cfg.joplin_wiki_writeback.note_title_key, "title");
});

test("SCN-WI-WB-04 Omitted enabled key defaults to writeback on (runWikiWriteback runs)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-wb04-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes);
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\nstub: true\n---\n\nx\n", "utf8");
  const fakeJ = fakeJoplinExit0(tmp);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${path.join(tmp, "schema.yaml")}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
joplin_cli:
  enabled: true
  command: ${fakeJ}
  timeout_ms: 5000
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "schema.yaml"),
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
  const cfg = await loadConfig(cfgPath);
  assert.strictEqual(cfg.joplin_wiki_writeback.enabled, true);
  let invocations = 0;
  await runWikiWriteback(cfg, wiki, ["a.md"], {
    dryRun: true,
    runCli: async () => {
      invocations++;
      return { stdout: "", stderr: "" };
    },
  });
  assert.strictEqual(invocations, 0);
});

test("normalizeWikiWritebackTopic trims and strips path chars", () => {
  assert.strictEqual(normalizeWikiWritebackTopic("  ab  "), "ab");
  assert.ok(normalizeWikiWritebackTopic("a\\b/c").includes("_"));
});

test("SCN-JWKB-DRY-01 / SCN-WI-WB-01 dry-run: no Joplin subprocess (failing joplin on PATH still ok)", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restoreFetch = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      test: () => '{"paths":["stub/page.md"]}',
    },
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-dry-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "s.md"), "# S\n\nx\n", "utf8");
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
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeJoplin = path.join(binDir, "joplin");
  fs.writeFileSync(
    fakeJoplin,
    "#!/usr/bin/env node\nprocess.exit(1)\n",
    { mode: 0o755 },
  );
  fs.writeFileSync(
    cfgPath,
    baseCfgYaml(tmp, notes, wiki, schemaPath, `
joplin_wiki_writeback:
  enabled: true
  parent_notebook_title: note-wiki
`),
    "utf8",
  );
  const prevPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${prevPath ?? ""}`;
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
    process.env.PATH = prevPath ?? "";
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restoreFetch();
  }
});

test("SCN-JWKB-TREE-01 parent missing → mkbook then topic mkbook", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-tree-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "p.md"),
    "---\ndomain: Networking\ntitle: Overview\n---\n\n# Body\n",
    "utf8",
  );
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  const fakeJ = fakeJoplinExit0(tmp);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ${wiki}
joplin_wiki_writeback:
  enabled: true
joplin_cli:
  enabled: true
  command: ${fakeJ}
  timeout_ms: 5000
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(cfgPath);
  /** @type {string[][]} */
  const argvLog = [];
  const parentId = "pid1111111111111111111111111111";
  let lsRootPass = 0;
  let lsFoldersUnderParent = 0;
  let lsNotesInTopic = 0;
  await runWikiWriteback(cfg, wiki, ["p.md"], {
    dryRun: false,
    runCli: async (_c, args) => {
      argvLog.push(args);
      if (args[0] === "ls" && args[1] === "/" && args.includes("json")) {
        lsRootPass++;
        if (lsRootPass === 1) {
          return { stdout: "[]", stderr: "" };
        }
        return {
          stdout: JSON.stringify([
            {
              id: parentId,
              parent_id: "",
              type_: 2,
              title: "note-wiki",
              deleted_time: 0,
            },
          ]),
          stderr: "",
        };
      }
      if (args[0] === "mkbook" && args[1] === "note-wiki") {
        return { stdout: "", stderr: "" };
      }
      if (
        args[0] === "ls" &&
        args.includes("json") &&
        args.includes("n") &&
        args.includes("-t")
      ) {
        lsNotesInTopic++;
        if (lsNotesInTopic === 1) return { stdout: "[]", stderr: "" };
        return {
          stdout: JSON.stringify([
            {
              id: "nid22222222222222222222222222222",
              type_: 1,
              title: "Overview",
              deleted_time: 0,
            },
          ]),
          stderr: "",
        };
      }
      if (args[0] === "ls" && args.includes("json") && args[1] !== "/") {
        lsFoldersUnderParent++;
        if (lsFoldersUnderParent === 1) return { stdout: "[]", stderr: "" };
        return {
          stdout: JSON.stringify([
            {
              id: "sub1",
              parent_id: parentId,
              type_: 2,
              title: "Networking",
              deleted_time: 0,
            },
          ]),
          stderr: "",
        };
      }
      if (args[0] === "mkbook" && args[1] === "Networking") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "use") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "mknote") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "set") {
        return { stdout: "", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    },
  });
  assert.ok(argvLog.some((a) => a[0] === "mkbook" && a[1] === "note-wiki"));
  assert.ok(argvLog.some((a) => a[0] === "mkbook" && a[1] === "Networking"));
});

test("SCN-JWKB-UPSERT-01 title from frontmatter under topic notebook", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-up-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "foo.md"),
    '---\ndomain: Security\ntitle: "Overview"\n---\n\nHello\n',
    "utf8",
  );
  const cfg = await loadConfig(
    await writeMiniCfg(tmp, wiki, true),
  );
  /** @type {string[][]} */
  const uses = [];
  let lsNotePass = 0;
  await runWikiWriteback(cfg, wiki, ["foo.md"], {
    dryRun: false,
    runCli: async (_c, args) => {
      if (args[0] === "use") uses.push(args);
      if (args[0] === "ls" && args[1] === "/" && args.includes("json")) {
        return {
          stdout: JSON.stringify([
            {
              id: "p",
              parent_id: "",
              type_: 2,
              title: "note-wiki",
              deleted_time: 0,
            },
          ]),
          stderr: "",
        };
      }
      if (
        args[0] === "ls" &&
        args.includes("json") &&
        args.includes("-t") &&
        args.includes("n")
      ) {
        lsNotePass++;
        if (lsNotePass === 1) return { stdout: "[]", stderr: "" };
        return {
          stdout: JSON.stringify([
            {
              id: "n1",
              type_: 1,
              title: "Overview",
              deleted_time: 0,
            },
          ]),
          stderr: "",
        };
      }
      if (args[0] === "ls" && args.includes("json") && args[1] !== "/") {
        return {
          stdout: JSON.stringify([
            {
              id: "s",
              parent_id: "p",
              type_: 2,
              title: "Security",
              deleted_time: 0,
            },
          ]),
          stderr: "",
        };
      }
      if (args[0] === "set") {
        assert.strictEqual(args[3].includes("Hello"), true);
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "mknote") {
        return { stdout: "", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    },
  });
  assert.ok(uses.some((u) => u[1] === "note-wiki/Security"));
});

test("SCN-JWKB-CLI-01 retries then JOPLIN_CLI_WRITE_FAILED", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-cli-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\nstub: true\n---\n\nx\n", "utf8");
  const cfg = await loadConfig(await writeMiniCfg(tmp, wiki, true));
  let n = 0;
  await assert.rejects(
    () =>
      runWikiWriteback(cfg, wiki, ["a.md"], {
        dryRun: false,
        runCli: async () => {
          n++;
          const err = new Error("exit 1");
          /** @type {Error & { code?: string }} */ (err).code = "JOPLIN_CLI_FAILED";
          throw err;
        },
      }),
    (e) => /** @type {{ code?: string }} */ (e).code === "JOPLIN_CLI_WRITE_FAILED",
  );
  assert.strictEqual(n, cfg.joplin_wiki_writeback.max_cli_attempts);
});

test("SCN-JWKB-LF-01 writeback mock does not call fetch", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-lf-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\nstub: true\n---\n\nx\n", "utf8");
  const cfg = await loadConfig(await writeMiniCfg(tmp, wiki, true));
  let fetchCalls = 0;
  let lfLsNote = 0;
  const orig = globalThis.fetch;
  // @ts-expect-error stub
  globalThis.fetch = async () => {
    fetchCalls++;
    return /** @type {any} */ ({});
  };
  try {
    await runWikiWriteback(cfg, wiki, ["a.md"], {
      dryRun: false,
      runCli: async (_c, args) => {
        if (args[0] === "ls" && args[1] === "/" && args.includes("json")) {
          return {
            stdout: JSON.stringify([
              {
                id: "p",
                parent_id: "",
                type_: 2,
                title: "note-wiki",
                deleted_time: 0,
              },
            ]),
            stderr: "",
          };
        }
        if (
          args[0] === "ls" &&
          args.includes("json") &&
          args.includes("-t") &&
          args.includes("n")
        ) {
          lfLsNote++;
          if (lfLsNote === 1) return { stdout: "[]", stderr: "" };
          return {
            stdout: JSON.stringify([
              { id: "n1", type_: 1, title: "a", deleted_time: 0 },
            ]),
            stderr: "",
          };
        }
        if (args[0] === "ls" && args.includes("json") && args[1] !== "/") {
          return {
            stdout: JSON.stringify([
              {
                id: "t",
                parent_id: "p",
                type_: 2,
                title: "_uncategorized",
                deleted_time: 0,
              },
            ]),
            stderr: "",
          };
        }
        if (args[0] === "mknote") {
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "set") return { stdout: "", stderr: "" };
        if (args[0] === "use") return { stdout: "", stderr: "" };
        return { stdout: "[]", stderr: "" };
      },
    });
  } finally {
    globalThis.fetch = orig;
  }
  assert.strictEqual(fetchCalls, 0);
});

test("SCN-JWKB-ERR-01 wiki-compile writeback preflight failure → JOPLIN_CLI_FAILED", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restoreFetch = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      test: () => '{"paths":["stub/x.md"]}',
    },
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-err-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "s.md"), "# S\n\ny\n", "utf8");
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
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeJoplin = path.join(binDir, "joplin");
  fs.writeFileSync(
    fakeJoplin,
    "#!/usr/bin/env node\nprocess.exit(1);\n",
    { mode: 0o755 },
  );
  fs.writeFileSync(
    cfgPath,
    baseCfgYaml(tmp, notes, wiki, schemaPath, `
joplin_wiki_writeback:
  enabled: true
`),
    "utf8",
  );
  const prevPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${prevPath ?? ""}`;
  try {
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
      (e) => /** @type {{ code?: string }} */ (e).code === "JOPLIN_CLI_FAILED",
    );
  } finally {
    process.env.PATH = prevPath ?? "";
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restoreFetch();
  }
});

test("summarizeWikiWritebackDry counts collisions", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-sum-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\ntitle: T\n---\n\n1\n", "utf8");
  fs.writeFileSync(path.join(wiki, "b.md"), "---\ntitle: T\n---\n\n2\n", "utf8");
  const cfg = await loadConfig(await writeMiniCfg(tmp, wiki, true));
  const s = summarizeWikiWritebackDry(cfg, wiki, ["a.md", "b.md"]);
  assert.strictEqual(s.writeback_collision_count, 1);
  assert.strictEqual(s.writeback_would_write, 2);
});

/**
 * @param {string} tmp
 * @param {string} wiki
 * @param {boolean} cliOk
 */
async function writeMiniCfg(tmp, wiki, cliOk) {
  const cfgPath = path.join(tmp, "m.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  const fakeJ = fakeJoplinExit0(tmp);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ${wiki}
joplin_wiki_writeback:
  enabled: true
joplin_cli:
  enabled: ${cliOk}
  command: ${fakeJ}
  timeout_ms: 5000
chroma:
  persist_path: ${path.join(tmp, "c")}
`,
    "utf8",
  );
  return cfgPath;
}
