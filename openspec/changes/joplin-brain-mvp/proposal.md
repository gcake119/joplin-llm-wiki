## Why

使用者要在**資料與推理不出本機**前提下，同時擁有：(1) **傳統向量 RAG**（即時檢索原件）、(2) **Karpathy LLM Wiki 架構**——原件層不可變、由 LLM **持續維護**的編譯 Wiki 層、以及 Schema 驅動的工作流；單次 ingest 觸及受限數量的 Wiki 頁，Lint 涵蓋**矛盾、孤立（含 Wiki 內部圖）、資料缺口**。本 change 將原本的 MVP-only 範圍**升格為一次交付完整 Karpathy 能力集**（仍維持 Node.js + 本機 Ollama + 本機 Chroma）。

## What Changes

- **原件層（Sources）**：`notes_root` 內 Joplin `.md` **預設唯讀**；向量索引寫入獨立 Chroma collection（與 Wiki 向量分離）。
- **編譯 Wiki 層（Compiled Wiki）**：可設定 `wiki_root`，存放 LLM 產生／更新的 Markdown；強制 frontmatter（來源引用 `source_refs`、編譯時間、`compiler_revision` 等），且 **Wiki 管線 SHALL NOT 修改 `notes_root` 檔案內容**（除非使用者另行明示開啟且經批准之 write_back——預設關閉）。
- **Schema 層**：`wiki_schema.path` 指向 YAML／JSON schema，定義 **page types**、必填欄位、hub／索引頁規則、ingest 工作流程步驟。
- **Wiki ingest／compile**：新增 CLI（例如 `joplin-brain wiki-compile`）：由 LLM **規劃本輪需更新之 Wiki 頁清單**，受 `wiki_ingest.max_pages_per_run` 約束（預設 15，可配置於 10–15 區間）；逐頁讀取原件上下文、生成／更新 Wiki 檔案；可選 `--dry-run` 僅輸出計畫與 patch 報告。
- **向量索引**：`index` **同時**（或可設定）索引 `notes_root` 與 `wiki_root`，metadata 標記 `layer: source|wiki`。
- **RAG**：`ask` 支援 **`rag.retrieve_mode`**：`wiki_first`（預設：優先檢索 wiki collection，不足再補 sources）、`sources_only`、`merged`。
- **Karpathy Lint**：`lint` 產出延伸報告——保留向量重複候選；加上 **跨頁／頁對原件的矛盾候選**（LLM 結構化輸出 + 可追溯引用）、**Wiki 孤立**（hub／反向鏈規則）、**Schema 缺口**（依 schema 應存在之索引頁／欄位缺失）。
- **選配 Joplin CLI 預檢**：維持既有選配行為。
- **文件與設定**：`config.yaml.example`、`wiki-schema.example.yaml`、README 描述三層架構與安全預設。

**變更類型**：Feature（大型範圍擴張）

## 全本機運作

| 邊界項目 | 行為 |
|---------|------|
| 資料路徑 | 唯讀：`notes_root`；可寫：`wiki_root/`（編譯產物）、`data/chroma/`、`reports/`、日誌 |
| Ollama | 僅 `config.ollama.base_url`（預設 127.0.0.1）；嵌入／chat／ingest 規劃／矛盾判定皆走本機 |
| Chroma | 嵌入式持久化；至少 **`collection_sources`** 與 **`collection_wiki`** 兩 logical collection（或等價命名） |
| 網路 | 無對外 HTTP API；禁止雲端 LLM 為預設 |
| 離線 | 在模型已 pull、資料可讀時，index／wiki-compile／ask／lint 可不依賴外網 |

## Goals

1. **G1**：原件與 Wiki 檔案與向量狀態可追溯（hash、墓碑、分 collection）。
2. **G2**：`wiki-compile` 單次運行觸及頁數 ≤ `wiki_ingest.max_pages_per_run`，且每頁有 source_refs。
3. **G3**：`ask` 在 `wiki_first` 下能引用 wiki 或原件 path，滿足可驗證 citation。
4. **G4**：`lint` JSON 同時含 **contradictions[]**、**wiki_orphans[]**、**schema_gaps[]**（結構見 specs），並保留 duplicates／orphans（連結）欄位。

## Non-Goals

- 遠端向量庫、託管 Chroma、雲端 LLM。
- 圖片 OCR／PDF 全文（僅記錄 skip）。
- Web UI、對外公開 API、修改 Jarvis／Joplin 原始碼。
- Python 預設實作棧。
- **預設**經 Wiki 管線**自動覆寫** `notes_root`（預設禁止；若日後開放須獨立人工批准流程與 audit）。

## Risks（高層）

