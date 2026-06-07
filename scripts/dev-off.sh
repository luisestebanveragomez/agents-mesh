#!/bin/sh
# Restore the installed binary after dev testing.
# Usage: bun run dev:off
set -e

BINARY=/usr/local/bin/agents-mesh
BACKUP=/usr/local/bin/agents-mesh.prod

if [ ! -f "$BACKUP" ]; then
  echo "Dev mode not active (no backup found at $BACKUP)"
  exit 0
fi

# Kill dev broker before restoring
BROKER_PID=$(lsof -ti :7899 2>/dev/null || true)
if [ -n "$BROKER_PID" ]; then
  kill "$BROKER_PID" 2>/dev/null || true
  echo "  → dev broker (PID $BROKER_PID) stopped"
fi

cp "$BACKUP" "$BINARY"
rm "$BACKUP"

echo "✓ Dev mode OFF — prod binary restored"
echo "  Restart your agents to pick up the official version"
