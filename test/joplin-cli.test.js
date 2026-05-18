import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import { runJoplinDataApiPreflight } from "../src/joplin/data-api-client.js";

test("SCN-JDA-PF-01 Data API preflight failure surfaces JOPLIN_DATA_API_FAILED", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-jda-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ""
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: secret
  base_url: http://127.0.0.1:41184
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );

  const cfg = await loadConfig(cfgPath);
  await assert.rejects(
    () =>
      runJoplinDataApiPreflight(cfg, {
        fetch: async () => ({
          ok: false,
          status: 403,
          async text() {
            return "";
          },
        }),
      }),
    (e) => /** @type {Error & { code?: string }} */ (e).code === "JOPLIN_DATA_API_FAILED",
  );
});
