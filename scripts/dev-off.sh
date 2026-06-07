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

# Matar broker dev antes de restaurar
BROKER_PID=$(lsof -ti :7899 2>/dev/null || true)
if [ -n "$BROKER_PID" ]; then
  kill "$BROKER_PID" 2>/dev/null || true
  echo "  → broker dev (PID $BROKER_PID) terminado"
fi

cp "$BACKUP" "$BINARY"
rm "$BACKUP"

echo "✓ Dev mode OFF — binario prod restaurado"
echo "  Reiniciá los agentes para que usen la versión oficial"
