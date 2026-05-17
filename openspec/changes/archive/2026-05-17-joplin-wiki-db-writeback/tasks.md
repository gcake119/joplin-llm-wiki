## 1. 設定與契約

- [x] 1.1 實作並驗證 **Requirement: REQ-JWKB-CONFIG Configuration surface**：`src/config/load-config.js` 加入 `joplin_wiki_writeback`（`enabled` **預設 true**、`parent_notebook_title` 預設 `note-wiki`、`topic_frontmatter_key` 預設 `domain`、`note_title_key` 預設 `title`、`max_cli_attempts`）；當 `enabled` true 且 `joplin_cli.enabled` false 或 `command` 空時 `CONFIG_INVALID`；**不得**要求 `joplin_wiki_writeback.database_path`。**Design trace:** decision: 設定區塊命名 `joplin_wiki_writeback`。驗收：`node --test` 覆蓋「省略 enabled 鍵且 CLI 就緒→視同開啟」、啟用寫回但未啟 CLI→`CONFIG_INVALID`、與正常組合。

## 2. Joplin CLI 寫回核心（筆記本樹 + upsert）

- [x] 2.1 實作並驗證下列規格（單一模組實作可一併滿足）：**Requirement: REQ-JWKB-LOCAL-FIRST Local execution boundary**、**Requirement: REQ-JWKB-NOTEBOOK-TREE Parent and topic notebooks**、**Requirement: REQ-JWKB-NOTE-UPSERT Note title resolution and body upsert**、**Requirement: REQ-JWKB-ROW-ELIGIBILITY Row eligibility**、**Requirement: REQ-JWKB-CLI-WRITE Joplin CLI write semantics**；實作位置 `src/joplin/wiki-writeback.js`（或 design 檔名）。於批次前呼叫 `runJoplinCliPreflight`；依 `design.md` Implementation Contract 逐步 spawn：**解析／建立父筆記本**（預設 `note-wiki`）→ **各主題子筆記本** → **依標題 upsert note 並套用 body**（暫存檔方案見 argv 表）；使用 `joplin_cli.timeout_ms` 與各邏輯步驟之 `max_cli_attempts`；topic 正規化、**（主題,標題）碰撞**、**fatal vs skip** 依 design「Decision: fatal vs skip（ROW-ELIGIBILITY 實作參考）」。**Design trace:** decision: 以 Joplin 終端機 CLI 寫回（取代應用程式內 RW SQLite）；decision: 主題筆記本標題正規化；decision: 同一批次內重複（主題, 標題）。驗收：`node --test` mock `spawn` 斷言「mkbook／建子資料夾／mknote 或 set body」序列、逾時與重試。

## 3. CLI 編排與錯誤

- [x] 3.1 實作並驗證 **Requirement: REQ-WI-020 Post-compile optional Joplin database writeback orchestration** 與 **Requirement: REQ-JWKB-DRYRUN Dry-run produces no durable Joplin updates**：`src/commands/cmd-wiki-compile.js` 在 compile 成功後觸發寫回；`--dry-run` 不 spawn 變更型子行程；`enabled` false 不呼叫寫回；**省略 `enabled`** 時行為與預設 true 一致。**Design trace:** decision: 寫回觸發點綁定 `wiki-compile` 成功結束後；decision: `--dry-run` 與寫回。驗收：`node --test` SCN-WI-WB-01、SCN-WI-WB-04。

- [x] [P] 3.2 實作並驗證 **Requirement: REQ-JWKB-ERRORS Error reporting**：preflight／寫回失敗 stderr 單行 JSON，`JOPLIN_CLI_FAILED` 或 `JOPLIN_CLI_WRITE_FAILED`，exit 1；更新 `src/cli.js` 映射如需。**Design trace:** decision: 以 Joplin 終端機 CLI 寫回（取代應用程式內 RW SQLite）。驗收：SCN-JWKB-ERR-01、`pnpm exec joplin-brain wiki-compile --help` smoke。

## 4. 範例與文件

- [x] [P] 4.1 實作並驗證 **Requirement: REQ-WIKI-010 Repository wiki_root default path convention** 與 **Requirement: REQ-WIKI-011 Wiki frontmatter domain for Joplin writeback routing**：`config.yaml.example` 設 `wiki_root: ./wiki_root`；`joplin_wiki_writeback` 區塊示範**預設開啟**（可省略 `enabled` 或明示 `enabled: true`）、`parent_notebook_title: note-wiki`、並註解 **須** `joplin_cli.enabled: true` 與可執行 `command`，否則 `CONFIG_INVALID`。**Design trace:** Goals 與非 Goals（範例對齊）。驗收：YAML smoke；README 滿足 SCN-WIKI-DOMAIN-01。

- [x] [P] 4.2 實作並驗證 **Requirement: REQ-JWKB-README-PREREQUISITES Operator install documentation**：更新 `README.md`——**安裝 Joplin Desktop** 以讀取／管理完整筆記庫；**另安裝 Joplin 終端機 CLI** 以執行 **`note-wiki` 筆記本樹**之 LLM Wiki 寫回；兩者與 `joplin_sqlite_sync` **共用同一 Joplin Profile** 之前提與路徑對齊說明；並補 **`note-wiki`／`<domain>` 子筆記本／標題 upsert**、備份 Profile、`--dry-run`、關閉寫回 `enabled: false`；**`sqlite-sync` 仍以唯讀 SQLite 為主**（本 change 不以 CLI 全面取代匯出）。**Design trace:** 系統預備條件（操作者環境）；decision: 與 `sqlite-sync` 的執行隔離。驗收：人工 checklist；斷言滿足 **SCN-JWKB-DOC-01**。

## 5. 整合測試與 Open Questions 結案

- [x] [P] 5.1 新增或更新 `test/joplin-wiki-writeback.test.js`：涵蓋 SCN-JWKB-TREE-01、SCN-JWKB-UPSERT-01、SCN-JWKB-DRY-01、SCN-JWKB-CLI-01、JOPLIN_CLI 錯誤 JSON。驗收：`pnpm test` 全綠。

- [x] 5.2 結案 design「Open Questions」：固定本輪寫回 wiki 路徑清單來源（`wiki-compiler` 暴露或 planner／fs 折衷，擇一並於程式註解與測試名稱固定）。驗收：與 5.1 一致。
