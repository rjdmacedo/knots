#!/usr/bin/env bash
# Manage Prisma Studio in Docker (production VM or local compose stack).
#
# Usage:
#   ./scripts/prisma-studio.sh start
#   ./scripts/prisma-studio.sh stop
#   ./scripts/prisma-studio.sh restart
#   ./scripts/prisma-studio.sh status
#   ./scripts/prisma-studio.sh logs
#
# Environment (optional):
#   KNOTS_COMPOSE_DIR      — directory with compose files (default: repo root)
#   KNOTS_COMPOSE_FILE     — main compose file (default: auto-detect)
#   KNOTS_ENV_FILE         — env file (default: container.env, then .env)
#   KNOTS_DOCKER_NETWORK   — Docker network (default: knots-net)
#   KNOTS_STUDIO_PORT      — host port (default: 5555)
#   KNOTS_STUDIO_URL       — URL shown after start

set -euo pipefail

readonly TOOLS_COMPOSE="compose.tools.yaml"
readonly SERVICE="prisma-studio"
readonly PROFILE="tools"
readonly STUDIO_PORT="${KNOTS_STUDIO_PORT:-5555}"
readonly STUDIO_URL="${KNOTS_STUDIO_URL:-https://studio.knots.mais-cedo.net}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="${KNOTS_COMPOSE_DIR:-$ROOT_DIR}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  start    Start Prisma Studio (detached)
  stop     Stop Prisma Studio
  restart  Stop then start
  status   Show container state and HTTP check on port ${STUDIO_PORT}
  logs     Follow container logs (Ctrl+C to exit)

Studio UI (via Caddy + Twingate): ${STUDIO_URL}
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

resolve_env_file() {
  if [[ -n "${KNOTS_ENV_FILE:-}" ]]; then
    [[ -f "$COMPOSE_DIR/$KNOTS_ENV_FILE" ]] || die "KNOTS_ENV_FILE not found: $COMPOSE_DIR/$KNOTS_ENV_FILE"
    echo "$COMPOSE_DIR/$KNOTS_ENV_FILE"
    return
  fi
  if [[ -f "$COMPOSE_DIR/container.env" ]]; then
    echo "$COMPOSE_DIR/container.env"
    return
  fi
  if [[ -f "$COMPOSE_DIR/.env" ]]; then
    echo "$COMPOSE_DIR/.env"
    return
  fi
  die "no env file found (set KNOTS_ENV_FILE or add container.env / .env in $COMPOSE_DIR)"
}

resolve_main_compose() {
  if [[ -n "${KNOTS_COMPOSE_FILE:-}" ]]; then
    [[ -f "$COMPOSE_DIR/$KNOTS_COMPOSE_FILE" ]] || die "KNOTS_COMPOSE_FILE not found: $COMPOSE_DIR/$KNOTS_COMPOSE_FILE"
    echo "$COMPOSE_DIR/$KNOTS_COMPOSE_FILE"
    return
  fi
  for candidate in docker-compose.yml compose.ghcr.yaml compose.yaml; do
    if [[ -f "$COMPOSE_DIR/$candidate" ]]; then
      echo "$COMPOSE_DIR/$candidate"
      return
    fi
  done
  die "no compose file found in $COMPOSE_DIR (set KNOTS_COMPOSE_FILE)"
}

resolve_tools_compose() {
  local path="$COMPOSE_DIR/$TOOLS_COMPOSE"
  [[ -f "$path" ]] || die "$TOOLS_COMPOSE not found in $COMPOSE_DIR"
  echo "$path"
}

compose_cmd() {
  docker compose \
    -f "$(resolve_main_compose)" \
    -f "$(resolve_tools_compose)" \
    --env-file "$(resolve_env_file)" \
    --profile "$PROFILE" \
    "$@"
}

warn_database_url() {
  local env_file
  env_file="$(resolve_env_file)"
  if grep -qE 'POSTGRES_(PRISMA_URL|URL_NON_POOLING)=.*@(localhost|127\.0\.0\.1)' "$env_file" 2>/dev/null; then
    echo "warning: POSTGRES_* URLs use localhost — use host \"db\" inside Docker" >&2
  fi
}

cmd_start() {
  warn_database_url
  compose_cmd up -d --force-recreate "$SERVICE"
  echo ""
  echo "Prisma Studio started."
  echo "  Local:  http://127.0.0.1:${STUDIO_PORT}"
  echo "  Remote: ${STUDIO_URL} (Twingate + Caddy)"
  echo ""
  compose_cmd ps "$SERVICE"
}

cmd_stop() {
  compose_cmd stop "$SERVICE"
  echo "Prisma Studio stopped."
}

cmd_restart() {
  cmd_stop || true
  cmd_start
}

cmd_status() {
  compose_cmd ps "$SERVICE" || true
  echo ""
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:${STUDIO_PORT}/"; then
    echo "HTTP check: OK (http://127.0.0.1:${STUDIO_PORT})"
  else
    echo "HTTP check: not reachable on port ${STUDIO_PORT} (is the container running?)"
    exit 1
  fi
}

cmd_logs() {
  compose_cmd logs -f "$SERVICE"
}

main() {
  local command="${1:-}"
  [[ -n "$command" ]] || {
    usage
    exit 1
  }

  case "$command" in
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    -h | --help | help) usage ;;
    *)
      usage
      die "unknown command: $command"
      ;;
  esac
}

main "$@"
