#!/usr/bin/env bash
# run-sqlite-sync.sh — wait for Ollama + Chroma HTTP, then run sqlite-sync (see docs/macos-launchd-stack.md).
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-}"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "run-sqlite-sync.sh: REPO_ROOT is required" >&2
  exit 1
fi
cd "$REPO_ROOT" || exit 1
if [[ -f .env.launchd ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env.launchd
  set +a
fi

JOPLIN_BRAIN_CONFIG="${JOPLIN_BRAIN_CONFIG:-${1:-}}"
if [[ -z "${JOPLIN_BRAIN_CONFIG}" ]]; then
  echo "run-sqlite-sync.sh: set JOPLIN_BRAIN_CONFIG or pass config path as argv1" >&2
  exit 1
fi

OLLAMA_BASE="${MLS_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
CHROMA_BASE="${MLS_CHROMA_URL:-http://127.0.0.1:8000}"
WAIT_TIMEOUT="${MLS_WAIT_TIMEOUT_SEC:-120}"
WAIT_INTERVAL="${MLS_WAIT_INTERVAL_SEC:-2}"

chroma_ready() {
  if curl -sf -o /dev/null "${CHROMA_BASE}/api/v2/heartbeat"; then
    return 0
  fi
  if curl -sf -o /dev/null "${CHROMA_BASE}/api/v1/heartbeat"; then
    return 0
  fi
  return 1
}

started="$(date +%s)"
while true; do
  now="$(date +%s)"
  if (( now - started >= WAIT_TIMEOUT )); then
    echo "run-sqlite-sync.sh: readiness timeout waiting for Ollama (${OLLAMA_BASE}) and Chroma (${CHROMA_BASE})" >&2
    exit 1
  fi
  if curl -sf -o /dev/null "${OLLAMA_BASE}/api/tags" && chroma_ready; then
    break
  fi
  sleep "$WAIT_INTERVAL"
done

# argv0 利於 Activity Monitor／ps 辨識（與 shims/joplin-brain-sqlite-sync 語意一致）
exec -a "joplin-brain-sqlite-sync" pnpm exec joplin-brain sqlite-sync --config "$JOPLIN_BRAIN_CONFIG"
