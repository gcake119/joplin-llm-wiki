import path from "node:path";
import {
  confirmPendingCapture,
  queryKnowledge,
  showPendingCapture,
} from "../knowledge-flow/query-service.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runQuery(ctx) {
  const confirmId = ctx.opts.get("confirm-capture");
  if (confirmId) {
    const result = await confirmPendingCapture({
      configPath: ctx.configPath,
      id: confirmId,
      opts: ctx.opts,
    });
    if (!result.ok) {
      console.error(JSON.stringify(result.error));
      return result.status;
    }
    console.log(JSON.stringify({
      capture_written: result.capture_written,
      writeback: result.writeback,
    }));
    return result.status;
  }

  const showId = ctx.opts.get("show-capture");
  if (showId) {
    const result = await showPendingCapture({
      configPath: ctx.configPath,
      id: showId,
    });
    if (!result.ok) {
      console.error(JSON.stringify(result.error));
      return result.status;
    }
    console.log(JSON.stringify(result.capture, null, 2));
    return result.status;
  }

  const result = await queryKnowledge({
    configPath: ctx.configPath,
    question: ctx.argv.join(" "),
    opts: ctx.opts,
  });
  if (!result.ok) {
    console.error(JSON.stringify(result.error));
    return result.status;
  }

  console.log(result.answer);
  console.log(`SOURCES ${JSON.stringify(result.sources)}`);

  if (result.captureDraft) {
    const pendingPath = result.captureDraft.path;
    console.log(`CAPTURE_DRAFT ${JSON.stringify({
      id: result.captureDraft.id,
      classification: result.captureDraft.classification,
      title: result.captureDraft.title,
      knowledge_sources: result.captureDraft.knowledge_sources,
      confirm: result.captureDraft.confirm,
    })}`);
    console.error(JSON.stringify({
      capture_pending_id: result.captureDraft.id,
      capture_pending_path: path.relative(process.cwd(), pendingPath),
    }));
  }

  return result.status;
}
