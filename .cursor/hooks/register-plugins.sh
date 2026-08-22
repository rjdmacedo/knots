#!/usr/bin/env bash
# Load repo-vendored Cursor plugins for this workspace.
set -euo pipefail

ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
printf '{"pluginPaths":["%s/.cursor/plugins/ralph-loop"]}\n' "$ROOT"
