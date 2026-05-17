#!/usr/bin/env bash
# uninstall-joplin-brain-stack.sh — bootout and remove the three joplin-brain LaunchAgents
set -euo pipefail

uid="$(id -u)"
DEST="${HOME}/Library/LaunchAgents"

for name in com.joplin-brain.sqlite-sync com.joplin-brain.chroma com.joplin-brain.ollama; do
  launchctl bootout "gui/${uid}/${name}" 2>/dev/null || true
  rm -f "${DEST}/${name}.plist"
done

echo "uninstall-joplin-brain-stack.sh: removed LaunchAgents (Joplin app data under ~/.config is untouched)."
