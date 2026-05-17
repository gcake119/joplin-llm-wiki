<!--
Each task MUST deliver observable behavior + verification per Spectra schema.
Technical tokens (paths, REQ ids) kept verbatim.
Full requirement titles are embedded verbatim for Spectra analyzer coverage linking.
-->

## 1. Configuration and validation

- [x] [P] 1.1 Extend **`wiki_ingest`** inside **`load-config.js`**: **`corpus_mode_enabled` defaults TRUE when key omitted**; validate **`corpus_digest_max_files`**, **`corpus_digest_offset`**, **`corpus_writer_excerpt_mode`**, **`corpus_chroma_top_k`**; invalid combinations emit **`CONFIG_INVALID`**. Implements **`REQ-WCC-001 Corpus mode defaults on for thematic notebook-wide LLM wiki`**. Analyzer substring:decision: 將 corpus 設定置於 **`wiki_ingest` 之下**為巢狀子鍵或同層欄位延伸. Verify：新增／更新 assertions in **`pnpm test test/config-schema.test.js`** PLUS explicit-false corpus-off regression YAML.

- [x] [P] 1.2 Update **`config.yaml.example`** + **`README.md`** + **`CHANGELOG.md`** snippet：record **BREAKING** omission semantics, thematic PKM default, rollback via **`wiki_ingest.corpus_mode_enabled: false`**. Documents **`REQ-WCC-LOCAL Corpus LLM wiki local-first`**. Verify：release reviewer checklist acknowledges token／I-O impact.

## 2. Planner digest rotation

- [x] 2.1 Implement rotated digest per **`REQ-WCC-002 Planner digest window beyond legacy cap`** whenever **`wiki_ingest.corpus_mode_enabled`** resolves **true** (including omission); restore forty-file planner digest iff explicit **false**. Matches design **Decision: `wiki_ingest.corpus_mode_enabled` 預設 true，對齊主題式個人知識庫之全筆記庫 LLM-wiki（ingest）**. Verify：`pnpm test` augments **`test/wiki-separation.test.js`** counters for omission vs legacy false harnesses.

## 3. Writer excerpt assembly

- [x] 3.1 Refactor **`writeWikiPageBody` / excerpt helpers**: implement **`REQ-WCC-003 Writer excerpt composition modes`** filesystem path with rotated budget; expose prompt text proving **`REQ-WIKI-016 Corpus-mode writer evidence beyond legacy five-file excerpt window`**. Analyzer substring:decision: corpus-mode 下 excerpt 來源採 **`filesystem_wide_digest` + 可選 `chroma_neighbors`**. Verify: mock **`OllamaClient.chatComplete`** captures eleventh-sort-order token substring.

- [x] 3.2 Implement optional **`chroma_neighbors`** branch per **`REQ-WCC-003 Writer excerpt composition modes`** and **`REQ-WI-031 Corpus excerpt uses local Chroma only`**. Honors design **Decision: Planner 對 Ollama 仍只發 HTTP chat；對 Chroma 僅經本機 embed client（制内模組呼叫），不把 Chroma 當對外公開 HTTP 相依** (excerpt path only). Verify: unit test with stubbed store returns deterministic chunk body text.

## 4. Degradation and telemetry

- [x] 4.1 On chroma errors or zero hits, fall back to filesystem excerpts and emit stderr JSON with **`warning":"CORPUS_CHROMA_DEGRADED"`** per event, satisfying **`REQ-WCC-004 Chroma degradation surface`**. Analyzer substring:decision: 降級順序：**chroma 查詢失敗或集合空**時回退到 **僅基於 filesystem 的字典序 excerpt 策略**，並視需要於 stderr 發出單行 json 警告碼（與 `plan_below_min` 風格一致）. Verify: stubbed failure produces warning substring and compile still finishes when Ollama succeeds.

- [x] 4.2 Emit stdout JSON fields **`corpus_mode`** and **`corpus_digest_paths_in_prompt_count`** for normal and `--dry-run` runs per **`REQ-WCC-005 Telemetry fields on success summary`**. Verify: test parses final JSON line and asserts keys when corpus mode true.

## 5. Budget and frontmatter regressions

- [x] [P] 5.1 Enforce **`REQ-WI-030 Corpus mode respects page budget`**: slice planner paths before writes so count ≤ **`max_pages_per_run`** with truncated flag same as baseline. Verify: mock planner returns excess paths; count `writeFileSync` calls.

- [x] [P] 5.2 Guard **`REQ-WIKI-015 Corpus mode preserves mandatory frontmatter`** for corpus fixtures using existing **`validateCompiledFrontmatter`**. Verify: integration test parses emitted wiki files.

## 6. Documentation and integration

- [x] [P] 6.1 README operational guidance (offset rotation, cost). Cross-check against **`openspec/changes/expand-wiki-corpus-llm/specs/wiki-corpus-llm/spec.md`**. Verify: documentation review checklist.

- [x] [P] 6.2 If CLI argv stays unchanged versus Health GUI **`corpus-pipeline-runner`**, no spawn updates; otherwise update **`src/health-gui/corpus/corpus-pipeline-runner.js`** and **`test/health-gui/corpus-pipeline-runner.test.js`**. Verify: `pnpm test test/health-gui/corpus-pipeline-runner.test.js`.

## 7. Final verification

- [x] 7.1 Run full **`pnpm test`** (local-first, **`REQ-WCC-LOCAL Corpus LLM wiki local-first`** regression gate). Verify: exit code **0**.

- [x] [P] 7.2 After implementation branch lands, execute **`spectra validate expand-wiki-corpus-llm`** manually; ensures proposal traceability—not auto-run inside this artifact run. Checkbox completion deferred to apply/epic closeout.

## 8. Design decision trace references (coverage)

- [x] [P] 8.1 Traceability：`design.md` 與程式註記雙向覆核並保留 **Decision: `wiki_ingest.corpus_mode_enabled` 預設 true，對齊主題式個人知識庫之全筆記庫 LLM-wiki（ingest）**／**Decision: Planner 對 Ollama 仍只發 HTTP chat；對 Chroma 僅經 **本機 embed client**（制内模組呼叫），不把 Chroma 當對外公開 HTTP 相依**／其餘關鍵字已見 tasks 1.1、3.1、4.1 行末 `Analyzer substring`。Verify：`pnpm exec spectra analyze expand-wiki-corpus-llm` Consistency維Clean。
