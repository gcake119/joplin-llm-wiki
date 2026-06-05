# Knowledge Capture Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-controlled capture policy and skill hooks so high-value work can create pending capture drafts through the existing Joplin MCP flow without bypassing user confirmation.

**Architecture:** Keep MCP tools as the deterministic write layer. Add a thin `knowledge-capture-policy` skill that defines signal levels, capture templates, safety gates, and tool usage, then update repo-local skills to call that policy at their natural completion points. Installer and docs expose the new policy skill globally; external plugin skill edits remain an explicit approval step.

**Tech Stack:** Markdown skills under `.agents/skills/`, Bash installer, Vitest static verification, existing `joplin-llm-wiki` MCP tools.

---

## File Structure

- Create: `.agents/skills/knowledge-capture-policy/SKILL.md`
  - Owns reusable rules for strong, medium, and low capture signals.
  - Defines capture templates and confirmation boundaries.
  - Gives exact instructions for using `joplin_brainstorm`, `joplin_query`, and `joplin_confirm_capture`.
- Modify: `.agents/skills/joplin-knowledge-flow/SKILL.md`
  - Links the existing knowledge-flow entry skill to the capture policy.
  - Keeps MCP tools as the only write path.
- Modify: `scripts/install-mcp.sh`
  - Installs both `joplin-knowledge-flow` and `knowledge-capture-policy` into Codex and Cursor global skill directories.
- Modify: `README.md`
  - Documents the capture policy and first-version hook behavior.
- Create: `test/skill-knowledge-capture-policy.test.js`
  - Statically verifies policy content, the tracked Joplin hook, and tracked external hook notes.
- Create: `test/install-mcp-skills.test.js`
  - Statically verifies installer copies all required global skills.
- Create: `docs/superpowers/plans/2026-06-05-knowledge-capture-external-hooks.md`
  - Documents hook patches for ignored or external skills that require explicit user approval before editing:
    `.agents/skills/spectra-archive/SKILL.md`, `.agents/skills/spectra-debug/SKILL.md`,
    `/Users/caiyijun/.agents/skills/how/SKILL.md`, and
    `/Users/caiyijun/.codex/plugins/cache/openai-curated/superpowers/e2d08a2e/skills/brainstorming/SKILL.md`.

---

### Task 1: Add Static Tests For Capture Policy And Skill Hooks

**Files:**
- Create: `test/skill-knowledge-capture-policy.test.js`
- Test: `test/skill-knowledge-capture-policy.test.js`

- [ ] **Step 1: Write failing tests for the policy skill and repo-local hooks**

Create `test/skill-knowledge-capture-policy.test.js` with this full content:

```js
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("knowledge-capture-policy skill defines signal levels, templates, and gates", () => {
  const text = readRepoFile(".agents/skills/knowledge-capture-policy/SKILL.md");

  assert.match(text, /name: knowledge-capture-policy/);
  assert.match(text, /## Signal Levels/);
  assert.match(text, /### Strong Signal/);
  assert.match(text, /### Medium Signal/);
  assert.match(text, /### Low Signal/);
  assert.match(text, /## Pending Capture Template/);
  assert.match(text, /## Safety And Confirmation Gates/);
  assert.match(text, /joplin_brainstorm/);
  assert.match(text, /joplin_query/);
  assert.match(text, /joplin_confirm_capture/);
  assert.match(text, /capture_draft_id/);
  assert.match(text, /Do not call joplin_confirm_capture automatically/);
  assert.match(text, /Do not write files directly/);
});

test("joplin-knowledge-flow skill points other skills to the capture policy", () => {
  const text = readRepoFile(".agents/skills/joplin-knowledge-flow/SKILL.md");

  assert.match(text, /knowledge-capture-policy/);
  assert.match(text, /Capture Policy Integration/);
  assert.match(text, /strong signal/i);
  assert.match(text, /medium signal/i);
  assert.match(text, /MCP tools are not available/);
  assert.match(text, /Do not silently replace this workflow with ad hoc file writes/);
});

test("external hook notes describe untracked skill integration points", () => {
  const text = readRepoFile("docs/superpowers/plans/2026-06-05-knowledge-capture-external-hooks.md");

  assert.match(text, /These hooks require explicit user approval/);
  assert.match(text, /spectra-archive/);
  assert.match(text, /spectra-debug/);
  assert.match(text, /how/);
  assert.match(text, /superpowers:brainstorming/);
  assert.match(text, /joplin_brainstorm/);
  assert.match(text, /Do not call `joplin_confirm_capture` automatically/);
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
pnpm vitest run test/skill-knowledge-capture-policy.test.js
```

