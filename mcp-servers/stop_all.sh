#!/usr/bin/env bash
# Stop all PAF agent MCP servers started by start_all.sh.
cd "$(dirname "$0")"
for pidfile in logs/*.pid; do
  [ -f "$pidfile" ] || continue
  pid=$(cat "$pidfile")
  if kill "$pid" 2>/dev/null; then
    echo "Stopped $(basename "$pidfile" .pid) (pid $pid)"
  fi
  rm -f "$pidfile"
done
