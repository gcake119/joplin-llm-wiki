<!--
每項任務含：可觀察行為／驗收方式。路徑僅為定位。
-->

## 1. 管線執行器

- [x] 1.1 （REQ-HGUI-CORPUS-PIPELINE Manual full index and wiki-compile from Health GUI — main-process 執行本體）於 `src/health-gui/corpus/corpus-pipeline-runner.js` 實作 `runCorpusPipeline(repoRoot, configPathAbs, payload, spawnImpl)`，對齊 design 各節：**Decision: 使用 pnpm exec 叫用 joplin-llm-wiki 子命令**、**Decision: 兩階段序向執行且 index 非零則跳過 wiki-compile**、**Decision: 單飛鎖於 runner 模組**、**Decision: 每階段 stdout／stderr 緩衝上限比照 stack runner（約 64KiB 滑動視窗，回傳 tail 512）**：`confirmed !== true` 時回傳 `CONFIRMATION_REQUIRED` 且不 **`spawn`**；`confirmed === true` 時以 **pnpm** 依序執行 `exec`、`joplin-llm-wiki`、`index`、`--config`、絕對設定檔路徑，僅當 index **exit code 0** 時再 **`spawn` wiki-compile** 同形 argv；**cwd** 為解析後之 `repoRoot`；併發第二請求回傳 `PIPELINE_IN_FLIGHT`；整體 `ok` 僅於兩階段皆 0 exit 為真。**驗收**：`test/health-gui/corpus-pipeline-runner.test.js` 以 mock **`spawn`** 涵蓋 **SCN-HGUI-CORPUS-01**（無確認零 **`spawn`**）、**SCN-HGUI-CORPUS-02**（argv／cwd）、**SCN-HGUI-CORPUS-03**（index 非零不啟動 wiki-compile）、**SCN-HGUI-CORPUS-04**（重入 `PIPELINE_IN_FLIGHT`）。

## 2. IPC 與渲染器（Implementation Contract；SCN-HGUI-CORPUS-05）

- [x] 2.1 於 `src/health-gui/main.js` 註冊 `ipcMain.handle("run-corpus-pipeline", …)`，將請求轉送上述 runner（路徑解析與既有 `configPath` 變數一致）；於 `src/health-gui/preload.cjs` 暴露 `runCorpusPipeline`。**驗收**：`pnpm test` 通過；並以靜態檢閱確認 channel 名稱與 payload 鍵與規格一致。

- [x] 2.2 於 `src/health-gui/renderer/index.html` 新增操作者可見按鈕（文案明確為「全庫索引＋編譯 Wiki」或同等語意）；於 `src/health-gui/renderer/app.js` 在點擊時先 `confirm`（提示含 **wiki-compile 可能觸發 Joplin CLI 寫回**與長時程），僅於確認後呼叫 `jb.runCorpusPipeline({ confirmed: true })`（名稱以 preload 揭露為準）；將回傳之各階段 **exit code** 與 **tail** 顯示於既有日誌區或專用 pre（與 stack log 區隔或共用須可讀）。逾時載入時按鈕 disabled 行為與 **Implementation Contract**「執行中 UI 狀態」對齊。**驗收**：手動啟動 Health GUI 觸發一輪（**SCN-HGUI-CORPUS-05**）；`pnpm test` 仍全綠。

## 3. 全套件驗收

- [x] 3.1 執行 `pnpm test` 0 fail；若仍有漏測之 IPC 邊界，補最小幅之 `test/health-gui/` 測試（不重複 1.1 已覆蓋之 spawn argv 斷言）。
