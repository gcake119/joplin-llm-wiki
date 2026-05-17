#!/usr/bin/env bash
# run-ollama.sh — foreground Ollama server for LaunchAgent (logs via plist StandardOutPath/StandardErrorPath)
set -euo pipefail
# argv0 利於 Activity Monitor／ps 辨識（與 shims/joplin-brain-ollama-serve 語意一致）
exec -a "joplin-brain-ollama-serve" ollama serve
