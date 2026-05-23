# joplin-llm-wiki

這是一套給 Joplin 用的本機知識庫整理工具。你可以把它想成：

- 從 Joplin Desktop 的 `database.sqlite` 讀出筆記，轉成 `raw/` Markdown。
- 用本機 Ollama 或本機已登入的 Codex CLI，把大量原始筆記整理成 `wiki/` 裡的摘要、概念和索引。
- 把整理好的 wiki 寫回 Joplin 的 `@llm-wiki` 筆記本，方便直接在 Joplin 裡閱讀。
- 需要問問題時，可以先查整理過的 `wiki/`，不夠再補看 `raw/` 原始筆記。

整套流程預設在本機跑；目前不使用 RAG、向量資料庫或 Chroma。若你只是想操作日常流程，可以先用 GUI，不一定要記 CLI 指令。

本專案部分引用 [karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 與 [gatelynch/llm-knowledge-base](https://github.com/gatelynch/llm-knowledge-base) 的流程概念與 skill 設計。此 repo 不是上述專案的 fork 或 runtime dependency，而是把這些概念實作成以 Joplin 作為主要檢視與筆記管理介面的版本。

## GUI

本 repo 內建一個本機 Health GUI，可以用圖形介面做常見操作：

- 檢查設定檔、`raw/`、`wiki/` 和 Ollama 連線狀態。
- 編輯常用設定，並用 `loadConfig` 驗證後再儲存。
- 從 Joplin SQLite 載入筆記本清單，勾選要匯出的筆記本。
- 執行初始化管線、只建立 raw 快照、或只重新編譯 wiki。
- 查詢知識庫、確認 query capture、執行 lint。
- 在 macOS 上安裝或解除 Ollama + `sqlite-sync` 的 LaunchAgent stack。

啟動方式：

```bash
pnpm install
pnpm exec joplin-llm-wiki-health-gui --config ./config.yaml
```

如果你還沒有設定檔，先從 `config.yaml.example` 複製一份：

```bash
cp config.yaml.example config.yaml
pnpm exec joplin-llm-wiki-health-gui --config ./config.yaml
```

## Joplin Plugin: Jarvis

本 repo 不內建向量索引，但很適合搭配 Joplin plugin [Jarvis](https://joplinapp.org/plugins/plugin/joplin.plugin.alondmnt.jarvis/) 使用。Jarvis 的 related notes / semantic search 可以在 Joplin 內即時找出與目前筆記、選取文字或搜尋語句語意相近的筆記；若 Jarvis 的向量化模型設定使用 `bge-m3` 這類多語、多粒度 embedding model，對中文與混合語言的全筆記庫 related notes 參照連結會更自然。

建議分工是：本 repo 負責從 Joplin SQLite 匯出 `raw/`、編譯 `wiki/`、並把整理後的 wiki 寫回 `@llm-wiki`；Jarvis 負責在 Joplin 使用介面中提供全筆記庫的即時語意相似筆記參照。這樣可保留本 repo 的可重建知識層，同時取得 Jarvis 在閱讀與寫作當下的 related notes 體驗。

## 知識流

| Layer | Path | Purpose |
| --- | --- | --- |
| Raw library | `raw/` | 未編輯的原始素材。SQLite 匯出會寫到這裡；人工長期維護內容不應放在這層。 |
| Wiki | `wiki/summaries/*.md` | 每個來源一份摘要，不建立子資料夾。 |
| Wiki | `wiki/concepts/*.md` | 概念條目，交叉引用 summaries/concepts，不建立子資料夾。 |
| Wiki | `wiki/indexes/All-Sources.md`、`wiki/indexes/All-Concepts.md` | 固定索引入口。 |
| Brainstorming | `brainstorming/chat/`、`brainstorming/health/` | Query 確認後的探索紀錄、健檢與研究方向。 |
| Artifacts | `artifacts/` | 完成的作品；Joplin 寫回時必須指定專案筆記本。 |

閉環：

1. **匯入**：Joplin 筆記先進 `raw/`。這層是原始資料，通常不要手動改。
2. **整理**：`wiki-compile` 或 `agent-compile` 讀完整個 `raw/`，整理成 `wiki/`。
3. **查詢**：`query` 先看整理好的 `wiki/`，必要時再補 `raw/` 原始內容。
4. **沉澱**：有價值的 Q&A 先形成 pending capture，確認後才寫到 `brainstorming/chat/` 或 `artifacts/projects/<project>/`，不直接污染 `wiki/`。
5. **Lint**：`lint` 以檔案系統檢查 wiki 佈局、frontmatter、連結、缺漏索引與未沉澱的 brainstorming。

## CLI 指令

GUI 之外，也可以用 CLI 做同樣的事，適合排程、自動化或除錯：

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
  schedule:
    every_seconds: 600 # null 表示單輪執行；設秒數才會常駐輪詢
```

- `local`：偵測到 raw 新增、更新或刪除後執行 `wiki-compile`。
- `agent`：偵測到 raw 變更後執行 `agent-compile`，走本機已登入的 `codex exec`。
- `off`：只匯出與更新快照狀態，不自動編譯。

相容舊設定：若省略 `compile_mode`，`pipeline.run_wiki_compile: true` 視為 `local`，`false` 視為 `off`。狀態檔預設寫在 config 同目錄下的 `.joplin-llm-wiki/sqlite-sync-state.json`，不放在 `raw/`，避免 `reconcile_mode: mirror` 清理。

第一次非 dry-run 同步只建立 baseline，不觸發編譯；之後以 raw-relative path、`joplin_note_id` 與 Markdown 內容 SHA-256 判斷變更。`--export-only` 仍會匯出並更新狀態但不編譯；`--snapshot-only` 只掃現有 `raw/` 建立 baseline，不開 SQLite、不刪檔、不編譯，適合 `raw/` 已有資料時接上自動變更偵測。

定時檢查不是檔案系統 watcher。要自動週期檢查 SQLite/raw snapshot，必須讓 `sqlite-sync` 以常駐輪詢或外部排程執行：設定 `joplin_sqlite_sync.schedule.every_seconds`、CLI 使用 `--every <seconds>`，或由 launchd/cron 定期啟動。若 `every_seconds: null` 且沒有 `--every`，`sqlite-sync` 只跑一輪後結束。

狀態提交點在 downstream 成功之後：若 raw 已變更且 `compile_mode` 是 `local` 或 `agent`，`sqlite-sync` 會先執行 writeback preflight，再執行對應 compile；只有 preflight 與 compile/writeback 成功後才更新 `.joplin-llm-wiki/sqlite-sync-state.json`。若 token 無效、Data API 不通、`agent-compile` 或 `wiki-compile` 失敗，state 會保留在上一個已成功處理的 snapshot，下一輪仍會重試同一批 raw 變更。每輪 stdout JSON 會包含 `state_committed`、`state_commit_reason`、`downstream_status` 與 `writeback_preflight_status`。

macOS LaunchAgent 範本使用 `RunAtLoad` 啟動；正常週期仍建議由 `schedule.every_seconds` 的單一常駐行程負責。plist 的 `KeepAlive.SuccessfulExit=false` 只用來在非零退出時受控重啟，並搭配 `ThrottleInterval` 限速；不要再同時加 `StartInterval` 與非空 `every_seconds`，避免重疊執行。LaunchAgent wrapper 會依 resolved `compile_mode` 做 readiness：`agent` 與 `off` 不等待 Ollama，`local` 才等待 Ollama `/api/tags`。

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

`wiki-compile` / `agent-compile` 非 dry-run 成功後，若 `joplin_wiki_writeback.enabled` 為 true，會把本次寫入的 compiled wiki 頁面同步到 wiki 層；透過 `sqlite-sync` 自動編譯時，只有 raw snapshot 有變更才會觸發 compile/writeback：

- `@llm-wiki/wiki/summaries`
- `@llm-wiki/wiki/concepts`
- `@llm-wiki/wiki/indexes`

`brainstorming/` 與 `artifacts/` 不會跟著 wiki compile 自動同步；只有需要整理問答、健康報告或作品時才按需寫回：

- `@llm-wiki/brainstorming/chat`
- `@llm-wiki/brainstorming/health`
- `@llm-wiki/artifacts/<artifacts_project_notebook_title>`

`wiki-compile --dry-run` 與 `agent-compile --dry-run` 不會對 Joplin 發送會變更資料的 HTTP。

若 `sqlite-sync` 的 automatic compile 在 writeback preflight 顯示 `writeback_preflight_status: "failed"`，先確認 Joplin Desktop 的 Web Clipper 服務已啟用、`joplin_data_api.base_url` 是 loopback、`joplin_data_api.token` 是目前 Clipper token。修正後重新跑同一個 `sqlite-sync` 即可；因 state 未提交，raw 變更會被重試。

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