- **RISK-K1**：LLM 編譯產出幻覺或錯链 source_refs → 以前置檢查 + lint 矛盾／缺口 + 人工抽查緩解。
- **RISK-K2**：單次 ingest token／成本高 → `max_pages_per_run` + dry-run + 排程分割。
- **RISK-K3**：矛盾判定誤報／漏報 → 報告定位為「候選」，要求引用段落 ID。
- **RISK-K4**：與 Joplin 同步競態 → mtime／hash；wiki 與 sources 分別墓碑。
- **RISK-K5**：schema 錯誤導致全 pipeline 失敗 → schema 驗證獨立 exit code 與清晰錯誤鍵。

## MVP 對照（Karpathy 全套）

| 層級 | 交付 | CLI／元件 |
|------|------|-----------|
| Sources | 唯讀原件 + 向量 | `index`、`watch`、Indexer、`collection_sources` |
| Wiki | 編譯 Markdown + 向量 | `wiki-compile`、`WikiCompiler`、`collection_wiki` |
| Schema | 結構與 workflow | `wiki-schema` 檔、`SchemaValidator` |
| Cross-cutting | RAG + 深度 Lint | `ask`、`lint`、`KarpathyLintEngine` |

## Success Criteria

- [ ] **SCN-IDX-DUAL**：index 後 Chroma 中 sources／wiki 兩 collection 均可 query（fixtures）。
- [ ] **SCN-WIKI-COMPILE**：`wiki-compile` 在 fixtures 上產生／更新 ≤max_pages 個 wiki 檔，且每檔 frontmatter 含 `source_refs`。
- [ ] **SCN-RAG-WIKI-FIRST**：`rag.retrieve_mode: wiki_first` 時，對固定問題 SOURCES 至少一筆來自 `wiki_root`（若 wiki 已索引）。
- [ ] **SCN-LINT-KFULL**：`lint` JSON 含 `contradictions`、`wiki_orphans`、`schema_gaps` 鍵（零長度陣列可接受）。
- [ ] **SCN-OFFLINE-01**：斷外網（localhost Ollama）下 index／wiki-compile／ask／lint 皆可完成（模型已備）。
- [ ] **SCN-JOP-CLI-01**：（選配）維持既有 Joplin CLI 預檢失敗語意。

## Joplin、Jarvis、joplin-brain 分工

- **Joplin Desktop**：原件編輯與同步；`notes_root` 對應 Profile `.md`。
- **Joplin CLI**：選配預檢。
- **Jarvis**：即時編輯器體驗；本專案不修改其程式碼。
- **joplin-brain**：本機索引、**Wiki 編譯**、Schema、RAG、Karpathy 級 Lint。

## 技術棧

Node.js 20+、JavaScript ESM、`pnpm`、chokidar、ChromaDB 嵌入式、YAML；本機 Ollama（嵌入 + chat + ingest 規劃／結構化抽取／矛盾判定提示）。

## Assumptions

- 使用者接受 Wiki 層佔用額外磁碟與向量空間。
- 單機單使用者；模型由使用者自行 pull。
- Node ≥20。

## Rollback

- 停止 watch；刪除／重建 `data/chroma/`；刪除 `wiki_root` 產物僅影響編譯層，不影響 `notes_root`（預設）。

## Capabilities

### New Capabilities

- `note-indexing`：原件掃描、chunk、嵌入、`collection_sources`（與 wiki 分離）；watch；選配 Joplin CLI 預檢。
- `compiled-wiki`：`wiki_root`  layout、frontmatter 契約、與原件不可變邊界。
- `wiki-schema`：schema 檔格式、驗證、page types、workflow 宣告。
- `wiki-ingest`：`wiki-compile` 批次規劃與寫檔、`max_pages_per_run`、dry-run。
- `cli-rag`：`ask`、檢索模式、`collection_sources`／`collection_wiki`。
- `karpathy-lint`：duplicates、link orphans、**contradictions**、**wiki_orphans**、**schema_gaps** 報告。

### Modified Capabilities

（無既有 openspec/specs 正式版；舊版向量 Lint 命名已由 **karpathy-lint** 承接。）

## Impact

- Affected specs: `note-indexing`、`compiled-wiki`、`wiki-schema`、`wiki-ingest`、`cli-rag`、`karpathy-lint`
- Affected code（relative to repo root after apply）:
  - New: `package.json`、`pnpm-lock.yaml`、`bin/joplin-brain.js`、`src/**/*.js`、`config.yaml.example`、`wiki-schema.example.yaml`、`README.md`、`.gitignore`、`docs/scheduling-examples.md`（可選）
  - Wiki／向量目錄：`wiki/` 或設定之 `wiki_root`、`data/chroma/`、`reports/`
  - Removed: （無）
