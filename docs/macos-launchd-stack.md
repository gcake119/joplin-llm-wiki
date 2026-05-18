# macOS：全堆疊 LaunchAgent（Ollama + Chroma + sqlite-sync）

本文件說明如何以 **launchd LaunchAgent** 在登入後背景常駐：

1. **Ollama**（`ollama serve`）
2. **Chroma**（與 README 相同之 `pnpm exec chroma run --path ./data/chroma --host 127.0.0.1 --port 8000`）
3. **`joplin-llm-wiki sqlite-sync`**（含每週期匯出、索引、`wiki-compile`／寫回等，由你的 `config.yaml` 決定）

設計前提是**全本機**、無對外 HTTP API；監聽僅限本機 loopback（與專案 README 一致）。

亦可經 **Health GUI**（Electron）執行相同的 install／uninstall 腳本與設定編輯，詳見根目錄 `README.md` 的 **Health GUI** 章節。

## 前置條件

- macOS，可寫入 `~/Library/LaunchAgents/` 與 `~/Library/Logs/joplin-llm-wiki/`
- 已 **pnpm install** 專案、已安裝 **Ollama**（`ollama` 在 PATH 或你已自建 wrapper）
- 已備好 **`config.yaml`**，且至少包含：

  - `joplin_sqlite_sync.enabled: true`
  - `joplin_sqlite_sync.database_path`：指向與 **Joplin Desktop** 相同 profile 之 `database.sqlite` 的**絕對路徑**
  - 在常見預設 profile 佈局下，該檔路徑為 **`~/.config/joplin-desktop/database.sqlite`**（請在 YAML 展開為絕對路徑，勿直接寫 `~`，除非你使用的 YAML 載入器會展開）
  - `joplin_sqlite_sync.schedule.every_seconds: 600`（或你希望的秒數；600＝約 10 分鐘一輪）
  - 若啟用 **Joplin 寫回**：在 `config.yaml` 設定 **`joplin_data_api`**（**token** 非空、**base_url** 為 loopback，見 README）；**Joplin Desktop** 須啟用 **Web Clipper／Data API** 服務，排程主機須能連到該埠（預設常見 `41184`）。純 launchd、無圖形環境時通常**無法**常駐 Clipper——請改 **`joplin_wiki_writeback.enabled: false`** 或使用僅 **`wiki-compile --dry-run`** 的排程。

- **Joplin Desktop** 與 **`database.sqlite`／匯出路徑**須對齊同一 profile（寫回與 sqlite-sync 皆然）。

## 環境變數（可選）

可在 repo 根目錄建立 **`.env.launchd`**（勿提交版控），於 `run-sqlite-sync.sh` 內會自動 `source`（若檔案存在）：

| 變數 | 預設 | 說明 |
|------|------|------|
| `MLS_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama HTTP 基礎位址（就緒檢查會請求 `/api/tags`） |
| `MLS_CHROMA_URL` | `http://127.0.0.1:8000` | Chroma HTTP 基礎位址（就緒檢查會請求 `/api/v2/heartbeat` 或 `/api/v1/heartbeat`） |
| `MLS_WAIT_TIMEOUT_SEC` | `120` | 等待 Ollama＋Chroma 就緒的上限秒數 |
| `MLS_WAIT_INTERVAL_SEC` | `2` | 輪詢間隔秒數 |
| `CHROMA_HOST` / `CHROMA_PORT` | `127.0.0.1`／`8000` | 僅影響 **`run-chroma.sh`** 之 `chroma run` 參數 |

## 日誌

plist 將輸出導向（安裝後已由占位符替換為你的 `$HOME`）：

| 服務 | 路徑 |
|------|------|
| Ollama | `~/Library/Logs/joplin-llm-wiki/ollama.log`、`ollama.err.log` |
| Chroma | `~/Library/Logs/joplin-llm-wiki/chroma.log`、`chroma.err.log` |
| sqlite-sync | `~/Library/Logs/joplin-llm-wiki/sqlite-sync.log`、`sqlite-sync.err.log` |

`sqlite-sync` 每完成一輪排程，stdout 會出現與 CLI 相同之 **JSON summary**（可於 `sqlite-sync.log` 追蹤）。

**升級自舊 repo／套件名時**：若你先前將日誌寫在 `~/Library/Logs/joplin-brain/`，新版本預設改為 **`~/Library/Logs/joplin-llm-wiki/`**；請重新執行 **`install-joplin-brain-stack.sh`** 以套用 plist 內新路徑（或自行複製／對齊 `StandardOutPath`）。

若 **Chroma 或 Ollama 未在逾時內就緒**，`run-sqlite-sync.sh` 會在 **stderr** 印出**單行**錯誤並以**非零退出**（見 `sqlite-sync.err.log`），避免無窮等待。

### Activity Monitor／`ps` 里的工序名

三支 plist 以 **`scripts/launchd/shims/`** 下的 **bash shim 腳本**（將引數轉交 `/bin/bash`）作為程式進入點，再載入對應的 `run-*.sh`，讓行程列表中的「指令」欄較易對應本專案堆疊（實際顯示仍依 macOS／shell 版本略有差異）。語意對應如下：

