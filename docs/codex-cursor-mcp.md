# Codex / Cursor MCP

本 repo 提供本機 MCP server，讓 Codex 或 Cursor 對話可以用結構化
tools 操作 joplin-llm-wiki 知識流。MCP 只包裝既有本機流程，不新增公網
HTTP API，也不改變 `raw/`、`wiki/`、`brainstorming/`、`artifacts/`
的 source-of-truth 邊界。

## Setup

Cursor 設定範例：

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

Codex 或其他 MCP client 也可使用相同 command/cwd。設定完成後，MCP
server 透過 stdio 與 client 溝通。

## Tools

| Tool | Purpose |
| --- | --- |
| `joplin_query` | 從 `wiki/` 優先、必要時補 `raw/` 回答問題，並可產生 pending capture。 |
| `joplin_show_capture` | 讀取 pending capture，不修改檔案。 |
| `joplin_confirm_capture` | 確認 pending capture，寫入 `brainstorming/chat/` 或 `artifacts/<project>/`。 |
| `joplin_brainstorm` | 以 query 流程進行探索，預設產生 brainstorming pending capture。 |
| `joplin_suggest_archive_project` | 歸檔前產生 2-3 個 project 名稱建議。 |
| `joplin_archive_project` | 使用已確認的 project 名稱，把成品寫入 `artifacts/<project>/`。 |
| `joplin_sync_sources` | 包裝 `sqlite-sync` 的 normal、export-only、snapshot-only 模式。 |
| `joplin_compile_wiki` | 包裝 `wiki-compile` 或 `agent-compile`。 |

## Pending Capture ID Timezone

`joplin_query` 與 `joplin_brainstorm` 建立 pending capture 時，會回傳
`capture_draft_id` 並寫入 `.joplin-llm-wiki/pending-captures/<id>.json`。
ID 的時間前綴預設維持舊版 UTC `Z` 格式，例如
`2026-05-25T11-46-36-845Z-<slug>-<hash>`。

若希望新建立的 MCP pending capture ID 使用臺灣本地時間，可在
`config.yaml` 設定：

```yaml
knowledge_flow:
  pending_capture_id_timezone: Asia/Taipei
```

設定後，新 `capture_draft_id` 會使用 GMT+8 本地時間前綴，例如
`2026-05-25T19-46-36-<slug>-<hash>`。既有 UTC `Z` ID 不需要 migration，
仍可用 `joplin_show_capture` 讀取，也可用 `joplin_confirm_capture`
確認。

## Project Archive Rule

Project 歸檔必須分兩步：

1. 先呼叫 `joplin_suggest_archive_project`，根據 title、content、context
   提供 2-3 個 project 名稱建議。
2. 使用者確認 project 名稱後，才呼叫 `joplin_archive_project`，並傳入
   `confirmed_project: true`。

未確認 project 名稱時，archive tool 會回傳 `PROJECT_CONFIRMATION_REQUIRED`
並且不寫任何檔案。正式成品路徑固定為：

```text
artifacts/<project>/<timestamp>-<slug>.md
```

不要把新的 project 歸檔寫到 `artifacts/projects/<project>/`。

## Local-First Boundary

- `raw/` 只作為唯讀 source evidence。
- Query 不使用 RAG、embedding、Chroma 或 vector index。
- `provider=ollama` 只連到設定的本機 Ollama base URL。
- Workflow writeback 只使用 config 驗證過的 loopback Joplin Data API。
- MCP tool output 不應包含 Joplin token。
