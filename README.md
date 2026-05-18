# joplin-llm-wiki（Karpathy MVP）

本機-first 的 **Sources → Compiled Wiki → Schema** 三層管線：向量分 `collection_sources` / `collection_wiki`，`wiki-compile` 透過本機 Ollama 規劃並撰寫 `wiki_root`，`ask` 支援 `wiki_first` / `sources_only` / `merged`，`lint` 輸出 Karpathy 版報告（重複、原件孤立、hub 孤立、矛盾候選、schema 缺口等）。

規劃中的產品路線見下方 **[Roadmap（規劃中）](#readme-roadmap)**；完整表格與細節以 [`openspec/ROADMAP.md`](openspec/ROADMAP.md) 為準。

<a id="readme-roadmap"></a>

## Roadmap（規劃中）

以下為**規劃能力**，在另開 Spectra `changes/` proposal 並實作前**不作為**現行行為規格；現行已定義仍以 [`openspec/specs/`](openspec/specs/) 為準。

<a id="readme-roadmap-pipeline-resume"></a>

### PR-PIPELINE-RESUME：管線 checkpoint／從中斷處接續

聚焦 **Health GUI**「初始化」「corpus」等**序向 subprocess 管線**（條件式 `sqlite-sync --export-only` → `index` → `wiki-compile`）：

- **現況**：關閉視窗或程序中斷後**不會**自動從上次斷點接續；**無預估耗時**。`index-state.json` 若在中長版 `index` 中延後大量落盤，中斷時可能 **state 落後於已寫入 Chroma**，下一輪多為重做而非精準 resume。
- **規劃方向（可分期）**：相位級 checkpoint 紀錄；`indexAll`／依 layer 或每 **N** 檔原子寫入 state；CLI 可選**機器可讀進度**供 GUI／進度條；`sqlite-sync` 分段／可恢復匯出的設計須對齊 `reconcile_mode: mirror`。

<a id="readme-roadmap-distribution"></a>

### PR-DISTRIBUTION-PLUGIN-BREW：Joplin 外掛或 Homebrew 獨立 App

在 **pnpm + CLI（＋可選 Health GUI／launchd）baseline 穩定後**，評估擴充裝載方式（須提案；**REQ-DIST-PARK**：未宣告 baseline 穩定前，不得將 plugin／brew 訂為必達里程碑或廢除現行開發者路徑）：

| 路線 | 概要 |
|------|------|
| **TRACK-A**（Joplin **plugin**） | Host 在 Joplin 內建 Electron；優先 Plugin API 讀寫／wiki 寫回；面板式 UI；長任務不中斷 UI；Ollama／Chroma spawn 對齊外掛模型（亦可 **plugin + 伴隨 helper**）。 |
| **TRACK-B**（**Homebrew**） | **B1** CLI formula（PATH 即用、不依賴使用者本機必有 pnpm）；**B2** GUI cask／`.app` 打包（原生 ABI、資源路徑）；**B3** plist／shim 指向 Cellar；Chroma CLI 依賴須在文件中明示解法。 |

- **架構**：**Core／Host 分離**（管線可被 Host 呼叫；Host 管路徑與 spawn）；維持**全本機預設**（與 [`openspec/config.yaml`](openspec/config.yaml) 一致）。
- **詳細 REQ／決策清單**：[`openspec/specs/future-distribution-modes/spec.md`](openspec/specs/future-distribution-modes/spec.md)。

**單一路線全文**（問題陳述、風險、相關路徑表）：[**`openspec/ROADMAP.md`**](openspec/ROADMAP.md)。

## 需求

- Node **≥ 20**
- **pnpm**
- 本機 **[Ollama](https://ollama.com/)**（embed + chat）
- **Chroma**：安裝套件後使用 CLI 啟動持久化伺服器（與 `chromadb` npm client 搭配）：

```bash
pnpm exec chroma run --path ./data/chroma --host 127.0.0.1 --port 8000
```

預設設定假設 Chroma 在 `127.0.0.1:8000`。可用環境變數覆寫：`CHROMA_HOST`、`CHROMA_PORT`。

## 指令

```bash
pnpm install
pnpm exec joplin-llm-wiki --help
pnpm exec joplin-llm-wiki index --config ./my.config.yaml
pnpm exec joplin-llm-wiki watch --config ./my.config.yaml
pnpm exec joplin-llm-wiki wiki-compile --config ./my.config.yaml
pnpm exec joplin-llm-wiki wiki-compile --config ./my.config.yaml --dry-run
pnpm exec joplin-llm-wiki ask --config ./my.config.yaml "你的問題"
pnpm exec joplin-llm-wiki lint --config ./my.config.yaml
```

Exit codes：**0** 成功；**1** 設定／schema／Joplin Data API 預檢／**wiki-compile 寫回（`JOPLIN_DATA_API_FAILED` / `JOPLIN_DATA_API_WRITE_FAILED`）** 等；**2** Ollama／Chroma 不可用；**3** 其他錯誤。

## Health GUI（Electron）

本機圖形介面：檢查 **Ollama**／**Chroma**、編輯並儲存主要 **`config.yaml` 欄位**（儲存前經與 CLI 相同的 **`loadConfig` 驗證**）、以連線狀態列顯示兩者是否**已連線**／未連線、並可由允許清單於背景 **detached** 啟動 **`ollama serve`** 與 **`pnpm exec chroma run …`**（等同 `scripts/launchd/run-ollama.sh`／`run-chroma.sh` 語意；啟動前會先做探測，**已在線時不重複 spawn**，並須確認對話）。另有 **`scripts/launchd/install-joplin-brain-stack.sh`**／**`uninstall-joplin-brain-stack.sh`**（確認對話；僅 main 行程會 spawn）。

```bash
pnpm install
# 若 electron 被 pnpm 拒跑 postinstall：pnpm approve-builds --all && pnpm install
pnpm run health-gui -- --config ./my.config.yaml
# 或：pnpm exec joplin-llm-wiki-health-gui -- --config ./my.config.yaml
```

- **必備**：`--config <path>`。
- **網路**：預設 `loadFile` 載入本地頁面，**不**對 `0.0.0.0` 監聽。
- **依賴一鍵啟動**：IPC `start-local-dependency`（preload：`jbHealth.startLocalDependency`）。行程為 **detached**，關閉 GUI 後仍可能繼續；**stdout／stderr 不會**顯示在視窗內（請用終端機或 launchd 日誌除錯）。探測為已連線時回 **`ALREADY_RUNNING`**，不會再次 spawn。
- **YAML**：表單儲存會 merge 後整檔回寫，**可能移除註解／鍵順序**；請先備份。
- **stack**：詳見 [`docs/macos-launchd-stack.md`](docs/macos-launchd-stack.md)；解除 stack **不**刪除筆記／向量資料。

Health GUI 行程退出碼：**0** 關閉視窗；**1** 缺少 `--config` 或啟動失敗。

目前「初始化」與 corpus 管線為序向 spawn（關閉視窗／中斷後**無**自動從斷點接續）；規劃中的 checkpoint／進度請見 [Roadmap — PR-PIPELINE-RESUME](#readme-roadmap-pipeline-resume)。

## 設定範例

- **`chroma.persist_path`**：若為相對路徑，會以**設定檔所在目錄**為錨點展開（與 `loadConfig` 內 **`cfgDir`** 語意一致）；若舊腳本假設相對於 shell 的工作目錄（cwd），請改為絕對路徑或調整 `config.yaml` 的位置。
- `config.yaml.example`
- `wiki-schema.example.yaml`
- `fixtures/full-karpathy.config.yaml`（需改成你的絕對路徑）

### wiki-compile：`wiki_ingest.corpus_*`（主題式全庫上下文）

預設行為對齊 **notebook-wide thematic PKM**：**省略** `wiki_ingest.corpus_mode_enabled` 時視為 **`true`**，`wiki-compile` 會以 **`discoverMarkdown` 字典序**配合 **`corpus_digest_offset`**（環狀位移）將最多 **`corpus_digest_max_files`**（預設 500，合法 40–1000）筆來源路徑＋mtime 送入 planner；撰寫階段對同一視窗組裝 excerpts（仍可受內文明文長度上限切斷）。請留意 **tokens／本機流量**將高於過往兼容路徑。

- **`corpus_digest_offset`**：整數輪替起點；多輪手動換 offset 可把 digest 視窗環狀移位以覆蓋不同排序區段。
- **`corpus_writer_excerpt_mode`**：`filesystem_slice`（僅檔案系統）或 `filesystem_plus_chroma`（在成功命中時附加本機 **`collection_sources`** 鄰近 chunk；失效或無命中時自動降級，stderr 會出現單行 JSON：`{"warning":"CORPUS_CHROMA_DEGRADED",...}`）。
- **Rollback（打破預設加寬視窗時）**：在 YAML **顯式**寫 **`wiki_ingest.corpus_mode_enabled: false`**，還原過往 forty-file digest／五檔 excerpt 自動化相容路徑；詳見 **`CHANGELOG.md`**。

非 dry-run 成功與 **`--dry-run`** 在完成規劃路徑時，stdout 末行摘要 JSON（除 `NO_SOURCE_MARKDOWN` 等早退情境外）會帶 **`corpus_mode`** 與（僅 corpus 為真時）**`corpus_digest_paths_in_prompt_count`**。

## Joplin Desktop SQLite 匯出＋排程（`sqlite-sync`）

- **預設筆記目錄**：範例使用倉庫根目錄 `./notes_root`；此資料夾已列於 `.gitignore`，**筆記 Markdown 不會進版控**。Clone 後若無此目錄，請自行 `mkdir -p notes_root` 或由匯出流程建立。
- **原生模組**：`sqlite-sync` 依賴 `better-sqlite3`。若 `pnpm install` 後出現 bindings／「Could not locate」類錯誤，在 pnpm 11+ 通常需先執行 `pnpm approve-builds --all`（或依互動提示核准該套件），再重新安裝以完成編譯。
- **來源**：Joplin Desktop 設定檔目錄內之 `database.sqlite`（依你的安裝位置調整絕對路徑；常見預設為 **`~/.config/joplin-desktop/database.sqlite`**）。
- **行為**：`joplin_sqlite_sync.enabled: true` 時，`sqlite-sync` 以唯讀開啟 SQLite，將筆記匯出至 `notes_root`（`reconcile_mode: mirror` 時會刪除資料庫已不存在的對應 `.md`）；可選擇接續執行與 `index`／`wiki-compile` 相同的管線。
- **風險**：勿將匯出目錄指到 Joplin Profile 內你仍手動維護的 `.md`，除非你確定 mirror 刪除策略可接受。

```bash
pnpm exec joplin-llm-wiki sqlite-sync --config ./my.config.yaml
pnpm exec joplin-llm-wiki sqlite-sync --config ./my.config.yaml --dry-run
```

定時執行建議使用系統 cron 或 macOS `launchd` 呼叫上述命令；亦可於設定中設定 `joplin_sqlite_sync.schedule.every_seconds` 或使用 `--every <秒數>` 由單一行程輪詢（收到 SIGINT 時停止）。

**macOS 一鍵常駐（Ollama + Chroma + `sqlite-sync`）**：若要以登入後三支 LaunchAgent 全堆疊背景執行（含就緒等待與日誌路徑），見 **[`docs/macos-launchd-stack.md`](docs/macos-launchd-stack.md)**。

## Joplin：Desktop、Data API 與 Wiki 寫回（`joplin_wiki_writeback`）

- **Joplin Desktop（或官方行動／桌面客戶端）**：用來**瀏覽與手動管理**完整筆記庫（同步、搜尋、編輯）。請與本工具使用**同一個 Joplin Profile**，這樣 `joplin_sqlite_sync` 所讀的 `database.sqlite` 路徑、以及寫回目標筆記本樹才會一致。
- **Joplin Data API（Clipper）**：在 Desktop **設定 → 網頁剪輯器**啟用 **Web Clipper 服務**，複製 **授權權杖（token）**，並確認 **埠號**（預設常見為 `41184`）。`wiki-compile` 成功寫入 `wiki_root` 後，當 `joplin_wiki_writeback` 啟用且非 `--dry-run` 時，會透過 **`joplin_data_api`**（僅允許 **本機 loopback**：`127.0.0.1`／`localhost`／`::1`）將本輪頁面 **upsert** 至 Joplin：預設頂層筆記本 **`note-wiki`**，其下依 wiki **YAML frontmatter** 的 **`domain`**（或 `topic_frontmatter_key`）建**子筆記本**，並以**筆記標題**做 upsert。若省略 `domain`（或該鍵非字串／為空），寫回會落到 **`_uncategorized`**。請先**備份 Profile**；寫回會覆寫 `note-wiki` 樹下**同名 note** 的正文。`wiki-compile --dry-run` **不會**對 Joplin 發送會變更資料的 HTTP；仍會輸出 `writeback_would_write` 等乾跑統計。關閉寫回：設 `joplin_wiki_writeback.enabled: false`。
- **寫回預檢（`GET /ping?token=…`）**：`index` 與非 dry-run 的 `wiki-compile` 寫回階段前會呼叫一次 ping 以確認 API 可用；失敗時 stderr 為單行 JSON，`error` 為 **`JOPLIN_DATA_API_FAILED`**。
- **`sqlite-sync`**：仍以 **better-sqlite3 唯讀**開啟 `database.sqlite` 匯出至 `notes_root`；**不**以 Data API 取代大宗匯出。建議避免與大批量寫回在同一短時間窗內並行操作同一 Profile。

編譯產物目錄：`config.yaml.example` 預設 **`wiki_root: ./wiki_root`**（與 `notes_root` 相同層級的倉庫根相對路徑）。`.gitignore` 已包含 **`wiki_root/`**，編譯出的 Wiki 預設不進版控。

## 測試

```bash
pnpm test
```

整合索引測試預設使用記憶體向量後端（不透過 Chroma HTTP），以降低 CI 對本機 Chroma 版本的耦合：

- `JOPLIN_LLMWIKI_TEST_MEMORY_VECTOR=1`（建議）；仍相容 `JOPLIN_BRAIN_TEST_MEMORY_VECTOR=1`（測試會擇一自動設定）
- 迷你 `config.yaml` 若**不需**驗證 Joplin 寫回，請設 `joplin_wiki_writeback.enabled: false`；否則在寫回開啟時須提供非空 **`joplin_data_api.token`** 與 loopback **`joplin_data_api.base_url`**，否則 `load-config` 會 **`CONFIG_INVALID`**。

## 風險與注意

- **預設 `write_back.sources_enabled=false`**：工具不應寫回 `notes_root`；Wiki 僅寫入 `wiki_root`。
- **矛盾判定為「候選」**：需人工複核。
- **Chroma CLI 與 `chromadb` client 版本**：若連線異常，請確認 `pnpm exec chroma --version` 與官方相容矩陣；本 repo 已將 CLI 心跳改用 `listCollections` 探測以避免部分版本的 `heartbeat` 動詞不一致。

排程範例見 `docs/scheduling-examples.md`。macOS `launchd` 全堆疊安裝見 `docs/macos-launchd-stack.md`。
