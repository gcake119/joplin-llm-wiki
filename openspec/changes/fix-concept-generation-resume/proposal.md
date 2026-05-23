## Why

目前 wiki 編譯在多個 corpus cycle 後，`concepts` 筆記會出現標題與內容不一致、主題近似甚至同標題重複的結果。這會污染 `wiki/concepts/` 與 Joplin `@llm-wiki/wiki/concepts`，也讓使用者在已完成大量 summary 產生後，無法只從 concept 產生與 Joplin 寫回階段接續，必須重跑全庫 summary 而浪費 token。

## What Changes

- 變更類型：Bug Fix + Feature。
- 修正 concept 產生流程：concept 的 slug、title、source_refs 與正文必須來自同一個主題聚類或同一份 manifest，不得只靠 planned path 搭配 unrelated raw slice 生成。
- 新增可接續的 wiki 編譯階段：允許從既有 `wiki/summaries/*.md` 產生或更新 `wiki/concepts/*.md` 與 `wiki/indexes/All-Concepts.md`，並可接續執行 Joplin Data API 寫回，不必重新產生所有 summary。
- 新增 concept 去重與 canonicalization：主題是否相同由 LLM 依照 summaries/raw evidence 的語意判斷，字串正規化只能用來產生候選與穩定 slug，不能作為合併判準。
- 強化 Joplin 寫回：依照 Joplin 官方 Data REST API 的能力使用 `POST /notes` 建立、`PUT /notes/:id` 局部更新、`DELETE /notes/:id` 預設移到 trash；對 concept 筆記提供 collision/orphan 可觀測性，避免舊錯誤 concept 在 Joplin 端無限累積。
- 保留全本機流程：local route 仍只使用本機 Ollama；agent route 仍只透過本機 `codex exec`；Joplin 寫回仍只打 loopback Data API。

## Goals

- G1：concept 內容、frontmatter `title`、檔名 slug、`source_refs` 指向同一主題證據，避免標題/內容錯配。
- G2：同一主題在多輪 cycle 後維持同一 canonical concept 檔案與 Joplin note title，不產生近似重複筆記。
- G3：提供明確 CLI 接續模式，從 summaries 已存在的狀態開始產生 concepts/indexes 並寫回 Joplin，不重跑 summary generation。
- G4：讓 concept/writeback 階段可 dry-run 與觀測，先看到將合併、略過、寫回、或可能衝突的筆記清單。
- G5：Joplin 寫回流程先完成 filesystem canonical concept，再用官方 Data REST API 更新既有 note 或建立缺漏 note；刪除舊錯誤 concept 僅能在明確 cleanup/repair 模式移到 trash。

## Non-Goals

- 不重新設計整個 `raw/` 匯出與 sqlite snapshot 比對流程。
- 不引入遠端 DB、雲端向量庫、雲端 LLM API 或第三方 SaaS。
- 不把 Joplin/Jarvis 變成本專案的內部模組；本專案仍只讀本機 raw/wiki 檔案，並可選用本機 Joplin Data API 寫回。
- 不在本變更中建立 Web UI；Health GUI 若需按鈕化操作可另開 change。
- 不以字串相似度、slug 相似度或 title 完全相同作為主題合併的最終判準。
- 不自動刪除 Joplin 端既有舊 concept；除非使用者明確執行本變更定義的 cleanup/repair 模式，且預設只移到 Joplin trash。

## 全本機運作

- 資料路徑：`raw/` 仍是唯讀來源證據，`wiki/summaries/` 可作為接續模式的輸入，`wiki/concepts/` 與 `wiki/indexes/All-Concepts.md` 是本變更的主要輸出。
- Ollama：本地 `wiki-compile` 仍只呼叫 `ollama.base_url`，不新增 OpenAI API provider。
- Chroma：本變更不依賴 Chroma、RAG 或 embeddings；concept 接續應可只靠 filesystem summaries/raw evidence 完成。
- 網路邊界：除了 loopback Ollama 與可選 loopback Joplin Data API，不允許對外 HTTP。
- 離線驗收：在已有 `raw/` 與 `wiki/summaries/` fixtures 的情境下，測試可用 mock Ollama/mock Joplin fetch 驗證 concept 合併與接續寫回。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `wiki-ingest`: 增加 concept-only/resume compile 階段與 concept canonicalization 的要求。
- `compiled-wiki`: 強化 compiled concept 的 title/body/source_refs 一致性與 flat output contract。
- `joplin-wiki-writeback`: 增加 concept 寫回去重、collision/orphan 可觀測性與接續寫回要求。

