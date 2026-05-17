## 1. 依賴與啟動骨架

- [x] 1.1 **REQ-HGUI-LOCALBOUND Local-first GUI exposure**；**（決策：桌面載體採 electron（主行程跑 node 探測））** 在 `package.json` 新增 `electron` 為 `devDependency`，並新增 npm script（例如 `health-gui`）可呼叫 `electron` 載入 `src/health-gui/main.js`；更新 `pnpm-lock.yaml`。驗證：`pnpm install` 成功後 `pnpm run health-gui -- --help` 或啟動流程不因缺少套件而立即崩潰（可對應手動檢查）。

- [x] 1.2 **（決策：啟動契約新增 bin/joplin-brain-health-gui.js，參數 --config 必填）**、**REQ-HGUI-CONFIG Shared configuration semantics** 新增 `bin/joplin-brain-health-gui.js`：解析 `--config`，缺少時 stderr 說明並以退出碼 `1` 結束；成功時委派 Electron 啟動。驗證：無 `--config` 時行程退出碼為 `1`；有 `--config` 且檔案存在時進入 Electron（手動或輕量 smoke）。

## 2. 探測模組（核心契約）

- [x] [P] 2.1 **REQ-HGUI-OLLAMA Ollama reachability and model presence**；**（決策：ollama 探測使用 get `/api/tags`，逾時上限獨立於管線但仍受設定啟發）** 實作 `src/health-gui/probes/ollama-probe.js`：對 `{baseUrl}/api/tags` 使用 `fetch` + `AbortSignal`，逾時為 `min(5000, cfg.ollama.timeout_ms)`；解析 `models[].name`；計算 `missingModels`。驗證：`pnpm test` 中 `test/health-gui/ollama-probe.test.js` 以 mock `fetch` 覆蓋 HTTP 200／連線失敗／缺模型案例。

- [x] [P] 2.2 **REQ-HGUI-CHROMA Chroma server reachability aligned with ChromaStore**；**（決策：chroma 探測重用 chromastore 與預設 host／port）** 實作 `src/health-gui/probes/chroma-probe.js`：以 `new ChromaStore({ persistPath, host, port })`（host/port 取自 env 預設與 `chroma-store.js` 一致）呼叫 `heartbeat()`，回傳 `reachable` 與錯誤摘要。驗證：`pnpm test` 使用 stub／mock 替換底層 client 或注入假的 `listCollections`，覆蓋成功與丟錯（對應 SCN-HGUI-03）。

- [x] [P] 2.3 **REQ-HGUI-OBS Filesystem hint for persist directory** 實作 `src/health-gui/probes/fs-hints.js`：檢查 `persist_path` 之父目錄可寫與否，填入 `filesystem.persistParentWritable`／`detail`。驗證：`pnpm test` 於暫存目錄建立／chmod 模擬拒寫並斷言輸出欄位。

## 3. 聚合、IPC 與 Electron 主行程

- [x] 3.1 **REQ-HGUI-CONFIG Shared configuration semantics**、**Implementation Contract** 在 `src/health-gui/main.js`（或 `health-snapshot.js`）組裝 `HealthSnapshot`：呼叫 `loadConfig`（`src/config/load-config.js`），串接 `ollama-probe`、`chroma-probe`、`fs-hints`；`CONFIG_INVALID` 時回傳錯誤面板資料且不進行網路探測。驗證：`pnpm test` 整合測試使用最小 YAML fixture；手動比對 GUI 顯示之 `base_url`／`persist_path` 與 CLI 同源（SCN-HGUI-04）。

- [x] 3.2 **（決策：安全性預設 — contextisolation 為 true、禁用 nodeintegration、preload 白名單 ipc）**、**REQ-HGUI-LOCALBOUND Local-first GUI exposure** 設定 `BrowserWindow`：`contextIsolation: true`、`nodeIntegration: false`；`preload.js` 以 `contextBridge` 暴露固定 IPC：`check-health`、`read-config`、`save-config`、`run-stack-script`（名單外禁止）。驗證：renderer 無 `require`／`fs`；手動 devtools 檢查。

