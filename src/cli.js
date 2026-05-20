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
    "index",
    "watch",
    "wiki-compile",
    "ask",
    "lint",
    "sqlite-sync",
    "agent-compile",
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
      code === "CORPUS_SWEEP_STATE_IO"
    ) {
      emitErr(code, String(err.message ?? err));
      return 1;
    }
    if (code === "OLLAMA_UNAVAILABLE" || code === "CHROMA_ERROR") {
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
  console.log(`joplin-llm-wiki — local Karpathy-style wiki + RAG over Joplin markdown

Usage:
  joplin-llm-wiki [options] <command> [command-options]

Commands:
  index          Index sources (and wiki when configured)
  watch          Watch sources for changes
  wiki-compile   Compile wiki pages under wiki_root
  ask            Retrieval-augmented Q&A
  lint           Karpathy lint (duplicates, orphans, contradictions, schema gaps)
  sqlite-sync    Export Joplin SQLite to notes_root; optional index + wiki-compile (--export-only: export only)
  agent-compile  Compile wiki via local Codex CLI agent workflow

Global:
  --help, -h               Show help

Common:
  --config <path>          Path to YAML config (required for commands above)

Examples:
  pnpm exec joplin-llm-wiki --help
  pnpm exec joplin-llm-wiki index --config config.yaml
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
  --dry-run=true|false       Plan without writing wiki_root files (default: false)
  --corpus-sweep=true|false  Enable wiki_ingest.corpus_auto_sweep for this invocation only (YAML corpus_auto_sweep.enabled=false otherwise applies defaults except activation)

Configuration notes:
  Corpus sweep chains multiple planner digest windows with persisted offset state under wiki_root (see README).

Run with a valid config file; see config.yaml.example.
`);
    return;
  }

  if (command === "agent-compile") {
    console.log(`agent-compile

Usage:
  joplin-llm-wiki agent-compile --config <path> [options]

Options:
  --dry-run=true|false       Print the Codex task prompt without running codex exec

Runs local Codex CLI non-interactively. Requires Codex CLI installed and logged in.
`);
    return;
  }

  if (command === "sqlite-sync") {
    console.log(`sqlite-sync

Usage:
  joplin-llm-wiki sqlite-sync --config <path> [options]

Options:
  --dry-run=true|false          Count exportable notes without writing files
  --export-only=true|false      Export only; skip configured index/wiki pipeline
  --every <seconds>             Run repeatedly at the given interval
  --select-notebooks=true       Interactive notebook picker; writes notebook_filter to config
  --run=true                    With --select-notebooks, run export after saving selection

Run with a valid config file; see config.yaml.example.
`);
    return;
  }

  console.log(`${command}

Usage:
  joplin-llm-wiki ${command} --config <path> [options]

Run with a valid config file; see config.yaml.example.
`);
}