Expected: FAIL because `.agents/skills/knowledge-capture-policy/SKILL.md` and `docs/superpowers/plans/2026-06-05-knowledge-capture-external-hooks.md` do not exist yet, or because the tracked Joplin hook section is not present.

---

### Task 2: Create The Knowledge Capture Policy Skill

**Files:**
- Create: `.agents/skills/knowledge-capture-policy/SKILL.md`
- Test: `test/skill-knowledge-capture-policy.test.js`

- [ ] **Step 1: Create the policy skill**

Create `.agents/skills/knowledge-capture-policy/SKILL.md` with this full content:

````md
---
name: knowledge-capture-policy
description: Decide when high-value work should become a Joplin pending capture draft through joplin-llm-wiki MCP tools, without bypassing user confirmation.
license: MIT
metadata:
  author: project
  version: "1.0.0"
---

# Knowledge Capture Policy

Use this policy from other skills when a conversation, workflow, debug session,
archive, or architecture explanation has produced reusable knowledge. The goal
is to create useful pending capture drafts, not to write formal notes
automatically.

## Tool Boundary

- Use `joplin_brainstorm` when the output is an exploratory note, decision
  record, debugging lesson, archive summary, or architecture mental model.
- Use `joplin_query` when the output is grounded in an explicit knowledge-base
  question and should preserve query sources.
- Use `joplin_show_capture` only to inspect an existing pending capture.
- Use `joplin_confirm_capture` only after the user explicitly confirms that the
  pending capture should become a formal note.
- Do not call `joplin_confirm_capture` automatically.
- Do not write files directly under `brainstorming/`, `artifacts/`, `raw/`, or
  `wiki/` as a substitute for MCP tools.
- If MCP tools are not available, tell the user the MCP server is not loaded and
  ask them to restart or reload Codex or Cursor after checking MCP config.

## Signal Levels

### Strong Signal

Create a pending capture draft when the work has reached one of these outcomes:

- A Spectra archive completed and produced durable decisions, spec changes, or
  verification evidence.
- A debugging session verified a root cause and fix.
- An architecture explanation produced a reusable mental model.
- Brainstorming converged on a decision, rejected alternatives, or next steps.
- A handoff prompt or workflow rule can be reused in future sessions.

### Medium Signal

Ask the user whether to create a pending capture when:

- The discussion is valuable but still unresolved.
- The classification between `brainstorming` and `artifacts` is unclear.
- The content may contain sensitive context that the user should review first.
- A Spectra proposal or design already exists, but extra rationale may be worth
  saving separately.

### Low Signal

Do not prompt or create a capture for:

- Short command output.
- Simple factual answers.
- One-off code edits with no reusable reasoning.
- Early brainstorming that has not converged.
- Content whose value is already fully captured in an existing committed doc.

## Pending Capture Template

Use this structure in the `context` or prompt passed to `joplin_brainstorm` so
the pending capture is a reusable summary rather than a transcript:

```md
# <title>

## 背景

<repo, change, subsystem, bug, or discussion source>

## 核心結論

<accepted decision, explanation, or fix>

## 關鍵證據

<files, commands, tests, errors, observations, or archive paths>

## 可重用規則

<rules or heuristics to apply next time>

## 待追蹤

<unverified work, follow-up tasks, or open questions>
```

For debugging captures, include `症狀`, `真正原因`, and `修法`.
For archive captures, include `已完成`, `驗證`, and `spec 變更`.
For architecture captures, include `入口`, `資料流`, and `邊界`.
For brainstorming captures, include `採納方案`, `排除方案`, and `取捨理由`.

## Safety And Confirmation Gates

