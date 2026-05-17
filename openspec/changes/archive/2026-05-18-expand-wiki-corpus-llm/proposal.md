## Why

現行 wiki-compile 的 planner 僅將 notes_root 內字典序排序之前約 40 個 Markdown 的路徑與 mtime 摘要餵給 LLM，正文產製亦僅截取少數來源片段；對數千則規模的筆記庫，無法構成「對全筆記庫做有意義的批次 LLM-wiki」，操作者只能靠反覆手動跑指令且結果仍偏重固定 hub，與「Jarvis Related Notes」即時互補但批次覆蓋面不足。此變更要在維持全本機、不強制雲端的前提下，為 wiki-compile 擴張可查閱／可規劃的筆記庫視窗與選用來源 excerpts 的機制，使長期可多輪收斂覆蓋全庫。

（**ingest**：以 **主題式個人知識庫管理**為導向時，wiki-compile **預設即採 notebook-wide corpus 行為**（擴張 digest／excerpt），僅在未設定或沿用舊 YAML 的情境下也需如此；若仍要過往「輕量 hub／短 digest」，操作者需在設定檔 **顯式關閉** corpus mode。）

## What Changes

- 引入 **`wiki_ingest`** 底下的 **notebook-wide corpus 模式**為 **預設啟用**（鍵省略時視為開啟），使 planner／writer 對 **較大口徑來源視窗與 excerpts**對齊全筆記庫 LLM-wiki；保留 **`corpus_mode_enabled: false`** 以回復過往四十檔／短視窗相容路徑。
- 來源側仍支援可選 **本機 Chroma** 片段、`corpus_digest_offset` 分段掃掠，以及 **`max_pages_per_run`** 單輪頁數硬上限。
- 對 **wiki-ingest**、**compiled-wiki**、**wiki-corpus-llm** delta 對齊此預設語意並更新 **CHANGELOG／README**，標示省略 **`wiki_ingest.corpus_mode_enabled`** 鍵時的 **預設行為變更（BREAKING）**。

## Non-Goals

- 不將批次 wiki-compile **預設**改為對外 HTTP API 或託管向量服務；Chroma／Ollama 仍維持本機路徑與 localhost 為預設邊界。（**Legacy**：並非否定雲同步，而是本管線不依遠端 LLM／託管向量；舊有精簡 digest 仍可經 **`corpus_mode_enabled: false` 達成**。）
- 不保證「單次 invocation 內對每一則筆記各自產製完整長文 wiki 頁」；覆蓋全庫可透過分批與／或多輪，具體收斂條件在 design 載明並由操作者監控。
- 不取代 Joplin／Jarvis 編輯器內 UX；不改变 Joplin Cloud 同步契約。

## Goals

1. **G1**：在未改設定檔的情境下，`wiki-compile` **預設**使 planner／writer 對 **遠超過 forty-file digest／五檔 excerpt** 視窗可操作，並可藉 offset 分批掃全庫以利主題式整理。
2. **G2**：撰寫階段可為每個目標 wiki 路徑拉入 **與該路徑相關**之本機來源文字（檔案直讀與／或本機 Chroma top-k），而非永遠只讀字典序前五檔。
3. **G3**：維持 **dry-run**、**max_pages_per_run** 上限與 **`joplin_wiki_writeback`**；**顯式關閉** corpus mode 之行為 MUST 對齊變更前 hub+digest／測試基線。

## Breaking change surface

- **BREAKING（預設）**：對 **省略 `wiki_ingest.corpus_mode_enabled` 鍵**之既有 `config.yaml`，載入語意將自「compact digest／舊相容路徑」轉為 **預設 notebook-wide corpus**；升級須於 YAML **顯式**寫入 **`wiki_ingest.corpus_mode_enabled: false`**，或接受新預設之 Ollama／I／O 成本。

## 全本機運作

- **資料**：仍僅讀取 config 所指 notes_root／wiki_root 與本機 Chroma persist_path；不向公網上傳筆記內文。
- **推理**：embedding／chat 僅經設定之 Ollama base_url（預設本機環回）。
- **網路邊界**：除 Ollama 外不新增對外 Mandatory 相依；向量查詢走本機嵌入式 Chroma。
- **離線驗收**：在 Ollama 與資料目錄就緒、且若啟用 Chroma 時本機向量庫可讀的情境下，可於無對外 SaaS 下跑通 corpus 模式之單元與縮排整合測（以 mock／fixture）。

