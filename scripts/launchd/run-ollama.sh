#!/usr/bin/env bash
# run-ollama.sh — foreground Ollama server for LaunchAgent (logs via plist StandardOutPath/StandardErrorPath)
set -euo pipefail
exec ollama serve
