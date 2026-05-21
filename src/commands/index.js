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
    case "wiki-compile": {
      const { runWikiCompile } = await import("./cmd-wiki-compile.js");
      return runWikiCompile(ctx);
    }
    case "query": {
      const { runQuery } = await import("./cmd-query.js");
      return runQuery(ctx);
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
