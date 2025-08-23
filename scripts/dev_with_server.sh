#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PORT="${PORT:-8787}"
CSV_FILE="${CSV_FILE:-$SCRIPT_DIR/../submissions.csv}"

echo "Starting Bun HTTP server on :$PORT (CSV -> $CSV_FILE)"
(
  cd "$SCRIPT_DIR"
  PORT="$PORT" CSV_FILE="$CSV_FILE" bun run http_server.ts
) &
SERVER_PID=$!

cleanup() {
  echo "\nShutting down..."
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting Vite dev server with bun..."
(
  cd "$SCRIPT_DIR/.."
  bun run dev
)


