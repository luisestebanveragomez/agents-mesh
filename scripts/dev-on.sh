#!/bin/sh
# Switch all agents to use the local dev source instead of the installed binary.
# Usage: bun run dev:on
set -e

BINARY=/usr/local/bin/agents-mesh
BACKUP=/usr/local/bin/agents-mesh.prod
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$BINARY" ]; then
  echo "Error: $BINARY not found"
  exit 1
fi

# Backup solo si no existe aún (preserva el binario prod real)
if [ ! -f "$BACKUP" ]; then
  cp "$BINARY" "$BACKUP"
fi

# Siempre sobreescribir el wrapper (permite re-correr después de fixes)
cat > "$BINARY" <<EOF
#!/bin/sh
exec bun "$REPO_DIR/src/cli/index.ts" "\$@"
EOF
chmod +x "$BINARY"

# Matar broker viejo para que el próximo comando lo levante desde source
BROKER_PID=$(lsof -ti :7899 2>/dev/null || true)
if [ -n "$BROKER_PID" ]; then
  kill "$BROKER_PID" 2>/dev/null || true
  echo "  → broker viejo (PID $BROKER_PID) terminado"
fi

echo "✓ Dev mode ON — $REPO_DIR/src/cli/index.ts"
echo "  Siguiente: agents-mesh dashboard"
echo "  Al terminar: bun run dev:off"
