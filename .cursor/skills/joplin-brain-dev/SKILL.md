---
name: joplin-brain-dev
description: >-
  joplin-llm-wiki（npm 套件）本 repo 開發慣例：Joplin SQLite 匯出、notebook 分層、wiki-compile、agent-compile、Joplin Desktop Data API 寫回、load-config、測試迷你 YAML。
license: MIT
metadata:
  author: project
  version: "1.0.2"
---

# joplin-llm-wiki 開發慣例

在修改 `sqlite-sync`、`wiki-compile`、`agent-compile`、設定載入、或 **`test/**/*.test.js`** 內嵌 `config.yaml` 時遵守下列規則。

## 知識流與模型邊界

- 本 repo 部分採用 `gatelynch/llm-knowledge-base` 的四層知識流：`raw/` 對應 `raw/`，`wiki/` 對應 `wiki/`，並保留 `brainstorming/` 與 `artifacts/`。
- `raw/` 是 Joplin SQLite mirror/export 產物，預設視為唯讀證據；不要手動放入長期維護內容。
- Notebook 篩選匯出使用 `raw/<joined-notebook-slug>/<safe-title>.md`。巢狀筆記本以 `-` 串接，例如 `工作/專案A/會議` → `工作-專案A-會議`。
- `sqlite-sync` 正常模式匯出後會比對 snapshot，只有 raw 變更才依 `joplin_sqlite_sync.pipeline.compile_mode` 觸發 wiki 層同步：`local` 執行 `wiki-compile`，`agent` 執行 `agent-compile`，`off` 不編譯。第一次非 dry-run 只建立 baseline；`--export-only` 會更新 raw 與 snapshot state 但不編譯；`--snapshot-only` 只掃現有 `raw/` 建立 baseline，不開 SQLite、不刪檔、不編譯。舊 `run_wiki_compile` 只作為未設定 `compile_mode` 時的 fallback。
- `sqlite-sync` summary 欄位要保持可觀測：`raw_changed`、`change_detection`、`changed_files`、`compile_mode`、`compile_triggered`。Health GUI 主要 tabs 應覆蓋 Health、Config、Notebooks、Pipeline、Query、Lint、LaunchAgent，並透過固定 IPC handler 執行 Query/Lint/snapshot-only。
- 編譯輸出只能使用 `wiki/summaries/*.md`、`wiki/concepts/*.md`、`wiki/indexes/All-Sources.md`、`wiki/indexes/All-Concepts.md`；三個分類底下不得建立子資料夾。`summaries` 是每個來源一份摘要，`concepts` 是概念條目並交叉引用 summaries/concepts，`indexes` 是固定入口。
- `query` 預設使用 `--source-scope=knowledge`：優先讀 `wiki/`，必要時補 `raw/` 原始素材；可用 `--source-scope=wiki|raw` 明確限制。成功回答不直接 file-back，會先建立 pending capture，確認後才寫 `brainstorming/chat/` 或 `artifacts/projects/<project>/`。`ask`、`index`、`watch`、RAG／Chroma／embedding vector 管線已移除。
- 人可讀的知識管理輸出使用繁體中文；技術名詞、source path、filename 可保留原文。
- 模型分流：
  - 本地預設是 `wiki-compile` + Ollama。
  - Codex 月訂閱路線是 `agent-compile` + 本機已登入的 `codex exec`，不使用 OpenAI API key，也不等同 API 額度。
  - 兩條管路預設都掃完整個 `raw/` 筆記庫；`--batch=true` 才是 10-15 頁單批次 fallback。
  - OpenAI API provider 目前未實作。

## 本機小模型（`config.yaml.example` 對齊值）

筆電跑 **gemma4:e4b** 時，使用者向範例與 README 採下列 `wiki_ingest`／`ollama`（測試迷你 YAML 若模擬真實規劃可沿用；純單元測試仍可用更小 digest）：

