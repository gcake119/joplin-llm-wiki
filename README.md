# joplin-brain（Karpathy MVP）

本機-first 的 **Sources → Compiled Wiki → Schema** 三層管線：向量分 `collection_sources` / `collection_wiki`，`wiki-compile` 透過本機 Ollama 規劃並撰寫 `wiki_root`，`ask` 支援 `wiki_first` / `sources_only` / `merged`，`lint` 輸出 Karpathy 版報告（重複、原件孤立、hub 孤立、矛盾候選、schema 缺口等）。

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
pnpm exec joplin-brain --help
pnpm exec joplin-brain index --config ./my.config.yaml
pnpm exec joplin-brain watch --config ./my.config.yaml
pnpm exec joplin-brain wiki-compile --config ./my.config.yaml
pnpm exec joplin-brain wiki-compile --config ./my.config.yaml --dry-run
pnpm exec joplin-brain ask --config ./my.config.yaml "你的問題"
pnpm exec joplin-brain lint --config ./my.config.yaml
```

Exit codes：**0** 成功；**1** 設定／schema／CLI 預檢／**wiki-compile 寫回（`JOPLIN_CLI_FAILED` / `JOPLIN_CLI_WRITE_FAILED`）** 等；**2** Ollama／Chroma 不可用；**3** 其他錯誤。

## 設定範例

- `config.yaml.example`
- `wiki-schema.example.yaml`
- `fixtures/full-karpathy.config.yaml`（需改成你的絕對路徑）

## Joplin Desktop SQLite 匯出＋排程（`sqlite-sync`）

- **預設筆記目錄**：範例使用倉庫根目錄 `./notes_root`；此資料夾已列於 `.gitignore`，**筆記 Markdown 不會進版控**。克隆後若無此目錄，請自行 `mkdir -p notes_root` 或由匯出流程建立。
- **原生模組**：`sqlite-sync` 依賴 `better-sqlite3`。若 `pnpm install` 後出現 bindings／「Could not locate」類錯誤，在 pnpm 11+ 通常需先執行 `pnpm approve-builds --all`（或依互動提示核准該套件），再重新安裝以完成編譯。
- **來源**：Joplin Desktop 設定檔目錄內之 `database.sqlite`（依你的安裝位置調整絕對路徑；常見預設為 **`~/.config/joplin-desktop/database.sqlite`**）。
- **行為**：`joplin_sqlite_sync.enabled: true` 時，`sqlite-sync` 以唯讀開啟 SQLite，將筆記匯出至 `notes_root`（`reconcile_mode: mirror` 時會刪除資料庫已不存在的對應 `.md`）；可選擇接續執行與 `index`／`wiki-compile` 相同的管線。
- **風險**：勿將匯出目錄指到 Joplin Profile 內你仍手動維護的 `.md`，除非你確定 mirror 刪除策略可接受。

```bash
pnpm exec joplin-brain sqlite-sync --config ./my.config.yaml
pnpm exec joplin-brain sqlite-sync --config ./my.config.yaml --dry-run
```

定時執行建議使用系統 cron 或 macOS `launchd` 呼叫上述命令；亦可於設定中設定 `joplin_sqlite_sync.schedule.every_seconds` 或使用 `--every <秒數>` 由單一行程輪詢（收到 SIGINT 時停止）。

**macOS 一鍵常駐（Ollama + Chroma + `sqlite-sync`）**：若要以登入後三支 LaunchAgent 全堆疊背景執行（含就緒等待與日誌路徑），見 **[`docs/macos-launchd-stack.md`](docs/macos-launchd-stack.md)**。

## Joplin：Desktop、CLI 與 Wiki 寫回（`joplin_wiki_writeback`）

- **Joplin Desktop（或官方行動／桌面客戶端）**：用來**瀏覽與手動管理**完整筆記庫（同步、搜尋、編輯）。請與本工具使用**同一個 Joplin Profile**，這樣 `joplin_sqlite_sync` 所讀的 `database.sqlite` 路徑、以及 CLI 寫回的目標樹才會一致。
- **Joplin 終端機 CLI**：需**另外安裝**；**專供 `wiki-compile` 成功後**把本輪編譯的 Markdown **寫入 Joplin**（預設頂層筆記本 `note-wiki`，其下依 wiki 的 **YAML frontmatter** 欄位 **`domain`**——或設定裡的 `topic_frontmatter_key`——建立**子筆記本**，並以**筆記標題**做 upsert）。若省略 `domain`（或該鍵非字串／為空），寫回會落到 **`_uncategorized`** 子筆記本。請先**備份 Profile**；寫回會覆寫 `note-wiki` 樹下**同名 note** 的正文。可用 `wiki-compile --dry-run` 演練（不呼叫會變更 Joplin 的 CLI）；要完全關閉寫回請在設定中設 `joplin_wiki_writeback.enabled: false`。
- **`sqlite-sync`**：仍以 **better-sqlite3 唯讀**開啟 `database.sqlite` 匯出至 `notes_root`；**不**在本變更中改為全面改用 CLI 匯出。建議避免與大批量 CLI 寫回在同一短時間窗內並行操作同一 Profile。

編譯產物目錄：`config.yaml.example` 預設 **`wiki_root: ./wiki_root`**（與 `notes_root` 相同層級的倉庫根相對路徑）。`.gitignore` 已包含 **`wiki_root/`**，編譯出的 Wiki 預設不進版控。

## 測試

```bash
pnpm test
```

整合索引測試預設使用記憶體向量後端（不透過 Chroma HTTP），以降低 CI 對本機 Chroma 版本的耦合：

- `JOPLIN_BRAIN_TEST_MEMORY_VECTOR=1`（測試會自動設定）
- 迷你 `config.yaml` 若**不需**驗證 Joplin 寫回，請設 `joplin_wiki_writeback.enabled: false`（或啟用 `joplin_cli`），否則 `load-config` 會因預設寫回開啟而 `CONFIG_INVALID`。

## 風險與注意

- **預設 `write_back.sources_enabled=false`**：工具不應寫回 `notes_root`；Wiki 僅寫入 `wiki_root`。
- **矛盾判定為「候選」**：需人工複核。
- **Chroma CLI 與 `chromadb` client 版本**：若連線異常，請確認 `pnpm exec chroma --version` 與官方相容矩陣；本 repo 已將 CLI 心跳改用 `listCollections` 探測以避免部分版本的 `heartbeat` 動詞不一致。

排程範例見 `docs/scheduling-examples.md`。macOS `launchd` 全堆疊安裝見 `docs/macos-launchd-stack.md`。