| 顯示名稱（約） | 實際行為 |
|----------------|----------|
| `joplin-llm-wiki-ollama-serve` | 執行 **`ollama serve`** |
| `joplin-llm-wiki-chroma-server` | 執行 **`pnpm exec chroma run …`**（本機 Chroma） |
| `joplin-llm-wiki-sqlite-sync` | **輪詢 Ollama／Chroma 就緒**後執行 **`joplin-llm-wiki sqlite-sync`** |

wrapper 內對長駐子行程另使用 **`exec -a`** 將行程名與上列對齊（監視器裡看到的標籤可能仍依 runtime／系統版本略有差異）。

**若你已裝過舊版 plist**：請再跑一次 **`install-joplin-brain-stack.sh`**，覆寫 `~/Library/LaunchAgents/` 內三份 plist 後 **`launchctl bootout`／`bootstrap`**，才會套用新工序名。

## 一鍵安裝

於專案 repo 根目錄（已 `pnpm install`）：

```bash
mkdir -p ~/Library/Logs/joplin-llm-wiki
chmod +x scripts/launchd/*.sh scripts/launchd/shims/joplin-llm-wiki-*
REPO_ROOT="$(pwd)" JOPLIN_LLMWIKI_CONFIG="/絕對路徑/你的.config.yaml" \
  ./scripts/launchd/install-joplin-brain-stack.sh
```

或使用位置參數：

```bash
./scripts/launchd/install-joplin-brain-stack.sh "/絕對路徑/joplin-llm-wiki" "/絕對路徑/你的.config.yaml"
```

安裝腳本會：

1. 將三支範本 plist 寫入 `~/Library/LaunchAgents/com.joplin-brain.{ollama,chroma,sqlite-sync}.plist`
2. 先對既有同名 job 執行 `bootout`（若存在），再依序 `launchctl bootstrap gui/$(id -u) …`

### 驗證載入

```bash
launchctl print "gui/$(id -u)" | grep -E 'com\.joplin-brain\.(ollama|chroma|sqlite-sync)' || true
```

（若你的系統之 `launchctl print` 輸出格式不同，請改以 Activity Monitor 或 `ps` 檢查 **`joplin-llm-wiki-ollama-serve`**、**`joplin-llm-wiki-chroma-server`**、**`joplin-llm-wiki-sqlite-sync`**（shell／pnpm／node／ollama 子行程另可依進程樹辨識）。）

## 解除安裝

```bash
./scripts/launchd/uninstall-joplin-brain-stack.sh
```

此動作**不會**刪除 Joplin profile、`database.sqlite`、`notes_root` 或 `data/chroma`。

## launchctl 版本差異

較新 macOS 使用 **`launchctl bootstrap gui/$(id -u) <plist路徑>`**／**`launchctl bootout gui/$(id -u)/<Label>`**；若你系統僅支援舊語意，請參考 Apple 文件將 **bootstrap／bootout** 改為等效之 **load／unload**（本 repo 腳本以現行語意為準）。

## KeepAlive 與風險

範本 plist **未**預設 `KeepAlive`，避免依賴異常時無限重啟灌爆日誌。若你需要自動拉起，請自行在 plist 加入 `KeepAlive` 並理解可能之**重啟循環**；亦請注意 **Joplin Desktop** 與 **sqlite-sync** 同時存取 `database.sqlite` 時之鎖定行為（工具以唯讀開啟 SQLite，仍建議備份與錯峰）。

## 精簡模式（僅 sqlite-sync）

若你已用手動終端機或其他方式常駐 Ollama／Chroma，可只複製／載入 `com.joplin-brain.sqlite-sync.plist`（仍需正確 `REPO_ROOT`、`JOPLIN_LLMWIKI_CONFIG`（或相容之 `JOPLIN_BRAIN_CONFIG`）與日誌路徑）；若 Ollama／Chroma 未起，`run-sqlite-sync.sh` 會依 `MLS_WAIT_TIMEOUT_SEC` **逾時失敗**。

## config 範例片段（sqlite-sync + 600 秒 + 典型 DB 路徑占位）

以下僅示意；請將 `database_path` 換成你機器上**真實存在**之 `database.sqlite` 絕對路徑（預設佈局常為 `$HOME/.config/joplin-desktop/database.sqlite`）：

```yaml
joplin_sqlite_sync:
  enabled: true
  database_path: "/Users/你的使用者/.config/joplin-desktop/database.sqlite"
  reconcile_mode: mirror
  pipeline:
    run_index: true
    run_wiki_compile: true
  schedule:
    every_seconds: 600
```

手動單次驗證管線正常後，再執行 LaunchAgent 安裝較易除錯：

```bash
pnpm exec joplin-llm-wiki sqlite-sync --config /絕對路徑/你的.config.yaml
```

## 相關檔案

- 範本與腳本：`scripts/launchd/`（見該目錄 `README.md`）
- 排程備援／cron 範例：`docs/scheduling-examples.md`
