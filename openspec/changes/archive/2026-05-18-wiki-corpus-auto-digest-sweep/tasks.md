## 1. 設定與驗證（對齊 **REQ-WCC-CORPUS-SWEEP-002 Sweep step validation**、設計 **Module Layout（文字樹）** 之 `src/config/load-config.js`）

- [x] [P] 1.1 交付 **REQ-WCC-CORPUS-SWEEP-002 Sweep step validation**：在 `src/config/load-config.js` 解析並驗證 `wiki_ingest.corpus_auto_sweep` 物件：`enabled`、`max_windows_per_invocation`（1–500）、`step_files`（≤ `corpus_digest_max_files`）、`state_path`、`advance_state_on_dry_run`；當 `enabled` 為 true 且 `corpus_mode_enabled` 為 false 時拋 `CONFIG_INVALID`；當 `step_files` 大於 `corpus_digest_max_files` 時拋 `CONFIG_INVALID`。驗收：`pnpm exec node --test test/config-schema.test.js` 新增 SCN 覆蓋 SCN-WCC-SWEEP-CFG-INVALID／SCN-WCC-SWEEP-STEP。

- [x] [P] 1.2 交付 **REQ-WCC-CORPUS-SWEEP-001 Corpus digest offset advancement between sweep windows** 之設定前置：當 `step_files` 省略時，於 load-config 將有效步長設為 `corpus_digest_max_files` 並暴露於解析後的 `AppConfig`。驗收：同一 config-schema 測試中斷言省略鍵時有效值等於 max digest。

## 2. Sweep state 模組（對齊 **REQ-WI-CORPUS-SWEEP-002 Sweep state file and fingerprint reset**、設計 **決策 B：state 檔格式與預設位置**、**決策 C：指紋（fingerprint）不匹配時的行為**）

- [x] 2.1 交付 **REQ-WI-CORPUS-SWEEP-002 Sweep state file and fingerprint reset**（持久化子集）：新增 `src/wiki/corpus-sweep-state.js`：讀寫 JSON（`schema_version`、`next_offset`、`markdown_file_count`、`step_files`、`updated_at_ms`）、以 temp+rename 原子寫入、預設路徑落在 `wiki_root/.joplin-llm-wiki/corpus-sweep-state.json`（對應設計 **Implementation Contract**、**Data Model**）。驗收：`pnpm exec node --test test/corpus-sweep-state.test.js`（新建）驗證寫入後可讀回且損壞檔可偵測。

- [x] 2.2 交付 **REQ-WI-CORPUS-SWEEP-002 Sweep state file and fingerprint reset**（指紋重置子集）：當 discovery 檔數 ≠ state.`markdown_file_count` 時重置 `next_offset` 為 0、更新計數並發出 `CORPUS_SWEEP_FINGERPRINT_RESET` telemetry（SCN-WI-SWEEP-FPR-RESET）。驗收：單元測試模擬計數變化斷言重置與 stderr 鍵。

## 3. CorpusSweepOrchestrator 與單視窗核心（對齊 **REQ-WI-CORPUS-SWEEP-001 Corpus digest sweep orchestration**、設計 **決策 A：單進程外層迴圈 vs 外部 shell**、**Component Diagram（Mermaid flowchart）**）

- [x] 3.1 交付 **REQ-WI-CORPUS-SWEEP-001 Corpus digest sweep orchestration**：在 `src/commands/cmd-wiki-compile.js`（或等價入口）加入外層迴圈：載入 state → 對最多 `max_windows_per_invocation` 次迭代建立帶有效 `corpus_digest_offset` 的設定視圖並呼叫現有 `runWikiCompileFlow`／編譯核心；單視窗失敗時退出碼非零且不 advance 該視窗 offset（對齊設計 **Error Handling**「半視窗 advance」禁止）。驗收：`pnpm test` 全綠；測試內錯誤注入確認 state 未半視窗前進。

