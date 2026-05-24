/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv) {
  const { flags, positionals, opts } = parseArgv(argv);

  if (flags.help) {
    if (positionals.length === 0) {
      printGlobalHelp();
      return 0;
    }
    printCommandHelp(positionals[0]);
    return 0;
  }

  if (positionals.length === 0) {
    printGlobalHelp();
    return 0;
  }

  const command = positionals[0];
  const rest = positionals.slice(1);

  const known = new Set([
    "wiki-compile",
    "query",
    "lint",
    "sqlite-sync",
    "agent-compile",
    "workflow-sync",
  ]);

  if (!known.has(command)) {
    emitErr("BAD_COMMAND", `unknown command: ${command}`);
    return 1;
  }

  const cfgPath = opts.get("config") ?? null;
  if (!cfgPath) {
    emitErr("CONFIG_REQUIRED", `--config is required for '${command}'`);
    return 1;
  }

  const { runCommand } = await import("./commands/index.js");
  try {
    return await runCommand(command, {
      configPath: cfgPath,
      argv: rest,
      opts,
      flags,
    });
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code;
    if (
      code === "CONFIG_INVALID" ||
      code === "SCHEMA_INVALID" ||
      code === "JOPLIN_CLI_FAILED" ||
      code === "JOPLIN_CLI_WRITE_FAILED" ||
      code === "JOPLIN_DATA_API_FAILED" ||
      code === "JOPLIN_DATA_API_WRITE_FAILED" ||
      code === "FRONTMATTER_INVALID" ||
      code === "WIKI_COMPILE_ABORT" ||
      code === "SQLITE_OPEN_FAILED" ||
      code === "SQLITE_EXPORT_FAILED" ||
      code === "CODEX_CLI_UNAVAILABLE" ||
      code === "CODEX_USAGE_LIMIT" ||
      code === "AGENT_COMPILE_FAILED" ||
      code === "CORPUS_SWEEP_STATE_IO" ||
      code === "SQLITE_SYNC_STATE_IO" ||
      code === "NO_SOURCE_MARKDOWN"
    ) {
      emitErr(code, String(err.message ?? err));
      return 1;
    }
    if (code === "OLLAMA_UNAVAILABLE") {
      emitErr(code, String(err.message ?? err));
      return 2;
    }
    if (code === "LINT_JUDGE_FAILED") {
      emitErr(code, String(err.message ?? err));
      return 1;
    }
    console.error(err);
    return 3;
  }
}

/**
 * @param {string[]} argv
 */
function parseArgv(argv) {
  /** @type {{ help: boolean }} */
  const flags = { help: false };
  /** @type {Map<string, string>} */
  const opts = new Map();
  /** @type {string[]} */
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") {
      flags.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
      const rawVal =
        eq === -1
          ? argv[i + 1] && !argv[i + 1].startsWith("-")
            ? argv[++i]
            : "true"
          : a.slice(eq + 1);
      opts.set(key, rawVal);
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      const shorts = a.slice(1);
      for (const ch of shorts) {
        if (ch === "h") flags.help = true;
      }
      continue;
    }
    positionals.push(a);
  }

  return { flags, positionals, opts };
}

/**
 * @param {string} error
 * @param {string} message
 */
function emitErr(error, message) {
  console.error(JSON.stringify({ error, message }));
}

function printGlobalHelp() {
  console.log(`joplin-llm-wiki — local raw/wiki knowledge loop over Joplin markdown

Usage:
  joplin-llm-wiki [options] <command> [command-options]

Commands:
  wiki-compile   Compile wiki pages under wiki/
  query          Answer from wiki/raw knowledge and stage optional captures
  lint           Filesystem lint (wiki gaps, links, brainstorming follow-up)
  sqlite-sync    Export Joplin SQLite to raw/; optionally compile wiki when raw changed
  agent-compile  Compile wiki via local Codex CLI agent workflow
  workflow-sync  Pull @llm-wiki brainstorming/artifacts edits back to workspace files

Global:
  --help, -h               Show help

Common:
  --config <path>          Path to YAML config (required for commands above)

Examples:
  pnpm exec joplin-llm-wiki --help
  pnpm exec joplin-llm-wiki query --config config.yaml "我的問題"
`);
}

/**
 * @param {string} command
 */
