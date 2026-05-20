/**
 * @param {string} command
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 *   flags: { help: boolean },
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runCommand(command, ctx) {
  switch (command) {
    case "index": {
      const { runIndex } = await import("./cmd-index.js");
      return runIndex(ctx);
    }
    case "watch": {
      const { runWatch } = await import("./cmd-watch.js");
      return runWatch(ctx);
    }
    case "wiki-compile": {
      const { runWikiCompile } = await import("./cmd-wiki-compile.js");
      return runWikiCompile(ctx);
    }
    case "ask": {
      const { runAsk } = await import("./cmd-ask.js");
      return runAsk(ctx);
    }
    case "lint": {
      const { runLint } = await import("./cmd-lint.js");
      return runLint(ctx);
    }
    case "sqlite-sync": {
      const { runSqliteSync } = await import("./cmd-sqlite-sync.js");
      return runSqliteSync(ctx);
    }
    case "agent-compile": {
      const { runAgentCompile } = await import("./cmd-agent-compile.js");
      return runAgentCompile(ctx);
    }
    default:
      return 1;
  }
}
