---
name: joplin-brain-dev
description: >-
  joplin-llm-wiki（npm 套件）本 repo 開發慣例：wiki-compile、Joplin Desktop Data API 寫回、load-config、測試迷你 YAML。
license: MIT
metadata:
  author: project
  version: "1.0.2"
---

# joplin-llm-wiki 開發慣例

在修改 `wiki-compile`、設定載入、或 **`test/**/*.test.js`** 內嵌 `config.yaml` 時遵守下列規則。

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
    run_until_cycle_complete: false
    max_total_windows_per_invocation: 500
ollama:
  embed_model: bge-m3:latest
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

- 需模擬寫回：`runWikiWriteback(..., { fetch })` 傳入 mock **`fetch`**（見 `test/joplin-wiki-writeback.test.js`）。**index** 在寫回開啟時會先做 **`runJoplinDataApiPreflight`**（見 `test/joplin-cli.test.js` / `test/integration-index.test.js` 慣例）。

## 模組位置

| 行為 | 路徑 |
|------|------|
| 設定解析 | `src/config/load-config.js` |
| Data API 傳輸／預檢／分頁 | `src/joplin/data-api-client.js` |
| 寫回筆記本樹 + upsert | `src/joplin/wiki-writeback.js` |
| 編譯編排（含寫回觸發） | `src/wiki/wiki-compiler.js`；CLI 薄封裝 `src/commands/cmd-wiki-compile.js` |
| 錯誤碼 | `JOPLIN_DATA_API_FAILED`、`JOPLIN_DATA_API_WRITE_FAILED`（`src/cli.js`；仍相容舊字串 `JOPLIN_CLI_*`） |

## 規格真相來源

- 主流規格：`openspec/specs/`（含 `joplin-wiki-writeback`、`joplin-data-api`、`wiki-ingest`、`compiled-wiki`）
- **Roadmap（規劃中非義務）**：`openspec/ROADMAP.md`
- 封存變更範例：`openspec/changes/archive/*-joplin-wiki-db-writeback/`、`openspec/changes/archive/*-joplin-data-api-read-write/`

## 使用者文件

- `README.md`（Desktop、Web Clipper／Data API、Profile、`--dry-run`、關閉寫回）
- `config.yaml.example`
- `docs/scheduling-examples.md`（排程與寫回／Data API 前提）