- [x] 3.3 **REQ-HGUI-LOCALBOUND Local-first GUI exposure** 確認 MVP **未**對 `0.0.0.0` 綁定 HTTP；若僅 `loadFile` 載入本地資產，於 `README.md` 註記「無對外監聽」。驗證：文件審查 + 啟動後確認無 `0.0.0.0` listener（手動）。

- [x] [P] 3.4 **REQ-HGUI-CONFIG-EDIT Validated configuration persistence**；**（決策：設定儲存以「loadconfig 驗證闸門」為唯一真理）** 實作 `src/health-gui/config/config-coordinator.js`：`read-config` 讀 UTF-8 檔案；`save-config` 寫暫存 `.yaml.tmp`、呼叫 `loadConfig(absTmp)`、成功才原子替換目標檔；失敗回傳錯誤且不修改原檔。驗證：`pnpm test` `test/health-gui/config-save-validation.test.js` 覆蓋 SCN-HGUI-06／07。

- [x] [P] 3.5 **REQ-HGUI-STACK-LIFECYCLE Allowlisted LaunchAgent stack scripts**；**（決策：stack 僅封裝既有 install／uninstall 腳本）** 實作 `src/health-gui/stack/stack-script-runner.js`：解析 repo root（自 `package.json` 位置向上尋找）；僅允許 `scripts/launchd/install-joplin-brain-stack.sh` 與 `uninstall-joplin-brain-stack.sh` 之絕對路徑；以 `bash` spawn；彙整 stdout／stderr 尾端各至少 512 字元；`confirmed !== true` 時拒絕。驗證：`pnpm test` `test/health-gui/stack-runner.test.js` 對 `confirmed: false` 斷言不 spawn（SCN-HGUI-08）；mock spawn 成功／失敗退出碼（SCN-HGUI-09）。

## 4. Renderer 與 UX

- [x] 4.1 **REQ-HGUI-UX Operator guidance and refresh semantics**、**REQ-HGUI-NOTESROOT Display-only notes root context** 實作 `src/health-gui/renderer/`：健康四區塊、`notes_root` 顯示、重新整理單次飛行（SCN-HGUI-UX-REFRESH）。驗證：手動連點刷新；SCN-HGUI-NOTESROOT。

- [x] 4.2 **REQ-HGUI-OLLAMA Ollama reachability and model presence**、**REQ-HGUI-CHROMA Chroma server reachability aligned with ChromaStore** 提供「複製建議文字」：`ollama pull …`；Chroma 失敗時複製 `pnpm exec chroma run --path …`。驗證：手動 SCN-HGUI-02／03。

- [x] 4.3 **Architecture Overview**／**Risks** 在 UI 固定顯示：「僅檢查依賴與 stack 腳本輸出；全文索引／RAG 仍以 CLI 為準」。驗證：手動目視。

- [x] 4.4 **REQ-HGUI-CONFIG-EDIT Validated configuration persistence** 實作設定表單（`notes_root`、`ollama.base_url`、`ollama.embed_model`、`ollama.chat_model`、`chroma.persist_path` 必填 MVP）：載入時呼叫 `read-config`，編輯後序列化為 YAML（與 `yaml` 套件一致），送出 `save-config`；錯誤時顯示伺服端訊息。若需合并未暴露之進階鍵：自前一輪 parse 之 doc merge 再 stringify，並於程式碼註解說明規則。驗證：`pnpm test` config coordinator case + 手動 SCN-HGUI-06。

- [x] 4.5 **REQ-HGUI-STACK-LIFECYCLE Allowlisted LaunchAgent stack scripts** 新增「安裝 stack」「解除 stack」按鈕：先 modal，再在 IPC 送 `{ kind, confirmed: true }`；日誌區顯示退出碼與輸出尾端（SCN-HGUI-09）。驗證：手動於 macOS 沙環境或 mock 行程（開發機若無 launchd 權限則依測試 stub）。

## 5. 測試與文件

- [x] [P] 5.1 **REQ-HGUI-UX Operator guidance and refresh semantics** 新增／更新 `test/health-gui/refresh-single-flight.test.js`：並發刷新被拒。驗證：`pnpm test`。

