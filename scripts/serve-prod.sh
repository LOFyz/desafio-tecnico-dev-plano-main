#!/usr/bin/env bash
# Build all four apps in production mode and run them in the background.
# Order: users-subgraph (3001) → gateway (3000) → mcp-server (4000) → web (4200).
# The gateway must be up before the mcp-server runs its startup probe; the web
# app calls the mcp-server during /api/blog-copilot/run, so it goes last.

set -euo pipefail

# Resolve workspace root (parent of scripts/).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/.logs"
PID_DIR="$ROOT_DIR/.run"
mkdir -p "$LOG_DIR" "$PID_DIR"

PORTS=(3000 3001 4000 4200)

log()  { printf '\033[1;34m[serve-prod]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[serve-prod]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[serve-prod]\033[0m %s\n' "$*" >&2; exit 1; }

kill_port() {
  local port="$1"
  local pids
  pids=$(ss -tlnpH "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  if [[ -n "$pids" ]]; then
    log "Port $port: killing pids $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  else
    log "Port $port: free"
  fi
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local timeout="${3:-60}"
  local elapsed=0
  while ! ss -tlnH "sport = :$port" 2>/dev/null | grep -q .; do
    sleep 1
    elapsed=$((elapsed + 1))
    if (( elapsed >= timeout )); then
      fail "$name did not bind to port $port within ${timeout}s — see $LOG_DIR/${name}.log"
    fi
  done
  log "$name is listening on port $port (took ${elapsed}s)"
}

start_node_app() {
  local name="$1"
  local port="$2"
  local entry="$3"
  local log_file="$LOG_DIR/${name}.log"
  local pid_file="$PID_DIR/${name}.pid"

  log "Starting $name on port $port → $log_file"
  PORT="$port" nohup node --env-file=.env "$entry" >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"
  wait_for_port "$port" "$name" 60
}

start_web() {
  local port="$1"
  local log_file="$LOG_DIR/web.log"
  local pid_file="$PID_DIR/web.pid"

  log "Starting web on port $port → $log_file"
  (
    cd apps/web
    PORT="$port" nohup pnpm exec next start >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
  wait_for_port "$port" "web" 30
}

# 1. Free ports.
log "Freeing ports: ${PORTS[*]}"
for p in "${PORTS[@]}"; do kill_port "$p"; done

# 2. Build all four (production is the default for subgraph builds; next build is always production).
log "Building gateway, users-subgraph, mcp-server, web"
pnpm nx run-many -t build -p gateway users-subgraph mcp-server web

# 3. Start in dependency order.
start_node_app users-subgraph 3001 apps/users-subgraph/dist/main.js
start_node_app gateway        3000 apps/gateway/dist/main.js
start_node_app mcp-server     4000 apps/mcp-server/dist/main.js
start_web 4200

log "All four apps are up:"
log "  gateway        → http://localhost:3000/graphql  (pid $(cat "$PID_DIR/gateway.pid"))"
log "  users-subgraph → http://localhost:3001/graphql  (pid $(cat "$PID_DIR/users-subgraph.pid"))"
log "  mcp-server     → http://localhost:4000/mcp      (pid $(cat "$PID_DIR/mcp-server.pid"))"
log "  web            → http://localhost:4200          (pid $(cat "$PID_DIR/web.pid"))"
log "Logs: $LOG_DIR/{users-subgraph,gateway,mcp-server,web}.log"
log "Stop with: kill \$(cat $PID_DIR/*.pid)  (or re-run this script — it kills the ports first)"