- [x] 3.2 交付 **REQ-WI-CORPUS-SWEEP-004 Window-local page budget under sweep** 與設計 **決策 E：REQ-WI-001（max_pages_per_run）適用範圍**：調整 `src/wiki/wiki-compiler.js`／入口使得 effective offset 可由 orchestrator 注入；每視窗獨立套用 **REQ-WI-001** 上限（SCN-WI-SWEEP-BUDGET：mock planner 溢出時每視窗最多 `max_pages_per_run` 條）。驗收：`test/wiki-separation.test.js` 新增 SCN-WI-SWEEP-BUDGET。

## 4. Offset 進位與 writer 一致性（對齊 **REQ-WCC-CORPUS-SWEEP-001 Corpus digest offset advancement between sweep windows**、設計 **決策 D：offset 進位步長**、**決策 F：`filesystem_plus_chroma` 互動**）

- [x] 4.1 交付 **REQ-WCC-CORPUS-SWEEP-001 Corpus digest offset advancement between sweep windows**（執行時進位）：每視窗成功結束後依有效 `step_files` 更新 `next_offset`（modulo `max(1,totalMarkdownFiles)`），並確保 `wiki-planner` 與 `wiki-compiler` writer slice 共用同一 effective offset，再套用 `filesystem_plus_chroma` hash bump（SCN-WCC-SWEEP-OFFSET）。驗收：整合測試 fixture `corpus_digest_max_files=1`、`step_files=1` 連跑三視窗，stderr／digest 順序覆蓋不同檔名。

- [x] [P] 4.2 匯總 telemetry：`CORPUS_SWEEP_WINDOW` 每視窗一行 JSON；最終 stdout summary 增加 `corpus_sweep` 物件（含 `truncated`、`windows_executed`、`state_path`），對齊設計 **Observability**。驗收：前述整合測試斷言欄位存在。

## 5. Dry-run 與 state（對齊 **REQ-WI-CORPUS-SWEEP-003 Dry-run interaction with sweep state**、設計 **決策 G：dry-run 與 state**）

- [x] 5.1 交付 **REQ-WI-CORPUS-SWEEP-003 Dry-run interaction with sweep state**：預設 `advance_state_on_dry_run=false` 時 dry-run 完成視窗後不寫入新 offset；設為 true 時 advance 並附警示 telemetry（SCN-WI-SWEEP-DRY-NO-ADVANCE）。驗收：`test/wiki-separation.test.js` 兩分支各一 SCN。

## 6. CLI 與說明文件（對齊設計 **API／CLI Contract**、**Open Questions** 之 CLI 優先序）

- [x] [P] 6.1 在 `src/cli.js`／`bin/joplin-llm-wiki.js` 增加可選旗標（例如 `--corpus-sweep`）僅在本次 invocation 將 sweep.enabled 視為 true，與 YAML 並存規則於 help 說明。驗收：`test/cli-help.test.js` 或 routing 測試能看到新旗標說明。

- [x] [P] 6.2 更新 `README.md`、`config.yaml.example`：描述多視窗成本、`max_windows_per_invocation`、state 檔路徑、dry-run 預設不推進、以及「digest 掃完不保證每筆記一頁」（呼應設計 **Goals / Non-Goals** 與 proposal）。驗收：文件審查 + `pnpm test` 仍通過。

## 7. I/O 錯誤碼（對齊設計 **Implementation Contract** 之 `CORPUS_SWEEP_STATE_IO`、**Security & Privacy**）

- [x] [P] 7.1 當 state 目錄不可建立或原子寫入失敗時，`wiki-compile` 以明確錯誤碼（例如 `CORPUS_SWEEP_STATE_IO`）退出並 stderr 附路徑。驗收：單元測試以唯讀父目錄或 mock `fs.rename` 失敗觸發。

## 8. 終回合規（對齊設計 **Migration／Phase**、**Context**、**Traceability（REQ 對照）**）

- [x] 8.1 跑完整 `pnpm test` 與（若專案已有）lint；確認關閉 sweep 時現有 SCN 無行為改變（回歸 **REQ-WI-CORPUS-SWEEP-001 Corpus digest sweep orchestration** 之 disabled 分支）。驗收：`pnpm test` 全綠。
