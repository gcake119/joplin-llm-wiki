# Knowledge Capture External Skill Hook Notes

These hooks require explicit user approval before editing ignored generated
skill files or files outside `/Users/caiyijun/joplin-llm-wiki`.

## `spectra-archive` hook

Target file:

`.agents/skills/spectra-archive/SKILL.md`

File type: ignored repo-local generated skill

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

File type: ignored repo-local generated skill

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

`${HOME}/.agents/skills/how/SKILL.md`

File type: external user skill

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

`${HOME}/.codex/plugins/cache/openai-curated/superpowers/e2d08a2e/skills/brainstorming/SKILL.md`

File type: external plugin-cache skill

Plugin cache paths can vary by plugin version and should be confirmed before editing.

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
