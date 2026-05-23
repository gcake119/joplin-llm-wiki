# joplin-llm-wiki

這是一套給 Joplin 用的本機知識庫整理工具。你可以把它想成：

- 從 Joplin Desktop 的 `database.sqlite` 讀出筆記，轉成 `raw/` Markdown。
- 用本機 Ollama 或本機已登入的 Codex CLI，把大量原始筆記整理成 `wiki/` 裡的摘要、概念和索引。
- 把整理好的 wiki 寫回 Joplin 的 `@llm-wiki` 筆記本，方便直接在 Joplin 裡閱讀。
- 需要問問題時，可以先查整理過的 `wiki/`，不夠再補看 `raw/` 原始筆記。

整套流程預設在本機跑；目前不使用 RAG、向量資料庫或 Chroma。若你只是想操作日常流程，可以先用 GUI，不一定要記 CLI 指令。

本專案部分引用 [karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 與 [gatelynch/llm-knowledge-base](https://github.com/gatelynch/llm-knowledge-base) 的流程概念與 skill 設計。此 repo 不是上述專案的 fork 或 runtime dependency，而是把這些概念實作成以 Joplin 作為主要檢視與筆記管理介面的版本。

## GUI

本 repo 內建一個本機 Joplin-LLM-wiki tool，可以用圖形介面做常見操作：

- 檢查設定檔、`raw/`、`wiki/` 和 Ollama 連線狀態。
- 編輯常用設定，並用 `loadConfig` 驗證後再儲存。
- 從 Joplin SQLite 載入筆記本清單，勾選要匯出的筆記本。
- 執行初始化管線、只建立 raw 快照、重新編譯 wiki。
- 從 concepts 或 writeback 階段接續，支援 local 與 agent 模式的 dry-run / run。
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

## Codex / Cursor MCP

本 repo 也提供本機 MCP server，讓 Codex、Cursor 或其他 MCP client
可以在對話中用 structured tools 操作同一套知識流。MCP 只透過 stdio
包裝既有 CLI/service 行為，不開公網 HTTP listener，也不改變
`raw/`、`wiki/`、`brainstorming/`、`artifacts/` 的資料邊界。

MCP 的對話設計是「一個 skill 作為入口，LLM 判斷知識流階段，MCP tools
執行確定性動作」。`joplin-knowledge-flow` skill 只提供操作規則與
guardrails；真正讀寫檔案、同步 Joplin、編譯 wiki 或歸檔 project 的行為
都由 MCP server tools 執行。

常見意圖與 tool 對應：

| Intent | Tool |
| --- | --- |
| 查詢本機知識庫 | `joplin_query` |
| 發散、整理想法 | `joplin_brainstorm` |
| 查看 pending capture | `joplin_show_capture` |
| 確認保存 query/brainstorm 結果 | `joplin_confirm_capture` |
| Project 歸檔前建議命名 | `joplin_suggest_archive_project` |
| 使用者確認 project 名稱後歸檔 | `joplin_archive_project` |
| 同步 Joplin sources | `joplin_sync_sources` |
| 編譯 wiki | `joplin_compile_wiki` |

快速安裝 MCP server：

```bash
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash
```

若要同時寫入 Cursor 或 Codex 的 MCP 設定：

```bash
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client cursor
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client codex
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client both
```

預設安裝到 `$HOME/.local/share/joplin-llm-wiki`。若要指定安裝位置：

```bash
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client both "$HOME/.local/share/joplin-llm-wiki"
```

Cursor 設定可參考 `.cursor/mcp.json.example`：

```json
{
  "mcpServers": {
    "joplin-llm-wiki": {
      "command": "pnpm",
      "args": [
        "exec",
        "joplin-llm-wiki-mcp"
      ],
      "cwd": "/Users/caiyijun/joplin-llm-wiki"
    }
  }
}
```

可用 tools：

| Tool | Purpose |
| --- | --- |
| `joplin_query` | 從 `wiki/` 優先、必要時補 `raw/` 回答問題，並可建立 pending capture。 |
| `joplin_show_capture` | 讀取 pending capture，不修改檔案。 |
| `joplin_confirm_capture` | 確認 pending capture，寫入 `brainstorming/chat/` 或 `artifacts/<project>/`。 |
| `joplin_brainstorm` | 以 query 流程進行探索，預設偏向 brainstorming capture。 |
| `joplin_suggest_archive_project` | Project 歸檔前提供 2-3 個 project 名稱建議。 |
| `joplin_archive_project` | 使用已確認的 project 名稱，把成品寫入 `artifacts/<project>/`。 |
| `joplin_sync_sources` | 包裝 `sqlite-sync` 的 normal、export-only、snapshot-only 模式。 |
| `joplin_compile_wiki` | 包裝 `wiki-compile` 或 `agent-compile`。 |

Project 歸檔必須先呼叫 `joplin_suggest_archive_project` 取得建議命名，
再由使用者確認 project 名稱。`joplin_archive_project` 必須收到
`confirmed_project: true` 才會寫入正式 artifact；未確認時會回傳
`PROJECT_CONFIRMATION_REQUIRED` 且不寫檔。新 project artifact 路徑固定為
`artifacts/<project>/<timestamp>-<slug>.md`，不要使用
`artifacts/projects/<project>/`。

完整 MCP 設定與工具語意見 `docs/codex-cursor-mcp.md`。

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
2. **摘要**：`wiki-compile` 或 `agent-compile` 先把 raw 轉成 `wiki/summaries/*.md` 與來源索引。
3. **概念**：concept stage 讀 summaries，依語意整理 canonical concepts，寫到 `wiki/concepts/*.md` 與 `wiki/indexes/All-Concepts.md`。
4. **發布**：writeback stage 才把已完成的 wiki Markdown 寫回 Joplin 的 `@llm-wiki`。
5. **查詢**：`query` 先看整理好的 `wiki/`，必要時再補 `raw/` 原始內容。
6. **沉澱**：有價值的 Q&A 先形成 pending capture，確認後才寫到 `brainstorming/chat/` 或 `artifacts/<project>/`，不直接污染 `wiki/`。
7. **Lint**：`lint` 以檔案系統檢查 wiki 佈局、frontmatter、連結、缺漏索引與未沉澱的 brainstorming。

## CLI 指令

GUI 之外，也可以用 CLI 做同樣的事，適合排程、自動化或除錯：

```bash
pnpm exec joplin-llm-wiki sqlite-sync --config ./config.yaml --export-only
pnpm exec joplin-llm-wiki sqlite-sync --config ./config.yaml --snapshot-only
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml
pnpm exec joplin-llm-wiki query --config ./config.yaml "你的問題"
pnpm exec joplin-llm-wiki query --config ./config.yaml --confirm-capture "<id>"
pnpm exec joplin-llm-wiki lint --config ./config.yaml
```

### Concept Resume Recovery

若已完成 `wiki/summaries/*.md`，但 concept 產生或 Joplin 寫回出現錯誤，可以先暫停 `sqlite-sync` 排程，從下游階段接續，不必重新為所有 raw 筆記產生單篇摘要。

```bash
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml --resume-stage concepts --dry-run
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml --resume-stage concepts
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml --resume-stage writeback --dry-run
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml --resume-stage writeback
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml --resume-stage concepts --dry-run
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml --resume-stage concepts
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml --resume-stage writeback --dry-run
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml --resume-stage writeback
```

Concept resume 只讀既有 `wiki/summaries/*.md`，local 模式用 Ollama、agent 模式用本機 `codex exec` 依 summary evidence 判斷 canonical concepts，然後只寫 `wiki/concepts/*.md` 與 `wiki/indexes/All-Concepts.md`。Writeback resume 才會寫入 Joplin，且只處理 `wiki/concepts/*.md` 與 `wiki/indexes/All-Concepts.md`，不重送 summaries。

完整編譯與 resume 都遵守同一個發布邊界：concepts 全部在本機寫完後，才進入 Joplin writeback。Dry-run 不會改寫 wiki 或 Joplin。若 dry-run 顯示 Joplin concept collision 或 orphan candidates，先檢查輸出再決定是否修復；一般 writeback 只會 create/update，不會自動刪除舊 note。需要回復時，可先保留已暫停排程，手動移開錯誤的 `wiki/concepts/*.md` 或修正 Joplin duplicate note，再重跑 dry-run。

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

預設資料夾 `raw/` 與 `wiki/` 已列入 `.gitignore`。

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

狀態檔預設寫在 config 同目錄下的 `.joplin-llm-wiki/sqlite-sync-state.json`，不放在 `raw/`，避免 `reconcile_mode: mirror` 清理。

第一次非 dry-run 同步只建立 baseline，不觸發編譯；之後以 raw-relative path、`joplin_note_id` 與 Markdown 內容 SHA-256 判斷變更。`--export-only` 仍會匯出並更新狀態但不編譯；`--snapshot-only` 只掃現有 `raw/` 建立 baseline，不開 SQLite、不刪檔、不編譯，適合 `raw/` 已有資料時接上自動變更偵測。

定時檢查不是檔案系統 watcher。要自動週期檢查 SQLite/raw snapshot，必須讓 `sqlite-sync` 以常駐輪詢或外部排程執行：設定 `joplin_sqlite_sync.schedule.every_seconds`、CLI 使用 `--every <seconds>`，或由 launchd/cron 定期啟動。若 `every_seconds: null` 且沒有 `--every`，`sqlite-sync` 只跑一輪後結束。

狀態提交點在 downstream 成功之後：若 raw 已變更且 `compile_mode` 是 `local` 或 `agent`，`sqlite-sync` 會把變動 raw 對應到變動 summaries，再只重編受影響 concepts，最後只把變動的 downstream relPaths 寫回 Joplin。只有 preflight、compile 與 writeback 全部成功後才更新 `.joplin-llm-wiki/sqlite-sync-state.json`。若 token 無效、Data API 不通、`agent-compile` 或 `wiki-compile` 失敗，state 會保留在上一個已成功處理的 snapshot，下一輪仍會重試同一批 raw 變更。每輪 stdout JSON 會包含 `state_committed`、`state_commit_reason`、`downstream_status`、`writeback_preflight_status`、`changed_summary_paths` 與 `writeback_relpaths`。

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

`wiki-compile` / `agent-compile` 非 dry-run 成功後，若 `joplin_wiki_writeback.enabled` 為 true，會在本機 wiki 編譯完成後才進入 Joplin writeback。透過 `sqlite-sync` 自動編譯時，只有 raw snapshot 有變更才會觸發 downstream compile/writeback，且只寫回本輪變動的 compiled wiki relPaths：

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

`--capture=brainstorming` 或 `--capture=artifacts` 可強制提出指定分類的 capture；分類只會是 `brainstorming` 或 `artifacts`。若加 `--writeback-workflow=true`，確認後只把該次確認的 note 按需寫回 Joplin。

## Development

```bash
pnpm test
```
