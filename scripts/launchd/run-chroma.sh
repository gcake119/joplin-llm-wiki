#!/usr/bin/env bash
# run-chroma.sh — Chroma persist server; WorkingDirectory in plist MUST be the repo root (see README).
set -euo pipefail
CHROMA_HOST="${CHROMA_HOST:-127.0.0.1}"
CHROMA_PORT="${CHROMA_PORT:-8000}"
exec pnpm exec chroma run --path ./data/chroma --host "$CHROMA_HOST" --port "$CHROMA_PORT"
