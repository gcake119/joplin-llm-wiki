## 1. 目錄與本機邊界註記

- [x] 1.1 建立 `scripts/launchd/` 目錄並加入簡短 `README` 片段，說明此目錄僅服務本機 LaunchAgent、不引入對外 HTTP 服務；摘要 design **Decision: 採 LaunchAgent（每使用者）而非系統層 LaunchDaemon**（採使用者 LaunchAgent、非系統 LaunchDaemon）之理由。**驗收行為**：目錄與檔案存在且敘述符合本機邊界。**規格對應**：**REQ-MLS-LOCAL-ONLY Launchd stack preserves local-first boundaries**。**驗證**：人工閱讀確認無遠端向量庫／雲端 LLM 預設敘述。

## 2. Ollama／Chroma／sqlite-sync 範本與 wrapper

- [x] 2.1 新增 `scripts/launchd/run-ollama.sh`：以嚴格模式呼叫 `ollama serve`（或文件允許之單一替換命令），並將 stdout／stderr 交由 plist 導向（呼應全堆疊啟動）。**驗收行為**：手動 `bash -n` 通過且與 `com.joplin-brain.ollama.plist.example` 之 ProgramArguments 一致。**規格對應**：**REQ-MLS-LAUNCHD-ARTIFACTS Shipped plist and wrapper contracts**。**驗證**：`bash -n scripts/launchd/run-ollama.sh`。

- [x] [P] 2.2 新增 `scripts/launchd/run-chroma.sh`：於 repo root 執行 `pnpm exec chroma run`，參數（host／port、`--path`）對齊 `README.md` 與 `config.yaml.example`。**驗收行為**：與 `com.joplin-brain.chroma.plist.example` 可載入匹配。**規格對應**：**REQ-MLS-LAUNCHD-ARTIFACTS Shipped plist and wrapper contracts**。**驗證**：`bash -n scripts/launchd/run-chroma.sh`。

- [x] 2.3 新增／更新 `scripts/launchd/run-sqlite-sync.sh`：除載入 config 執行 `pnpm exec joplin-brain sqlite-sync` 外，於執行前對 Ollama 與 Chroma HTTP 做**有上限**輪詢（預設 `http://127.0.0.1:11434`、`http://127.0.0.1:8000`，可環境變數覆寫，名稱載明於 `docs/macos-launchd-stack.md`）；逾時則 stderr 單行明確錯誤並非零退出；呼應 design **Decision: sqlite-sync wrapper 內建依賴就緒等待**（任務字串保留 `decision: sqlite-sync wrapper 內建依賴就緒等待` 以利追蹤）；並延續 `decision: 以極薄 **wrapper 腳本** 作為 programarguments 首個 argv，集中 export path` 之 PATH 集中原則。**驗收行為**：無 Ollama／Chroma 時可觀測失敗。**規格對應**：**REQ-MLS-FULL-STACK Full-stack launchd registers Ollama Chroma and bounded sqlite-sync readiness**。**驗證**：`bash -n`；手動模擬關閉 chroma 埠後 wrapper 逾時退出（寫入手冊）。

- [x] [P] 2.4 新增三份 plist 範本 `com.joplin-brain.ollama.plist.example`、`com.joplin-brain.chroma.plist.example`、`com.joplin-brain.sqlite-sync.plist.example`（Labels 占位、`WorkingDirectory`、`StandardOutPath`／`StandardErrorPath`、`EnvironmentVariables.PATH`），路徑模板呼應 **Decision: 日誌寫入使用者指定之 ~/Logs 或 repo 外路徑**並在條目內保留可追溯字樣 `decision: 日誌寫入使用者指定之 ~/logs 或 repo 外路徑`。**驗收行為**：三份皆可 `plutil -lint`。**規格對應**：**REQ-MLS-LAUNCHD-ARTIFACTS Shipped plist and wrapper contracts**；**REQ-MLS-OBSERVABILITY Logging locations and Joplin CLI PATH**。**驗證**：`plutil -lint` 各檔。

## 3. 全堆疊一鍵安裝與卸載

- [x] 3.1 新增 `scripts/launchd/install-joplin-brain-stack.sh`：參數／環境變數含 `REPO_ROOT`、`CONFIG_ABSPATH`、可選 label 後綴；複製三支 plist 至 `~/Library/LaunchAgents/` 並逐一支 `launchctl bootstrap gui/$(id -u)`；失敗則 stderr＋非零退出。**驗收行為**：乾淨帳號可載入三 job。**規格對應**：**REQ-MLS-INSTALL-UNINSTALL One-step install and uninstall scripts**。**驗證**：`bash -n`；文件記載 `launchctl print` 檢查。

- [x] [P] 3.2 新增 `scripts/launchd/uninstall-joplin-brain-stack.sh`：對三支 label 做 `launchctl bootout` 並刪除對應 plist，不刪 Joplin Profile。**驗收行為**：卸載後無殘留 Label。**規格對應**：**REQ-MLS-INSTALL-UNINSTALL One-step install and uninstall scripts**。**驗證**：`bash -n`；手動依文件驗證。

## 4. 營運手冊與 README 指針

- [x] 4.1 撰寫 `docs/macos-launchd-stack.md`：**預設全堆疊**（Ollama + Chroma + sqlite-sync）、600 秒週期示例、**`joplin_sqlite_sync.database_path`** 與 Joplin Desktop 對齊—載明常見預設檔 **`~/.config/joplin-desktop/database.sqlite`**（須改為絕對路徑寫入 config；自訂 Profile 者改填實際路徑）、`joplin_cli` PATH、`run-sqlite-sync.sh` 就緒等待與逾時除錯、三支日誌路徑、KeepAlive 風險、`launchctl` 版本備援、精簡模式（僅 sqlite-sync）附錄。**驗收行為**：營運者可依文件啟停全堆疊並完成 DB 路徑設定。**規格對應**：**REQ-MLS-DOC User guide links prerequisites**（含 **Scenario: Default Joplin Desktop database path is documented for operators**）；**REQ-MLS-OBSERVABILITY Logging locations and Joplin CLI PATH**；**REQ-MLS-FULL-STACK Full-stack launchd registers Ollama Chroma and bounded sqlite-sync readiness**。**驗證**：對照 `specs/macos-launchd-stack/spec.md` 逐條有段落；目視含 `database.sqlite` 與 `joplin-desktop` 路徑說明。

- [x] [P] 4.2 更新 `README.md` 連結至 `docs/macos-launchd-stack.md`（可一句話說明全堆疊一鍵）。**驗收行為**：README 可發現手冊。**規格對應**：**REQ-MLS-DOC User guide links prerequisites**。**驗證**：`rg 'macos-launchd-stack.md' README.md`。

## 5. 交付前靜態檢查

- [x] 5.1 針對所有新增 shell 腳本執行 `bash -n`；有則 `shellcheck` error 級修復。**驗證**：exit 0。

- [x] [P] 5.2 追溯：README → 手冊 → `scripts/launchd/*` 檔名與 design **Module Layout（交付物目錄）**、**Decision: sqlite-sync、Chroma、Ollama 分離為三支 LaunchAgent** 一致；`git diff` 不觸及 `src/cli.js`。**驗證**：人工核對。