- [x] [P] 5.2 **README.md** 新增／更新「Health GUI」：`pnpm run health-gui`、`--config`、IPC 安全、`confirmed` 語意、YAML 回寫可能移除註解之警告；連結 `docs/macos-launchd-stack.md`。驗證：**REQ-HGUI-LOCALBOUND Local-first GUI exposure**、**REQ-HGUI-STACK-LIFECYCLE Allowlisted LaunchAgent stack scripts** 使用者可讀。

- [x] [P] 5.3 **Migration Plan** 跑完整 `pnpm test`。驗證：全綠。

- [x] [P] 5.4 **REQ-HGUI-STACK-LIFECYCLE Allowlisted LaunchAgent stack scripts** 更新 `docs/macos-launchd-stack.md` 頂部一句「亦可經 Health GUI 執行相同腳本（見 README）」。驗證：文件審查。

## 6. 本機依賴：連線狀態與一鍵啟動（ingest 擴充）

- [x] 6.1 **REQ-HGUI-DEP-STATUS Surface dependency reachability as operator-visible connection status**、**（決策：IPC `start-local-dependency` 列入 preload 白名單）** 於 `src/health-gui/renderer/` 健康區塊：在每次成功刷新後，依 `lastHealthSnap.ollama.reachable`／`chroma.reachable` 顯示**已連線／未連線**（或同等繁中語意），並與 `#health-json` 內 `reachable` 布林一致；尚未刷新時顯示中性提示（例如「請重新整理」）。驗證：手動比對快照（例如 `chroma.reachable: false` 時 Chroma 列為未連線）。

- [x] [P] 6.2 **REQ-HGUI-DEP-START Allowlisted local dependency starters**；**（決策：本機依賴一鍵啟動採獨立 allowlist（Chroma `pnpm exec chroma run`／Ollama `serve`））**；**（決策：啟動前若探測已連線則拒絕 spawn）**；**（決策：DependencyStarter 單次飛行 per kind）** 新增 `src/health-gui/deps/dependency-starter.js`（或等同模組）：實作 `startLocalDependency(repoRoot, configPath, payload, deps)` — `confirmed !== true` 時不 spawn；`kind` 僅允許 `chroma-server`／`ollama-serve`；spawn 前 await 對應 probe，若 `reachable === true` 回傳 `code: 'ALREADY_RUNNING'`；Chroma 為固定 `pnpm` argv：`exec chroma run --path <persistAbs> --host … --port …`，`cwd=repoRoot`，`detached: true`、`stdio: 'ignore'`；Ollama 為 `ollama serve` 同上 detached；各 kind **single-flight**。於 `main.js` 註冊 IPC `start-local-dependency`；**preload.cjs** `contextBridge` 暴露對應方法。驗證：`pnpm test` 新建／擴充 `test/health-gui/dependency-starter.test.js`（mock `spawn` + stub probe）覆蓋 SCN-HGUI-DEP-01／02／03。

- [x] [P] 6.3 **REQ-HGUI-DEP-START**、**REQ-HGUI-DEP-STATUS** renderer：為 Chroma、Ollama 各提供「一鍵啟動」按鈕（`reachable===true` 時按鈕 disabled 或提示已連線）；點擊先 **modal** 警告（detached 行程於關閉 GUI 後仍可能存續、輸出不進 GUI 日誌）；確認後送 `{ kind, confirmed: true }`；將 `ALREADY_RUNNING`、`SPAWN_ERROR` 等以 `#refresh-status` 或專用訊息列顯示。成功 spawn 後提示操作員按「重新整理」確認連線。驗證：手動於 Chroma 未連線時走完整流程；並發連點僅觸發單次 spawn（或第二次收到 skipped／拒絕）。

- [x] [P] 6.4 **REQ-HGUI-DEP-START**、**REQ-HGUI-LOCALBOUND** **README.md**「Health GUI」章節：載明 `start-local-dependency`、detached 語意、`ALREADY_RUNNING`、不重定向 stdout／stderr（除錯請用終端機／launchd 日誌）；提醒與 `scripts/launchd/run-chroma.sh`／`run-ollama.sh` 同源 argv。驗證：文件審查。

- [x] [P] 6.5 **Migration Plan** 跑完整 `pnpm test`。驗證：全綠。
