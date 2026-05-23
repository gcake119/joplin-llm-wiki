#!/usr/bin/env bash
# run-sqlite-sync.sh — run sqlite-sync with compile-mode-aware readiness checks.
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

CFG="${JOPLIN_BRAIN_CONFIG:-${JOPLIN_LLMWIKI_CONFIG:-${1:-}}}"
if [[ -z "${CFG}" ]]; then
  echo "run-sqlite-sync.sh: set JOPLIN_BRAIN_CONFIG or JOPLIN_LLMWIKI_CONFIG or pass config path as argv1" >&2
  exit 1
fi

OLLAMA_BASE="${MLS_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
WAIT_TIMEOUT="${MLS_WAIT_TIMEOUT_SEC:-120}"
WAIT_INTERVAL="${MLS_WAIT_INTERVAL_SEC:-2}"

COMPILE_MODE="$(
  node --input-type=module -e 'import { loadConfig } from "./src/config/load-config.js"; const cfg = await loadConfig(process.argv[1]); console.log(cfg.joplin_sqlite_sync.pipeline.compile_mode);' "$CFG"
)"

if [[ "${COMPILE_MODE}" == "local" ]]; then
  started="$(date +%s)"
  while true; do
    now="$(date +%s)"
    if (( now - started >= WAIT_TIMEOUT )); then
      echo "run-sqlite-sync.sh: readiness timeout waiting for Ollama (${OLLAMA_BASE})" >&2
      exit 1
    fi
    if curl -sf -o /dev/null "${OLLAMA_BASE}/api/tags"; then
      break
    fi
    sleep "$WAIT_INTERVAL"
  done
elif [[ "${COMPILE_MODE}" != "agent" && "${COMPILE_MODE}" != "off" ]]; then
  echo "run-sqlite-sync.sh: unsupported compile_mode: ${COMPILE_MODE}" >&2
  exit 1
fi

# argv0 利於 Activity Monitor／ps 辨識（與 shims/joplin-llm-wiki-sqlite-sync 語意一致）
exec -a "joplin-llm-wiki-sqlite-sync" pnpm exec joplin-llm-wiki sqlite-sync --config "$CFG"
