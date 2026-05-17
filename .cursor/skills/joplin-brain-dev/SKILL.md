---
name: joplin-brain-dev
description: >-
  joplin-llm-wiki（npm 套件）本 repo 開發慣例：wiki-compile、Joplin CLI 寫回、load-config、測試迷你 YAML。
license: MIT
metadata:
  author: project
  version: "1.0.0"
---

# joplin-llm-wiki 開發慣例

在修改 `wiki-compile`、設定載入、或 **`test/**/*.test.js`** 內嵌 `config.yaml` 時遵守下列規則。

## `joplin_wiki_writeback` 與測試

- 寫回預設**開啟**（省略 `enabled` 即 true）。未啟用 `joplin_cli` 的迷你設定會在 `loadConfig` 階段失敗。
- 非 Joplin 寫回測試請加上：

```yaml
joplin_wiki_writeback:
  enabled: false
```

- 需模擬寫回時：使用 `runWikiWriteback(..., { runCli })` 或於 `tmp` 建立 **exit 0** 的假 `joplin_cli.command`（`spectra apply` 產物中 `test/joplin-wiki-writeback.test.js` 有範例）。

## 模組位置

| 行為 | 路徑 |
|------|------|
| 設定解析 | `src/config/load-config.js` |
| CLI spawn／preflight | `src/joplin/cli-runner.js` |
| 寫回筆記本樹 + upsert | `src/joplin/wiki-writeback.js` |
| 編譯編排（含寫回觸發） | `src/wiki/wiki-compiler.js`；CLI 薄封裝 `src/commands/cmd-wiki-compile.js` |
| 錯誤碼 | `JOPLIN_CLI_FAILED`、`JOPLIN_CLI_WRITE_FAILED` 於 `src/cli.js` |

## 規格真相來源

- 主流規格：`openspec/specs/`（含 `joplin-wiki-writeback`、`wiki-ingest`、`compiled-wiki`）
- 封存變更：`openspec/changes/archive/*-joplin-wiki-db-writeback/`

## 使用者文件

- `README.md`（Desktop vs CLI、Profile、`--dry-run`、關閉寫回）
- `config.yaml.example`
- `docs/scheduling-examples.md`（排程與 `PATH`／寫回）
