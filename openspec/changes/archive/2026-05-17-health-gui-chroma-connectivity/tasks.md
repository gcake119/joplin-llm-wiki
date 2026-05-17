<!--
每項任務含：可觀察行為／驗收方式。路徑僅為定位。
-->

## 1. 組態：相對 chroma.persist_path 錨定至設定檔目錄（REQ-LOCAL-IDX-PERSIST-RELATIVE、Decision: 錨定相對 chroma.persist_path 於設定檔目錄）

- [x] [P] 1.1 **REQ-LOCAL-IDX-PERSIST-RELATIVE Resolve relative chroma.persist_path against the config file directory**：在 `src/config/load-config.js` 將相對之 `chroma.persist_path` 改為以 `cfgDir`（已存在之設定檔目錄變數）展開為絕對路徑，並維持絕對輸入不變。**驗收**：`pnpm test` 通過，且 `test/config-schema.test.js` 斷言 `cfg.chroma.persist_path` 等於 `path.resolve(tmp, "chroma-data")`（對應 **SCN-LOCAL-IDX-PERSIST-RELATIVE-01**）。

## 2. Health GUI：成功背景啟動後之有界輪詢（REQ-HGUI-DEP-POLL、Decision: 在 renderer 以有界輪詢重複 check-health、Implementation Contract）

- [x] [P] 2.1 **REQ-HGUI-DEP-POLL Bounded automatic health refresh after successful detached dependency start**：在 `src/health-gui/renderer/app.js` 於 `start-local-dependency` **成功**後，以固定間隔與最大等待時間重複呼叫 `jb.checkHealth()`，對 `chroma-server`／`ollama-serve` 分別直到 `chroma.reachable`／`ollama.reachable` 為真或逾時；每次 `ok: true` 快照須更新連線字串與 JSON 區（與手動 refresh 同源更新語意）。**驗收**：`pnpm test` 通過；手動啟動本機 Chroma／Ollama 時，無需手動按「重新整理」於等待視窗內可見 reachable 標籤與 JSON 一致（**SCN-HGUI-DEP-POLL-01／02**）；人為讓服務不起則逾時後 UI 不崩潰且仍顯示最後快照（**SCN-HGUI-DEP-POLL-03**）。

## 3. 文件與遷移說明（Migration / Phase、Implementation Contract）

- [x] 3.1 在 `README.md`（或專案慣用之設定說明段落）以一句話標註：相對 `chroma.persist_path` 以設定檔所在目錄為錨，若舊流程依賴不同 cwd 需改為絕對路徑或調整 config 位置。**驗收**：文件審閱通過內容包含關鍵字 `chroma.persist_path` 與「設定檔目錄／cfgDir」語意。

## 4. 整合驗收

- [x] 4.1 全套件 `pnpm test` 與（若專案已有）Health GUI 相關單元測試全綠；必要時補上最小化測試以避免 `load-config` 行為回歸。**驗收**：`pnpm test` 0 fail。
