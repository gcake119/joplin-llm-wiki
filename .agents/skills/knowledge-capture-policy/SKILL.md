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
- Do not call joplin_confirm_capture automatically.
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
- Use `joplin_suggest_archive_project` before formal project artifact archival.
- Use `joplin_archive_project` only after the user confirms the exact project name.
- Do not call `joplin_archive_project` automatically.