## Impact

- Affected specs: `wiki-ingest`, `compiled-wiki`, `joplin-wiki-writeback`
- Affected code:
  - Modified: src/wiki/wiki-compiler.js
  - Modified: src/wiki/wiki-planner.js
  - Modified: src/wiki/topic-path-heuristic.js
  - Modified: src/commands/cmd-wiki-compile.js
  - Modified: src/commands/cmd-agent-compile.js
  - Modified: src/joplin/wiki-writeback.js
  - Modified: src/joplin/data-api-client.js
  - Modified: src/config/load-config.js
  - Modified: test/wiki-separation.test.js
  - Modified: test/agent-compile.test.js
  - Modified: test/joplin-wiki-writeback.test.js
  - New: test/wiki-concept-resume.test.js
  - Removed: none

## Risks

- Canonicalization 過度合併可能把本來不同的概念放到同一頁；需要 dry-run 顯示合併決策與來源數。
- Joplin 端已有舊錯誤筆記，若直接清理可能刪到使用者手改內容；cleanup 必須預設非破壞、可觀測。
- Agent route 由 Codex 直接寫檔，必須用 prompt 與後置驗證約束輸出，不能只靠人工遵守。
- LLM 語意判斷可能誤判主題關係；dry-run 必須顯示判斷結果、證據摘要與信心等級，非 dry-run 對低信心合併不得自動套用。

## MVP 對照

- Joplin：仍是筆記來源與可選寫回目的地；本變更不取代 Joplin 編輯與同步。
- Jarvis：仍負責 Joplin 內即時輔助；本變更補強批次 compiled wiki 的穩定性。
- joplin-llm-wiki：負責 raw/wiki pipeline、concept canonicalization、接續模式與寫回觀測。
- 技術棧：Node.js 20+、JavaScript ESM、pnpm；不新增 Python stack。

## Assumptions

- Joplin profile 與 `raw/` 已可由 sqlite-sync 匯出或已有 fixture。
- Ollama 模型已 pull，local route 可連到 `ollama.base_url`。
- Node.js 20+ 與 pnpm 可用。
- 筆記量級小於 10k，concept canonicalization 可在單機 filesystem 掃描內完成。

## Rollback

- 將 `joplin_sqlite_sync.pipeline.compile_mode` 設為 `off` 或停止排程即可停止自動編譯。
- 若 concept 接續輸出不符合預期，可還原 `wiki/concepts/` 與 `wiki/indexes/All-Concepts.md` 的版本控制狀態。
- 本變更不修改 `raw/`；不影響 Joplin 原始筆記內容。
- 若 Joplin 寫回清理模式造成疑慮，停用 `joplin_wiki_writeback.enabled` 或只跑 dry-run。

## Success Criteria

- [ ] SCN-WI-CONCEPT-CANON-01：相同主題跨多輪 compile 後只更新同一 canonical `wiki/concepts/*.md`。
- [ ] SCN-WIKI-CONCEPT-CONSISTENCY-01：concept 檔案的 filename slug、frontmatter `title`、正文 H1 與 `source_refs` 可追溯到同一主題證據。
- [ ] SCN-WI-RESUME-CONCEPTS-01：在 `wiki/summaries/*.md` 已存在時，CLI 可只產生 concepts/indexes 且不改寫 summaries。
- [ ] SCN-JWKB-CONCEPT-COLLISION-01：Joplin 寫回 dry-run 會回報 concept title collision 與 orphan 候選。
- [ ] SCN-JWKB-CONCEPT-UPSERT-01：接續寫回只 upsert canonical concepts/indexes，不重送所有 summaries。
- [ ] SCN-WI-CONCEPT-SEMANTIC-01：concept 合併由 LLM semantic judgment 決定，字串相似只產生候選。
- [ ] SCN-JWKB-REST-CAPABILITY-01：Joplin writeback 可用官方 Data REST API 建立、局部更新、移到 trash，且 cleanup 預設不 permanent delete。
