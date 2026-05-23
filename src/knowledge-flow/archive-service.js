import fs from "node:fs";
import path from "node:path";

/**
 * @param {{
 *   workflowRoot: string,
 *   project: string,
 *   title: string,
 *   content: string,
 *   knowledgeSources?: { layer: string, path: string }[],
 * }} args
 */
export function writeProjectArchive(args) {
  const projectSlug = slugify(args.project).slice(0, 64) || "project";
  const title = args.title.trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const noteSlug = slugify(title).slice(0, 64) || "archive";
  const rel = `artifacts/${projectSlug}/${stamp}-${noteSlug}.md`;
  const abs = path.join(args.workflowRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, renderArchive({
    title,
    project: projectSlug,
    rel,
    content: args.content,
    knowledgeSources: args.knowledgeSources ?? [],
  }));
  return { rel, abs, project: projectSlug };
}

/**
 * @param {{
 *   title: string,
 *   project: string,
 *   rel: string,
 *   content: string,
 *   knowledgeSources: { layer: string, path: string }[],
 * }} args
 */
function renderArchive(args) {
  const sources = args.knowledgeSources.length
    ? args.knowledgeSources
    : [];
  return `---
title: "${yamlString(args.title)}"
created_at: "${yamlString(new Date().toISOString())}"
capture_classification: "artifacts"
project: "${yamlString(args.project)}"
capture_path: "${yamlString(args.rel)}"
knowledge_sources:
${sources.map((s) => `  - layer: "${yamlString(s.layer)}"\n    path: "${yamlString(s.path)}"`).join("\n")}
---

# 保存內容

${args.content.trim()}
`;
}

/** @param {string} s */
function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** @param {string} s */
function yamlString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