## 與 Joplin／Jarvis／joplin-llm-wiki 三者關係

- **Joplin**：仍為使用者主資料；sqlite-sync／notes_root 快照與選用之 Joplin CLI 寫回契約維持不變。
- **Jarvis**：仍負責編輯器即時語境／Related Notes；本變更重於 **離線／批次 wiki-compile**，與 Jarvis 互補而非取代。
- **joplin-llm-wiki**：CLI 為單一事實來源入口；新模式為既有 wiki-compile／index 組合之擴充，不強制換 host。

## Capabilities

### New Capabilities

- `wiki-corpus-llm`: 規格化筆記庫面向之 wiki-compile：模式切換、來源視窗與 excerpts 來源語意（檔案系統對照與選用向量檢索）、與 indexer／Chroma 之前置條件及錯誤語意。

### Modified Capabilities

- `wiki-ingest`: 擴充既有頁數預算、planner 提要與 dry-run 行為，使與 corpus 模式一致且可測。
- `compiled-wiki`: 延伸 wiki 產出物與 frontmatter／路徑契約在 corpus 模式下的必要欄位或範例（若與現行 hub-only 有差異則以 delta 載明）。

## Impact

- Affected specs: 新 **`openspec/specs/wiki-corpus-llm`** 落地；delta **`wiki-ingest`**、**`compiled-wiki`**（含 **REQ-WCC-001** 預設語意）。
- **BREAKING**：預設 `corpus_mode_enabled` 對「鍵省略」YAML 的行為；
- Affected code:
  - New: （由 design 列出具體模組；預期含 wiki-planner／wiki-compiler／load-config 之延伸與測試檔）
  - Modified: src/wiki/wiki-planner.js、src/wiki/wiki-compiler.js、src/config/load-config.js、src/commands/cmd-wiki-compile.js、config.yaml.example、README.md、test/wiki-separation.test.js 及相關整合測
  - Removed: none

## Risks（高層）

- **R1**：Notebook-wide digest **預設開啟**會提高 Ollama／磁碟峰值；仍以 **`corpus_digest_max_files`**、`max_pages_per_run`、顯式 **false** 與運維紀律緩解。
- **R2**：Chroma 未更新或 collection 空時，檢索品質下降；须定義明確降級與操作者訊息。
- **R3**：與既有 hub schema strict 互動可能產生 planner 衝突；design 須定義優先序。

## Assumptions

- 單機、單使用者；筆記量級在萬則以下仍為主要目標場景。
- Ollama 模型已依 README 建議拉取；Chroma 若啟用則 persist_path 可寫入。
- Node.js 20+ 與 pnpm 工作流不變。

## Rollback

- 於設定檔將 **`wiki_ingest.corpus_mode_enabled`** 設為 **false**，行為對齊變更前 **hub+digest／短 excerpt**語意。
- 向量庫可獨立 `data/chroma/` 重建；不影響 notes_root 原件（除非另啟 write_back）。

## MVP 對照

- **現行 MVP**：預設精簡 digest（四十檔級）與極窄 excerpt。
- **此 change 之 MVP**：**預設**啟 notebook-wide corpus 行為並具自動測試；**explicit false** 保留舊路徑用於自動化／極資源環境。

## Success Criteria（勾選清單）

- [ ] SCN：省略 `corpus_mode_enabled` 鍵之 fixture：**預設**採 **REQ-WCC-002 Planner digest window beyond legacy cap**；stdout／mock prompt 對照為「優於 forty-file baseline」。
- [ ] SCN：**`corpus_mode_enabled: false`**：行為對齊變更前 REQ-WI／fixtures（迴歸）。
- [ ] SCN：啟動 **REQ-WCC-003 Writer excerpt composition modes** 時，標的 wiki path 可得 Chroma-augmentable excerpt（或由 mock chunks 替代），並有單測／整合測覆蓋。

## 變更類型

Feature