```yaml
wiki_ingest:
  max_pages_per_run: 8
  min_pages_per_run: 2
  min_topic_pages_per_run: 3
  planner_reject_source_paths: true
  corpus_digest_max_files: 40
  corpus_auto_sweep:
    enabled: true
    max_windows_per_invocation: 2
    step_files: 40
    advance_state_on_dry_run: false
    run_until_cycle_complete: true
    max_total_windows_per_invocation: 500
ollama:
  chat_model: gemma4:e4b
```

- Planner 優先 `{"paths":[...]}`，並容錯 `items`/`answer` 等別名（`extractPathsFromModelJson`）；hub-only 或 topic 不足會重試，仍不足則 `PLAN_TOPIC_TOPUP_HEURISTIC`（`topic-path-heuristic.js`）。
- `--dry-run` 且 `advance_state_on_dry_run: false` 時，sweep **只跑 1 視窗**（`cmd-wiki-compile.js`）。
- `num_ctx` 不在 `load-config`；由 Ollama 模型定義。

## `joplin_wiki_writeback` 與測試

- 寫回預設**開啟**（省略 `enabled` 即 true）。寫回視為開啟時，`load-config` 要求 **`joplin_data_api.token`** 非空且 **`joplin_data_api.base_url`** 為 loopback（見 `load-config.js`）；否則 **`CONFIG_INVALID`**。
- 不需真的打到 Joplin、也不想載入上述約束時，於迷你設定加上：

```yaml
joplin_wiki_writeback:
  enabled: false
```

- 需模擬寫回：`runWikiWriteback(..., { fetch })` 傳入 mock **`fetch`**（見 `test/joplin-wiki-writeback.test.js`）。compile 寫回啟用時需提供 `joplin_data_api.token`；wiki 寫回固定到 `@llm-wiki/wiki/{summaries,concepts,indexes}`。`brainstorming` 與 `artifacts` 只在需要整理問答、健康報告或作品時按需寫回；artifacts 寫回才需要 `joplin_wiki_writeback.artifacts_project_notebook_title`。

## 模組位置

| 行為 | 路徑 |
|------|------|
| 設定解析 | `src/config/load-config.js` |
| Joplin SQLite schema / notebook tree / export | `src/joplin/sqlite/joplin-schema.js`、`src/joplin/sqlite/notebooks.js`、`src/joplin/sqlite/exporter.js` |
| SQLite sync 變更偵測 / state | `src/joplin/sqlite/sync-state.js`、`src/commands/cmd-sqlite-sync.js` |
| notebook/title path sanitizing | `src/joplin/sqlite/paths.js` |
| Data API 傳輸／預檢／分頁 | `src/joplin/data-api-client.js` |
| 寫回筆記本樹 + upsert | `src/joplin/wiki-writeback.js` |
| 編譯編排（含寫回觸發） | `src/wiki/wiki-compiler.js`；CLI 薄封裝 `src/commands/cmd-wiki-compile.js` |
| Codex Agent 編譯 | `src/commands/cmd-agent-compile.js` |
| Wiki/raw filesystem query + pending capture | `src/commands/cmd-query.js` |
| 錯誤碼 | `JOPLIN_DATA_API_FAILED`、`JOPLIN_DATA_API_WRITE_FAILED`（`src/cli.js`；仍相容舊字串 `JOPLIN_CLI_*`） |

## 規格真相來源

- 主流規格：`openspec/specs/`（含 `joplin-wiki-writeback`、`joplin-data-api`、`wiki-ingest`、`compiled-wiki`）
- **Roadmap（規劃中非義務）**：`openspec/ROADMAP.md`
- 封存變更範例：`openspec/changes/archive/*-joplin-wiki-db-writeback/`、`openspec/changes/archive/*-joplin-data-api-read-write/`

## 使用者文件

- `README.md`（Desktop、Web Clipper／Data API、Profile、`--dry-run`、關閉寫回）
- `config.yaml.example`
- `docs/scheduling-examples.md`（排程與寫回／Data API 前提）
- `docs/macos-launchd-stack.md`（LaunchAgent 下 `sqlite-sync` 與 `compile_mode` 的對齊）
