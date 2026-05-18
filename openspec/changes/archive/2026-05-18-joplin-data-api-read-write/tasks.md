## 1. 設定載入與迴環位址校驗

- [x] [P] 1.1 實作 `joplin_data_api`（`base_url`、`token`、`timeout_ms`）之 YAML 載入與預設值，並在 writeback 啟用時於 load-config 驗證 `token` 非空、`timeout_ms` 為正整數；涵蓋需求「REQ-JDA-CONFIG Configuration mapping for Data API」。驗證：`pnpm exec node --test test/config-schema.test.js`（新增或更新案例）與手動載入非法 YAML 預期拋 `CONFIG_INVALID`。

- [x] [P] 1.2 實作 `base_url` 解析並強制 hostname ∈ {127.0.0.1, localhost, ::1}（scheme 為 http/https），否則 writeback 啟用時 `CONFIG_INVALID`；涵蓋需求「REQ-JDA-ALLOWLIST Loopback-only API base URL」與「REQ-JWKB-LOCAL-FIRST Local execution boundary」。呼應設計決策「decision: host allow-list 於 load-config 硬擋」。驗證：`pnpm exec node --test test/config-schema.test.js` 涵蓋 `192.168.x.x` 被拒絕。

- [x] 1.3 移除「writeback 啟用則強制 `joplin_cli.enabled` + command」之耦合；writeback 啟用時改為校驗 Data API 區塊；涵蓋需求「REQ-JWKB-CONFIG Configuration surface」。驗證：`pnpm exec node --test test/joplin-wiki-writeback.test.js` 內 SCN-JWKB-CFG-01 類案例改為 token 缺失。

## 2. Data API 客戶端與預檢

- [x] [P] 2.1 新增 Data API 薄封裝：每一請求附 `token` query、遵守 `timeout_ms`（AbortSignal）、可注入 `fetch` 供測試；涵蓋需求「REQ-JDA-CLIENT Authorized HTTP transport」。呼應設計決策「decision: 使用原生 `fetch`（node 20+）並支援注入 `fetch` 以利測試」。驗證：新建 `test/joplin-data-api-client.test.js`（或等價）断言 URL 含 token 參數。

- [x] [P] 2.2 實作突變前先成功執行一次唯讀端點（具體 path 對齊官方文件並寫入 README）；失敗映射 `JOPLIN_DATA_API_FAILED`；涵蓋需求「REQ-JDA-PREFLIGHT Preflight before writeback mutations」。驗證：mock fetch 斷言預檢次序早於 POST/PUT；整合測試 `test/joplin-wiki-writeback.test.js` 延伸。

- [x] [P] 2.3 實作 HTTP 錯誤分類與重試策略（`max_cli_attempts` 語意改為 API 傳輸重試）；涵蓋需求「REQ-JDA-ERRORS Stable transport error codes」與「REQ-JWKB-DATA-API-WRITE Joplin Data API write transport semantics」。呼應設計決策「decision: 重試次數沿用 `joplin_wiki_writeback.max_cli_attempts` 鍵名或更名為中性 `max_transport_attempts`」以及「decision: 錯誤碼引入 `joplin_data_api_failed`（連線／認證／4xx 預檢）與 `joplin_data_api_write_failed`（upsert 階段）」。驗證：單元測試覆蓋 403→`JOPLIN_DATA_API_FAILED`、突變失敗→`JOPLIN_DATA_API_WRITE_FAILED`。

## 3. Wiki 写回編排（取代 CLI）

- [x] 3.1 重寫 `src/joplin/wiki-writeback.js`：`runWikiWriteback` 經 Data API 完成父／主題資料夾解析與建立、note upsert；涵蓋需求「REQ-JWKB-NOTEBOOK-TREE Parent and topic notebooks」、「REQ-JWKB-ROW-ELIGIBILITY Row eligibility」，並回歸既有「REQ-JWKB-NOTE-UPSERT Note title resolution and body upsert」（現行主規仍於 `openspec/specs/joplin-wiki-writeback/spec.md`，本 change 未修改該條文）。呼應設計決策「decision: 採 joplin data api 取代終端機 cli 作為写回唯一機制」。驗證：`pnpm exec node --test test/joplin-wiki-writeback.test.js` 全部通過（改為 fetch mock）。

- [x] [P] 3.2 `--dry-run` 路徑不得發送 mutating HTTP；涵蓋需求「REQ-JWKB-DRYRUN Dry-run produces no durable Joplin updates」。驗證：既有 SCN-JWKB-DRY 類測試改断言無 PUT/POST/PATCH/DELETE。

## 4. CLI 入口與索引預檢

- [x] [P] 4.1 更新 `src/cli.js`（及呼叫鏈）將 Joplin 寫回失敗對應 `JOPLIN_DATA_API_FAILED`／`JOPLIN_DATA_API_WRITE_FAILED`（exit code 1）；涵蓋需求「REQ-JWKB-ERRORS Error reporting」。驗證：`pnpm exec node --test` 涵蓋錯誤碼字串；必要時更新 `test/wiki-separation.test.js`。

- [x] [P] 4.2 將 `src/commands/cmd-index.js` 之 `runJoplinCliPreflight` 改為 Data API 預檢或移除 CLI 依賴；確認不再為索引指令 spawn `joplin --version`。呼應設計決策「decision: 採 joplin data api 取代終端機 cli 作為写回唯一機制」（索引預檢對齊同一傳輸）。驗證：`pnpm exec node --test test/integration-index.test.js`（若存在）或新增最小測試。

## 5. 移除 CLI 写回路徑與死碼清查

- [x] [P] 5.1 刪減 `src/joplin/cli-runner.js` 中僅供写回使用之 export，或整檔移除若無引用；落實 REMOVED 需求「REQ-JWKB-CLI-WRITE Joplin CLI write semantics」之遷移語意與場景 SCN-JWKB-CLI-RM-01。驗證：`rg joplin_cli wiki-writeback` 無残留錯誤依賴；`pnpm test` 通過。

## 6. 文件與範例設定

- [x] [P] 6.1 更新 `README.md` 與 `config.yaml.example`：載明啟用 Clipper/Data API、token、`joplin_data_api` 區塊；移除「必須安裝 Joplin CLI 方能写回」敘述；涵蓋需求「REQ-JWKB-README-PREREQUISITES Operator install documentation」並支持「REQ-JDA-PREFLIGHT Preflight before writeback mutations」所列 README 端點揭露義務。驗證：人工檢查清單對照 SCN-JWKB-DOC-01。

## 7. 終場驗收

- [x] 7.1 全套件 `pnpm test` 通過；手動一次 `pnpm exec joplin-llm-wiki wiki-compile --dry-run --config …` 確認無 mutating 呼叫。驗證：`pnpm test` 綠燈與手動記錄。
