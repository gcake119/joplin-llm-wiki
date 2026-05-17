import fs, { constants as fsConstants } from "node:fs";
import path from "node:path";

/**
 * @param {string} persistPath resolved absolute persist path for chroma data dir
 * @returns {{ persistParentWritable: boolean, detail: string | null }}
 */
export function persistParentHint(persistPath) {
  const abs = path.resolve(persistPath);
  const parent = path.dirname(abs);
  try {
    fs.accessSync(parent, fsConstants.W_OK);
    return { persistParentWritable: true, detail: null };
  } catch (e) {
    return {
      persistParentWritable: false,
      detail: String(/** @type {{ message?: string }} */ (e)?.message ?? e),
    };
  }
}