function printCommandHelp(command) {
  if (command === "wiki-compile") {
    console.log(`wiki-compile

Usage:
  joplin-llm-wiki wiki-compile --config <path> [options]

Options:
  --dry-run=true|false       Plan without writing wiki/ files (default: false)
  --full-library=true|false  Full-library sweep is the default; false aliases --batch=true
  --batch=true|false         Fallback: run one Ollama planning/writing batch instead of a full-library sweep
  --corpus-sweep=false       Legacy alias for --batch=true
  --resume-stage concepts|writeback
                              concepts writes local concepts/index only; writeback publishes completed concepts to Joplin

Configuration notes:
  wiki-compile defaults to a full-library corpus sweep. The 10-15 page single
  batch is only the Ollama fallback mode.
  For staged repair, run concepts dry-run, concepts run, writeback dry-run,
  then writeback run. Concept resume never mutates Joplin.

Run with a valid config file; see config.yaml.example.
`);
    return;
  }

  if (command === "agent-compile") {
    console.log(`agent-compile

Usage:
  joplin-llm-wiki agent-compile --config <path> [options]

Options:
  --dry-run=true|false         Print the Codex task prompt without running codex exec
  --full-library=true|false    Full-library scan is the default; false aliases --batch=true
  --batch=true|false           Fallback: keep the 10-15 wiki-page batch limit
  --resume-stage concepts|writeback
                                concepts writes local concepts/index only; writeback publishes completed concepts to Joplin

Runs local Codex CLI non-interactively. Requires Codex CLI installed and logged in.
By default, scans every raw/ source and requires per-source summaries plus indexes.
For staged repair, run concepts dry-run, concepts run, writeback dry-run, then
writeback run. Concept resume never mutates Joplin.
`);
    return;
  }

  if (command === "query") {
    console.log(`query

Usage:
  joplin-llm-wiki query --config <path> [options] "<question>"
  joplin-llm-wiki query --config <path> --confirm-capture <id> [options]

Options:
  --provider ollama|codex-agent   Answer with Ollama or local Codex CLI
  --source-scope knowledge|wiki|raw
                                  Default knowledge uses wiki/ first, then raw/
  --capture=false|brainstorming|artifacts
                                  Default lets the model suggest a pending capture
  --file-back=false               Legacy alias for --capture=false
  --show-capture <id>             Print a pending capture JSON
  --confirm-capture <id>          Write a pending capture to brainstorming/ or artifacts/
  --artifact-project <name>       Required for artifacts unless configured
  --writeback-workflow=true       After confirmation, write the selected note to Joplin

Query does not use RAG, embeddings, Chroma, or vector indexes. It reads
filesystem Markdown directly and stages valuable Q&A as pending captures before
writing formal notes.
`);
    return;
  }

  if (command === "sqlite-sync") {
    console.log(`sqlite-sync

Usage:
  joplin-llm-wiki sqlite-sync --config <path> [options]

Options:
  --dry-run=true|false          Count exportable notes without writing files
  --export-only=true|false      Export only; skip configured wiki pipeline
  --snapshot-only=true|false    Build a raw snapshot baseline from existing Markdown only
  --every <seconds>             Run repeatedly at the given interval
  --select-notebooks=true       Interactive notebook picker; writes notebook_filter to config
  --run=true                    With --select-notebooks, run export after saving selection
  --list-notebooks-json=true    Print notebook tree JSON for GUI integration
  --list-notebooks-json-out <path>
                                With --list-notebooks-json, write JSON to a file instead of stdout

Config:
  joplin_sqlite_sync.pipeline.compile_mode controls post-export compilation:
    local  Run wiki-compile when raw changes
    agent  Run agent-compile when raw changes
    off    Never compile from sqlite-sync

First run records a baseline snapshot only. Later runs compare raw-relative path,
Joplin note id, and content hash. --export-only still refreshes raw and state but
never compiles; --snapshot-only skips SQLite export, deletion, and compilation.

Run with a valid config file; see config.yaml.example.
`);
    return;
  }

  if (command === "workflow-sync") {
    console.log(`workflow-sync

Usage:
  joplin-llm-wiki workflow-sync --config <path> [options]

Options:
  --dry-run=true|false          Report planned workflow file changes without writing
  --section brainstorming|artifacts|all
                                Limit pull sync to one workflow section

Pulls only @llm-wiki/brainstorming and @llm-wiki/artifacts notes from the local
Joplin Data API back into workspace brainstorming/ and artifacts/ Markdown files.
It never writes raw/ or compiled wiki/ and does not use Ollama, Chroma, or
external services.
`);
    return;
  }

  console.log(`${command}

Usage:
  joplin-llm-wiki ${command} --config <path> [options]

Run with a valid config file; see config.yaml.example.
`);
}
