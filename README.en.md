# joplin-llm-wiki

[繁體中文 README](README.md)

joplin-llm-wiki is a local-first knowledge workflow for Joplin. It exports
notes from Joplin Desktop SQLite into `raw/`, compiles local Markdown knowledge
into `wiki/`, writes compiled wiki pages back to Joplin under `@llm-wiki`, and
provides query/capture workflows for turning useful conversations into durable
notes.

The project currently does not use RAG, embeddings, Chroma, or a hosted vector
database. The default runtime is local: Ollama for local compilation/query work,
or a locally authenticated Codex CLI for agent-based wiki compilation.

## Language Default

The bundled workflow prompts and skills default to Traditional Chinese output
because this repository was built for a Traditional Chinese Joplin knowledge
base. You can change those prompts and skill instructions to your preferred
language when adapting the system for your own notes.

## Knowledge Flow

| Layer | Path | Purpose |
| --- | --- | --- |
| Raw library | `raw/` | Source evidence exported from Joplin SQLite. Usually treated as read-only. |
| Wiki | `wiki/summaries/*.md` | One summary per source note. |
| Wiki | `wiki/concepts/*.md` | Canonical concept notes linked to summaries and other concepts. |
| Wiki | `wiki/indexes/All-Sources.md`, `wiki/indexes/All-Concepts.md` | Stable wiki entry points. |
| Brainstorming | `brainstorming/chat/`, `brainstorming/health/` | Confirmed exploratory Q&A and health reports. |
| Artifacts | `artifacts/` | Finished work products, grouped by project. |

Loop:

1. Export Joplin notes into `raw/`.
2. Compile `raw/` into `wiki/summaries/` and wiki indexes.
3. Build canonical concepts under `wiki/concepts/`.
4. Write completed wiki Markdown back to Joplin under `@llm-wiki`.
5. Query `wiki/` first, with optional `raw/` evidence.
6. Save useful Q&A through pending captures, then confirm them into
   `brainstorming/chat/` or `artifacts/<project>/`.

## Codex / Cursor MCP

This repo includes a local MCP server for Codex, Cursor, or any MCP client. The
server communicates through stdio, wraps the existing local CLI/service
behavior, does not open a public HTTP listener, and preserves the `raw/`,
`wiki/`, `brainstorming/`, and `artifacts/` boundaries.

The conversation design is:

- one `joplin-knowledge-flow` skill acts as the workflow entry point;
- the conversation LLM decides which knowledge-flow stage the user is asking
  for;
- MCP tools perform the deterministic actions.

Common intent-to-tool mapping:

| Intent | Tool |
| --- | --- |
| Query the local knowledge base | `joplin_query` |
| Brainstorm from local knowledge | `joplin_brainstorm` |
| Show a pending capture | `joplin_show_capture` |
| Confirm a query/brainstorm result | `joplin_confirm_capture` |
| Suggest a project name before archiving | `joplin_suggest_archive_project` |
| Archive after the user confirms the project name | `joplin_archive_project` |
| Sync Joplin sources | `joplin_sync_sources` |
| Compile the wiki | `joplin_compile_wiki` |

## Quick MCP Install

The curl installer is the fastest way to install the MCP server. It clones this
repo to your machine, installs dependencies, registers the
`joplin-llm-wiki-mcp` shim, and can optionally update Codex/Cursor MCP config.
You do not need to clone the project manually first.

Prerequisites:

- `git`
- Node.js 20+
- `pnpm`

Install the MCP server and print the config snippet:

```bash
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash
```

Install and update Cursor or Codex MCP config:

```bash
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client cursor
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client codex
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client both
```

The default install path is `$HOME/.local/share/joplin-llm-wiki`. To choose a
path:

```bash
curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client both "$HOME/.local/share/joplin-llm-wiki"
```

After installation, prepare `config.yaml` in the install directory and configure
the required local settings for your Joplin setup: Joplin SQLite, `raw`, `wiki`,
Ollama, and Joplin Data API / Web Clipper token.

Minimal startup:

```bash
cd "$HOME/.local/share/joplin-llm-wiki"
cp config.yaml.example config.yaml
$EDITOR config.yaml
pnpm exec joplin-llm-wiki lint --config ./config.yaml
```

Restart Codex/Cursor, or run Reload Window in Cursor, after changing MCP config.

## CLI

```bash
pnpm exec joplin-llm-wiki sqlite-sync --config ./config.yaml --export-only
pnpm exec joplin-llm-wiki sqlite-sync --config ./config.yaml --snapshot-only
pnpm exec joplin-llm-wiki wiki-compile --config ./config.yaml
pnpm exec joplin-llm-wiki agent-compile --config ./config.yaml
pnpm exec joplin-llm-wiki query --config ./config.yaml "your question"
pnpm exec joplin-llm-wiki query --config ./config.yaml --confirm-capture "<id>"
pnpm exec joplin-llm-wiki lint --config ./config.yaml
```

See the Traditional Chinese README and `docs/` for the full operating notes.
