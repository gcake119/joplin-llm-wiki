# joplin-llm-wiki

本專案是本機優先的 Joplin 個人知識庫管線。它把 Joplin Desktop 的 `database.sqlite` 以唯讀方式匯出成 `raw/` Markdown，再用本機 Ollama 或本機已登入的 Codex CLI 編譯成 `wiki/` 內的摘要、概念與索引。查詢預設以 `wiki/` 為優先知識層，必要時補 `raw/` 原始素材；不使用 RAG、向量資料庫或 Chroma。

本專案部分引用 [karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 與 [gatelynch/llm-knowledge-base](https://github.com/gatelynch/llm-knowledge-base) 的流程概念與 skill 設計：前者影響知識庫健檢、缺口發現與維護習慣，後者提供 `raw/`、`wiki/`、`brainstorming/`、`artifacts/` 的四層知識流。此 repo 不是上述專案的 fork 或 runtime dependency，而是把這些概念實作成以 Joplin 作為主要檢視與筆記管理介面的版本。

## Knowledge Flow

| Layer | Path | Purpose |
| --- | --- | --- |
| Raw library | `raw/` | 未編輯的原始素材。SQLite 匯出會寫到這裡；人工長期維護內容不應放在這層。 |
| Wiki | `wiki/summaries/*.md` | 每個來源一份摘要，不建立子資料夾。 |
| Wiki | `wiki/concepts/*.md` | 概念條目，交叉引用 summaries/concepts，不建立子資料夾。 |
| Wiki | `wiki/indexes/All-Sources.md`、`wiki/indexes/All-Concepts.md` | 固定索引入口。 |
| Brainstorming | `brainstorming/chat/`、`brainstorming/health/` | Query 確認後的探索紀錄、健檢與研究方向。 |
| Artifacts | `artifacts/` | 完成的作品；Joplin 寫回時必須指定專案筆記本。 |

閉環：

1. **Ingest**：新資料進 `raw/`，`wiki-compile` 與 `agent-compile` 預設都會掃完整個 `raw/` 筆記庫後更新 `wiki/`；10-15 頁單批次只作為 Ollama 本機 fallback。
2. **Query**：`query` 預設從使用者知識庫回答：先用 `wiki/`，不足時補 `raw/`；可用 `--source-scope=wiki|raw` 明確限制。
3. **File back**：有價值的 Q&A 先形成 pending capture，使用者確認後才寫回 `brainstorming/chat/` 或 `artifacts/projects/<project>/`，不直接污染 `wiki/`。
4. **Lint**：`lint` 以檔案系統檢查 wiki 佈局、frontmatter、連結、缺漏索引與未沉澱的 brainstorming。

## Commands

```bash
pnpm exec joplin-llm-wiki sqlite-sync --config ./config.yaml --export-only
pnpm exec joplin-llm-wiki sqlite-sync --config ./config.yaml --snapshot-only
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml --batch=true
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml --batch=true
pnpm exec joplin-llm-wiki query --config ./config.yaml "你的問題"
pnpm exec joplin-llm-wiki query --config ./config.yaml --confirm-capture "<id>"
pnpm exec joplin-llm-wiki lint --config ./config.yaml
```

Removed commands: `index`, `watch`, and `ask`. The vector/RAG pipeline has been removed.

## Config

Minimal config:

```yaml
raw: ./raw
raw_glob: "**/*.md"
wiki: ./wiki
wiki_glob: "**/*.md"

wiki_schema:
  path: ./wiki-schema.example.yaml
  strict: true

joplin_wiki_writeback:
  enabled: false

ollama:
  base_url: http://127.0.0.1:11434
  chat_model: gemma4:e4b
  timeout_ms: 120000

```

舊鍵 `notes_root`、`notes_glob`、`wiki_root`、`wiki.glob`、`ollama.embed_model`、`ollama.embed_batch_size`、`chroma`、`rag`、`watch`、`chunk`、`joplin_sqlite_sync.pipeline.run_index` 會被 `loadConfig` 以 `CONFIG_INVALID` 拒絕。Health GUI 會以 repair mode 載入舊 config，按儲存後移除這些 legacy 欄位。預設資料夾 `raw/` 與 `wiki/` 已列入 `.gitignore`。

## SQLite Sync Change Gate

`sqlite-sync` 可在每次匯出後偵測 `raw/` 是否有實質變更，再依設定同步 wiki 層：

```yaml
joplin_sqlite_sync:
  enabled: true
  database_path: "/ABS/PATH/database.sqlite"
  pipeline:
    compile_mode: local # local | agent | off
```

- `local`：偵測到 raw 新增、更新或刪除後執行 `wiki-compile`。
- `agent`：偵測到 raw 變更後執行 `agent-compile`，走本機已登入的 `codex exec`。
- `off`：只匯出與更新快照狀態，不自動編譯。

相容舊設定：若省略 `compile_mode`，`pipeline.run_wiki_compile: true` 視為 `local`，`false` 視為 `off`。狀態檔預設寫在 config 同目錄下的 `.joplin-llm-wiki/sqlite-sync-state.json`，不放在 `raw/`，避免 `reconcile_mode: mirror` 清理。

第一次非 dry-run 同步只建立 baseline，不觸發編譯；之後以 raw-relative path、`joplin_note_id` 與 Markdown 內容 SHA-256 判斷變更。`--export-only` 仍會匯出並更新狀態但不編譯；`--snapshot-only` 只掃現有 `raw/` 建立 baseline，不開 SQLite、不刪檔、不編譯，適合 `raw/` 已有資料時接上自動變更偵測。

## Joplin Writeback

啟用 `joplin_wiki_writeback` 時必須設定本機 Joplin Web Clipper / Data API token，且 `base_url` hostname 只能是 `127.0.0.1`、`localhost` 或 `::1`。

```yaml
joplin_data_api:
  base_url: http://127.0.0.1:41184
  token: "<clipper-token>"

joplin_wiki_writeback:
  enabled: true
  parent_notebook_title: "@llm-wiki"
  wiki_notebook_title: wiki
  brainstorming_notebook_title: brainstorming
  artifacts_notebook_title: artifacts
  artifacts_project_notebook_title: ProjectA # 僅 artifacts 按需寫回時需要
```

`wiki-compile` / `agent-compile` 的 Joplin 寫回只在全庫掃描或偵測到新筆記後同步 wiki 層：

- `@llm-wiki/wiki/summaries`
- `@llm-wiki/wiki/concepts`
- `@llm-wiki/wiki/indexes`

`brainstorming/` 與 `artifacts/` 不會跟著 wiki compile 自動同步；只有需要整理問答、健康報告或作品時才按需寫回：

- `@llm-wiki/brainstorming/chat`
- `@llm-wiki/brainstorming/health`
- `@llm-wiki/artifacts/<artifacts_project_notebook_title>`

`wiki-compile --dry-run` 與 `agent-compile --dry-run` 不會對 Joplin 發送會變更資料的 HTTP。

## Query Capture

`query` 預設會讓 LLM 判斷問答是否值得保存。若值得保存，CLI 只會建立 `.joplin-llm-wiki/pending-captures/<id>.json` 並列出 `CAPTURE_DRAFT`，不會直接寫正式筆記。確認後才落地：

```bash
pnpm exec joplin-llm-wiki query --config ./config.yaml --confirm-capture "<id>"
pnpm exec joplin-llm-wiki query --config ./config.yaml --confirm-capture "<id>" --artifact-project ProjectA
```

`--capture=brainstorming` 或 `--capture=artifacts` 可強制提出指定分類的 capture；分類只會是 `brainstorming` 或 `artifacts`。`--file-back=false` 保留為相容選項，等同停用 capture。若加 `--writeback-workflow=true`，確認後只把該次確認的 note 按需寫回 Joplin。

## Development

```bash
pnpm test
```

人可讀的知識管理輸出使用繁體中文；技術名詞、source path、filename 可保留原文。
