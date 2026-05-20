import fs from "node:fs";
import path from "node:path";

/**
 * @param {{
 *   outDir: string,
 *   stem: string,
 *   payload: Record<string, unknown>,
 * }} args
 * @returns {{ jsonPath: string, mdPath: string }}
 */
export function writeLintReports(args) {
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:]/g, "-");
  const base = `${args.stem}-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(args.payload, null, 2), "utf8");
  const md = `# 知識庫檢查報告 ${stamp}\n\n\`\`\`json\n${JSON.stringify(args.payload, null, 2)}\n\`\`\`\n`;
  fs.writeFileSync(mdPath, md, "utf8");
  return { jsonPath, mdPath };
}
