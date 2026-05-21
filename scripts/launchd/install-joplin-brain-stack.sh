#!/usr/bin/env bash
# install-joplin-brain-stack.sh — install LaunchAgents (Ollama, sqlite-sync)
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-${1:-}}"
CONFIG_ABS="${JOPLIN_LLMWIKI_CONFIG:-${JOPLIN_BRAIN_CONFIG:-${2:-}}}"

if [[ -z "${REPO_ROOT}" || -z "${CONFIG_ABS}" ]]; then
  echo "Usage: REPO_ROOT=<abs-repo> JOPLIN_LLMWIKI_CONFIG=<abs-config.yaml> $0" >&2
  echo "   or: REPO_ROOT=<abs-repo> JOPLIN_BRAIN_CONFIG=<abs-config.yaml> $0" >&2
  echo "   or: $0 <abs-repo> <abs-config.yaml>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
if [[ ! -f "$CONFIG_ABS" ]]; then
  echo "install-joplin-brain-stack.sh: config file not found: ${CONFIG_ABS}" >&2
  exit 1
fi
CONFIG_ABS="$(cd "$(dirname "$CONFIG_ABS")" && pwd)/$(basename "$CONFIG_ABS")"

SCRIPT_DIR="${REPO_ROOT}/scripts/launchd"
chmod +x "${SCRIPT_DIR}"/*.sh "${SCRIPT_DIR}/shims"/joplin-llm-wiki-*
DEST="${HOME}/Library/LaunchAgents"
LOGDIR="${HOME}/Library/Logs/joplin-llm-wiki"
mkdir -p "$DEST" "$LOGDIR"

for name in com.joplin-brain.ollama com.joplin-brain.sqlite-sync; do
  src="${SCRIPT_DIR}/${name}.plist.example"
  if [[ ! -f "$src" ]]; then
    echo "install-joplin-brain-stack.sh: missing ${src}" >&2
    exit 1
  fi
  sed -e "s|__REPO_ROOT__|${REPO_ROOT}|g" \
      -e "s|__CONFIG_ABS__|${CONFIG_ABS}|g" \
      -e "s|__HOME__|${HOME}|g" \
      "$src" > "${DEST}/${name}.plist"
done

for p in "${DEST}/com.joplin-brain.ollama.plist" "${DEST}/com.joplin-brain.sqlite-sync.plist"; do
  plutil -lint "$p" >/dev/null
done

uid="$(id -u)"
for name in com.joplin-brain.ollama com.joplin-brain.chroma com.joplin-brain.sqlite-sync; do
  launchctl bootout "gui/${uid}/${name}" 2>/dev/null || true
done
rm -f "${DEST}/com.joplin-brain.chroma.plist"
for name in com.joplin-brain.ollama com.joplin-brain.sqlite-sync; do
  launchctl bootstrap "gui/${uid}" "${DEST}/${name}.plist"
done

echo "install-joplin-brain-stack.sh: installed. Verify with: launchctl print gui/${uid}  (look for com.joplin-brain.* labels)"
