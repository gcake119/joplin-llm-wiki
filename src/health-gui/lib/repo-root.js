import fs from "node:fs";
import path from "node:path";

/**
 * Walk upward from `startDir` to find the joplin-brain repository root (package.json name).
 * @param {string} startDir
 * @returns {string}
 */
export function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg && pkg.name === "joplin-brain") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("joplin-brain repo root not found");
    }
    dir = parent;
  }
}
