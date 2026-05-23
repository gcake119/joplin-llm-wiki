---
name: joplin-knowledge-flow
description: Use the joplin-llm-wiki MCP tools for local knowledge-base query, brainstorming, pending capture confirmation, project artifact archiving, source sync, and wiki compilation. Trigger when the user asks to query notes, brainstorm from the Joplin wiki/raw corpus, confirm a capture, archive project work into artifacts/<project>, sync Joplin sources, or compile the wiki.
license: MIT
metadata:
  author: project
  version: "1.0.0"
---

# Joplin Knowledge Flow

Use the `joplin-llm-wiki` MCP tools as the primary interface for knowledge-flow
operations in Codex or Cursor conversations.

## Tool Preference

- Use `joplin_query` for questions over the local `wiki/` and `raw/` corpus.
- Use `joplin_brainstorm` for exploratory thinking that should become a
  brainstorming pending capture.
- Use `joplin_show_capture` to inspect a pending capture without changing files.
- Use `joplin_confirm_capture` to turn a pending capture into a formal note under
  `brainstorming/chat/` or `artifacts/<project>/`.
- Use `joplin_suggest_archive_project` before project artifact archival.
- Use `joplin_archive_project` only after the user confirms the project name.
- Use `joplin_sync_sources` for existing `sqlite-sync` modes.
- Use `joplin_compile_wiki` for existing `wiki-compile` or `agent-compile`
  flows.

If these MCP tools are not available in the current session, tell the user the
MCP server is not loaded and ask them to reload/restart Codex or Cursor after
checking the MCP configuration. Do not silently replace this workflow with ad
hoc file writes.

## Query And Capture

Queries should preserve the pending capture workflow:

1. Answer with `joplin_query` or `joplin_brainstorm`.
2. If the result includes `capture_draft_id`, show the id and ask whether to
   confirm it when the user wants a formal note.
3. Confirm only through `joplin_confirm_capture`.

Formal notes are written only after confirmation. Brainstorming captures go to
`brainstorming/chat/`. Artifact captures require a project name and go to
`artifacts/<project>/`.

## Project Archive

Project archive is always a two-step workflow:

1. Call `joplin_suggest_archive_project` with title/content/context and present
   the suggested project names.
2. Ask the user to confirm the project name.
3. Call `joplin_archive_project` with `confirmed_project: true` only after the
   user confirms the exact project name.

Never archive new project artifacts under `artifacts/projects/<project>/`.
The correct path is `artifacts/<project>/<timestamp>-<slug>.md`.

## Local-First Boundary

These tools are local-first. They use repo files, local Ollama when configured,
local `codex exec` for agent compilation, and loopback Joplin Data API for
explicit writeback. Tool output must not expose Joplin tokens.