- Never save secrets, tokens, production admin details, customer data, or
  personal data unless the user explicitly asks to preserve that content.
- Redact sensitive identifiers before creating a pending capture.
- A pending capture is not a formal note.
- Show the resulting `capture_draft_id` and a short summary.
- Ask the user to confirm before calling `joplin_confirm_capture`.
- Artifact captures require a user-confirmed project name before formal archive.
````

- [ ] **Step 2: Run the policy test and verify remaining failures identify unhooked skills**

Run:

```bash
pnpm vitest run test/skill-knowledge-capture-policy.test.js
```

Expected: FAIL only on `joplin-knowledge-flow` and external hook notes assertions.

---

### Task 3: Connect Joplin Knowledge Flow To The Capture Policy

**Files:**
- Modify: `.agents/skills/joplin-knowledge-flow/SKILL.md`
- Test: `test/skill-knowledge-capture-policy.test.js`

- [ ] **Step 1: Add a policy integration section**

Insert this section after the `## Tool Preference` list in `.agents/skills/joplin-knowledge-flow/SKILL.md`:

```md
## Capture Policy Integration

When another skill has produced reusable knowledge, apply the
`knowledge-capture-policy` rules before deciding whether to call these MCP
tools. Strong signal work may create a pending capture draft with
`joplin_brainstorm` or `joplin_query`. Medium signal work should ask the user
whether they want a pending capture. Low signal work should not interrupt the
conversation.

If MCP tools are not available, report that the MCP server is not loaded and
ask the user to reload or restart Codex or Cursor after checking the MCP
configuration. Do not silently replace this workflow with ad hoc file writes.
```

- [ ] **Step 2: Run the policy test and verify Joplin hook passes**

Run:

```bash
pnpm vitest run test/skill-knowledge-capture-policy.test.js
```

Expected: FAIL only on external hook notes assertions.

---

### Task 4: Prepare External Skill Hook Notes

**Files:**
- Create: `docs/superpowers/plans/2026-06-05-knowledge-capture-external-hooks.md`
- Test: `test/skill-knowledge-capture-policy.test.js`

- [ ] **Step 1: Create explicit external hook instructions**

Create `docs/superpowers/plans/2026-06-05-knowledge-capture-external-hooks.md` with this full content:

````md
# Knowledge Capture External Skill Hook Notes

These hooks require explicit user approval before editing ignored generated
skill files or files outside `/Users/caiyijun/joplin-llm-wiki`.

## `spectra-archive` hook

Target file:

`.agents/skills/spectra-archive/SKILL.md`

This file is ignored by this repo and should not be force-added without an
explicit repository policy change.

Suggested section after the archive success output blocks and before
`**Guardrails**`:

```md
**Knowledge Capture Hook**

After displaying the archive completion summary, apply the
`knowledge-capture-policy` rules. A completed archive is a strong signal when it
contains reusable decisions, spec changes, validation evidence, or workflow
lessons.

If the `joplin-llm-wiki` MCP tools are available, call `joplin_brainstorm` to
create a pending capture draft. Use a concise topic such as
`Spectra archive: <change-name>`. Include this context:

- Change name.
- Schema name.
- Archive location.
- Spec sync status.
- Completed artifacts and tasks.
- Warnings, if any.
- Validation commands or evidence.
- Reusable decisions or workflow lessons.

After the tool returns, show the `capture_draft_id` and a short summary. Do not
call `joplin_confirm_capture` automatically.

If MCP tools are not available, say that the archive completed but automatic
knowledge capture was skipped because the MCP server is not loaded.
```

## `spectra-debug` hook

Target file:

`.agents/skills/spectra-debug/SKILL.md`

This file is ignored by this repo and should not be force-added without an
explicit repository policy change.

Suggested section after `Phase 4: Fix` and before `## Rationalization Table`:

```md
## Knowledge Capture Hook

After the fix is verified, apply the `knowledge-capture-policy` rules. A debug
session is a strong signal when it has a verified root cause and a passing test
or command that proves the fix.

If the `joplin-llm-wiki` MCP tools are available, call `joplin_brainstorm` to
create a pending capture draft. Use a concise topic such as
`Debug root cause: <symptom>`. Include this context:

- Symptom.
- Expected behavior.
- Actual behavior.
- Reproduction steps.
- Failed hypotheses or excluded causes.
- Verified root cause.
- Fix.
- Test or command evidence.
- Reusable debugging rule.

After the tool returns, show the `capture_draft_id` and a short summary. Do not
call `joplin_confirm_capture` automatically.

If MCP tools are not available, say that the fix was verified but automatic
knowledge capture was skipped because the MCP server is not loaded.
```

## `how` skill hook

Target file:

`/Users/caiyijun/.agents/skills/how/SKILL.md`

Suggested section after `### Step 4 — Present`:

```md
### Step 5 — Knowledge Capture

After presenting an architecture explanation, apply the
`knowledge-capture-policy` rules. If the explanation forms a reusable mental
model with clear entry points, data flow, boundaries, and gotchas, create a
pending capture draft with `joplin_brainstorm`.

Show the `capture_draft_id` and ask the user before calling
`joplin_confirm_capture`. Do not call `joplin_confirm_capture` automatically.
If MCP tools are not available, say that automatic knowledge capture was skipped
because the MCP server is not loaded.
```

## `superpowers:brainstorming` hook

Target file:

`/Users/caiyijun/.codex/plugins/cache/openai-curated/superpowers/e2d08a2e/skills/brainstorming/SKILL.md`

Suggested section after `Spec Self-Review`:

```md
**Knowledge Capture:**
After the user approves the written spec, apply the `knowledge-capture-policy`
rules. If the brainstorming produced durable decisions, rejected alternatives,
or reusable workflow rules, create a pending capture draft with
`joplin_brainstorm`.

Show the `capture_draft_id` and ask the user before calling
`joplin_confirm_capture`. Do not call `joplin_confirm_capture` automatically.
If MCP tools are not available, say that automatic knowledge capture was skipped
because the MCP server is not loaded.
```
````

- [ ] **Step 2: Run the policy test and verify it passes**

Run:

```bash
pnpm vitest run test/skill-knowledge-capture-policy.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit the policy, tracked Joplin hook, external notes, and tests**

Run:

```bash
git add .agents/skills/knowledge-capture-policy/SKILL.md .agents/skills/joplin-knowledge-flow/SKILL.md docs/superpowers/plans/2026-06-05-knowledge-capture-external-hooks.md test/skill-knowledge-capture-policy.test.js
git commit -m "加入知識沉澱草稿政策"
```

Expected: Commit succeeds with only the listed files.

---

### Task 5: Install The Policy Skill With The MCP Installer

**Files:**
- Create: `test/install-mcp-skills.test.js`
- Modify: `scripts/install-mcp.sh`

- [ ] **Step 1: Write failing installer tests**

Create `test/install-mcp-skills.test.js` with this full content:

```js
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const installer = fs.readFileSync(path.join(root, "scripts", "install-mcp.sh"), "utf8");

test("install-mcp installs all repo-provided global skills", () => {
  assert.match(installer, /GLOBAL_SKILLS=/);
  assert.match(installer, /joplin-knowledge-flow/);
  assert.match(installer, /knowledge-capture-policy/);
  assert.match(installer, /for skill in "\$\{GLOBAL_SKILLS\[@\]\}"/);
  assert.match(installer, /\$HOME\/\.agents\/skills\/\$skill/);
  assert.match(installer, /\$HOME\/\.cursor\/skills\/\$skill/);
});

test("install-mcp output lists the capture policy skill", () => {
  assert.match(installer, /knowledge-capture-policy\/SKILL\.md/);
});
```

- [ ] **Step 2: Run the installer tests and verify they fail**

Run:

```bash
pnpm vitest run test/install-mcp-skills.test.js
```

Expected: FAIL because `install-mcp.sh` only installs `joplin-knowledge-flow`.

- [ ] **Step 3: Update `install-mcp.sh` skill installation**

Replace the current `install_global_skill()` function with this implementation:

```bash
GLOBAL_SKILLS=(
  "joplin-knowledge-flow"
  "knowledge-capture-policy"
)

