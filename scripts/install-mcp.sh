#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${JOPLIN_LLM_WIKI_REPO_URL:-https://github.com/gcake119/joplin-llm-wiki.git}"
INSTALL_DIR="${JOPLIN_LLM_WIKI_INSTALL_DIR:-$HOME/.local/share/joplin-llm-wiki}"
CLIENT="none"

usage() {
  cat <<'EOF'
Install joplin-llm-wiki MCP server.

Usage:
  install-mcp.sh [--client none|cursor|codex|both] [INSTALL_DIR]

Environment:
  JOPLIN_LLM_WIKI_REPO_URL      Git repository URL
  JOPLIN_LLM_WIKI_INSTALL_DIR   Install directory

Examples:
  curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash
  curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client cursor
  curl -fsSL https://raw.githubusercontent.com/gcake119/joplin-llm-wiki/main/scripts/install-mcp.sh | bash -s -- --client both "$HOME/.local/share/joplin-llm-wiki"
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --client)
      CLIENT="${2:-}"
      shift 2
      ;;
    --client=*)
      CLIENT="${1#--client=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      INSTALL_DIR="$1"
      shift
      ;;
  esac
done

case "$CLIENT" in
  none|cursor|codex|both) ;;
  *)
    echo "Invalid --client value: $CLIENT" >&2
    usage >&2
    exit 2
    ;;
esac

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required." >&2
    exit 1
  fi
}

need_cmd git
need_cmd node
need_cmd pnpm

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required. Current: $(node -v)" >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "Cloning $REPO_URL to $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

echo "Installing dependencies"
pnpm --dir "$INSTALL_DIR" install

echo "Registering local bin shims"
node "$INSTALL_DIR/scripts/register-bin.mjs"

install_global_skill() {
  local source_skill="$INSTALL_DIR/.agents/skills/joplin-knowledge-flow/SKILL.md"
  if [ ! -f "$source_skill" ]; then
    echo "Global skill source not found: $source_skill" >&2
    return 1
  fi

  local codex_skill="$HOME/.agents/skills/joplin-knowledge-flow"
  local cursor_skill="$HOME/.cursor/skills/joplin-knowledge-flow"

  mkdir -p "$codex_skill" "$cursor_skill"
  cp "$source_skill" "$codex_skill/SKILL.md"
  cp "$source_skill" "$cursor_skill/SKILL.md"

  echo "Installed global Codex skill: $codex_skill/SKILL.md"
  echo "Installed global Cursor skill: $cursor_skill/SKILL.md"
}

install_global_skill

MCP_JSON="$(node -e '
const installDir = process.argv[1];
const cfg = {
  "joplin-llm-wiki": {
    type: "stdio",
    command: "pnpm",
    args: ["--dir", installDir, "exec", "joplin-llm-wiki-mcp"],
    cwd: installDir,
  },
};
process.stdout.write(JSON.stringify(cfg["joplin-llm-wiki"], null, 2));
' "$INSTALL_DIR")"

merge_cursor_json() {
  local file="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$file")"
  node -e '
const fs = require("fs");
const file = process.argv[1];
const installDir = process.argv[2];
let data = {};
if (fs.existsSync(file) && fs.readFileSync(file, "utf8").trim()) {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
}
data.mcpServers = data.mcpServers || {};
data.mcpServers["joplin-llm-wiki"] = {
  type: "stdio",
  command: "pnpm",
  args: ["--dir", installDir, "exec", "joplin-llm-wiki-mcp"],
  cwd: installDir,
};
if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
' "$file" "$INSTALL_DIR"
  echo "Updated Cursor MCP config: $file"
}

merge_codex_toml() {
  local file="$HOME/.codex/config.toml"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  cp "$file" "$file.bak-$(date +%s)"
  node -e '
const fs = require("fs");
const file = process.argv[1];
const installDir = process.argv[2];
let text = fs.readFileSync(file, "utf8");
text = text.replace(/\n?\[mcp_servers\."joplin-llm-wiki"\][\s\S]*?(?=\n\[|$)/g, "");
text = text.trimEnd() + `

[mcp_servers."joplin-llm-wiki"]
command = "pnpm"
args = ["--dir", "${installDir.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}", "exec", "joplin-llm-wiki-mcp"]
cwd = "${installDir.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"
startup_timeout_sec = 120
`;
fs.writeFileSync(file, text);
' "$file" "$INSTALL_DIR"
  echo "Updated Codex MCP config: $file"
}

case "$CLIENT" in
  cursor)
    merge_cursor_json
    ;;
  codex)
    merge_codex_toml
    ;;
  both)
    merge_cursor_json
    merge_codex_toml
    ;;
esac

cat <<EOF

Installed joplin-llm-wiki MCP server at:
  $INSTALL_DIR

Installed global skill:
  $HOME/.agents/skills/joplin-knowledge-flow/SKILL.md
  $HOME/.cursor/skills/joplin-knowledge-flow/SKILL.md

MCP server command:
  pnpm --dir "$INSTALL_DIR" exec joplin-llm-wiki-mcp

MCP config entry:
{
  "mcpServers": {
    "joplin-llm-wiki": $MCP_JSON
  }
}

Reload or restart Codex/Cursor after changing MCP configuration.
EOF
