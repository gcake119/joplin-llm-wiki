#!/usr/bin/env bash
# run-chroma.sh — Chroma persist server; WorkingDirectory in plist MUST be the repo root (see README).
set -euo pipefail
CHROMA_HOST="${CHROMA_HOST:-127.0.0.1}"
CHROMA_PORT="${CHROMA_PORT:-8000}"
# argv0 利於 Activity Monitor／ps 辨識（與 shims/joplin-llm-wiki-chroma-server 語意一致）
exec -a "joplin-llm-wiki-chroma-server" pnpm exec chroma run --path ./data/chroma --host "$CHROMA_HOST" --port "$CHROMA_PORT"
