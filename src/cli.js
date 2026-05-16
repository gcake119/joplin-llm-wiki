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
      code === "FRONTMATTER_INVALID" ||
      code === "WIKI_COMPILE_ABORT"
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
  console.log(`joplin-brain — local Karpathy-style wiki + RAG over Joplin markdown

Usage:
  joplin-brain [options] <command> [command-options]

Commands:
  index          Index sources (and wiki when configured)
  watch          Watch sources for changes
  wiki-compile   Compile wiki pages under wiki_root
  ask            Retrieval-augmented Q&A
  lint           Karpathy lint (duplicates, orphans, contradictions, schema gaps)

Global:
  --help, -h               Show help

Common:
  --config <path>          Path to YAML config (required for commands above)

Examples:
  pnpm exec joplin-brain --help
  pnpm exec joplin-brain index --config config.yaml
`);
}

/**
 * @param {string} command
 */
function printCommandHelp(command) {
  console.log(`${command}

Usage:
  joplin-brain ${command} --config <path> [options]

Run with a valid config file; see config.yaml.example.
`);
}