install_global_skill() {
  for skill in "${GLOBAL_SKILLS[@]}"; do
    local source_skill="$INSTALL_DIR/.agents/skills/$skill/SKILL.md"
    if [ ! -f "$source_skill" ]; then
      echo "Global skill source not found: $source_skill" >&2
      return 1
    fi

    local codex_skill="$HOME/.agents/skills/$skill"
    local cursor_skill="$HOME/.cursor/skills/$skill"

    mkdir -p "$codex_skill" "$cursor_skill"
    cp "$source_skill" "$codex_skill/SKILL.md"
    cp "$source_skill" "$cursor_skill/SKILL.md"

    echo "Installed global Codex skill: $codex_skill/SKILL.md"
    echo "Installed global Cursor skill: $cursor_skill/SKILL.md"
  done
}
```

Update the final output block so the `Installed global skill:` section lists:

```text
Installed global skill:
  $HOME/.agents/skills/joplin-knowledge-flow/SKILL.md
  $HOME/.cursor/skills/joplin-knowledge-flow/SKILL.md
  $HOME/.agents/skills/knowledge-capture-policy/SKILL.md
  $HOME/.cursor/skills/knowledge-capture-policy/SKILL.md
```

- [ ] **Step 4: Run the installer tests and verify they pass**

Run:

```bash
pnpm vitest run test/install-mcp-skills.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit installer support**

Run:

```bash
git add scripts/install-mcp.sh test/install-mcp-skills.test.js
git commit -m "安裝知識沉澱政策 skill"
```

Expected: Commit succeeds with only the listed files.

---

### Task 6: Document The Capture Automation Behavior

**Files:**
- Modify: `README.md`
- Test: `test/skill-knowledge-capture-policy.test.js`
- Test: `test/install-mcp-skills.test.js`

- [ ] **Step 1: Add README documentation**

Insert this section after the MCP tool table in `README.md`:

```md
### Skills 搭配知識沉澱

安裝 MCP server 時，installer 會同時安裝兩個全域 skills：

- `joplin-knowledge-flow`：知識流操作入口，負責把 LLM 導向 MCP tools。
- `knowledge-capture-policy`：判斷常用 skills 的工作成果是否值得建立 pending capture。

第一版採用「草稿型 + 規則型」：

- 強訊號工作，例如 Spectra archive 完成、debug root cause 驗證完成、架構 mental model 收斂，可由 skill 自動呼叫 `joplin_brainstorm` 建立 pending capture。
- 中訊號工作只提示是否沉澱。
- 低訊號工作不提示。
- 任何正式寫入都必須由使用者確認，才呼叫 `joplin_confirm_capture` 或 project archive confirmation。

這個流程不會自動寫入 `brainstorming/chat/`、`artifacts/<project>/`、
`raw/` 或 `wiki/`。如果 MCP server 沒有載入，skill 應提示重啟或重新載入
Codex/Cursor，而不是改用手寫檔案。
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm vitest run test/skill-knowledge-capture-policy.test.js test/install-mcp-skills.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit docs**

Run:

```bash
git add README.md
git commit -m "說明 skills 知識沉澱流程"
```

Expected: Commit succeeds with only `README.md`.

---

### Task 7: Run Full Verification

**Files:**
- Verify all files changed by Tasks 1 through 6.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run test/skill-knowledge-capture-policy.test.js test/install-mcp-skills.test.js
```

Expected: PASS.

- [ ] **Step 2: Run the repo test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Inspect final git status**

Run:

```bash
git status --short
```

Expected: no unstaged or untracked files after all task commits.

---

## Self-Review

- Spec coverage: The plan covers policy creation, Joplin guardrails, installer support, documentation, external hook notes, and verification. Ignored Spectra skill hooks and external `how`/Superpowers hooks are documented as explicit-approval patch notes instead of committed repo-local edits.
- Completeness scan: The plan contains no incomplete markers and every file addition includes concrete content.
- Type and name consistency: Tool names use existing MCP names: `joplin_brainstorm`, `joplin_query`, `joplin_show_capture`, and `joplin_confirm_capture`. The new skill name is consistently `knowledge-capture-policy`.
