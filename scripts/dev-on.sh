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

# Back up only if the backup doesn't exist yet (preserves the real prod binary)
if [ ! -f "$BACKUP" ]; then
  cp "$BINARY" "$BACKUP"
fi

# Always overwrite the wrapper (allows re-running after fixes)
cat > "$BINARY" <<EOF
#!/bin/sh
exec bun "$REPO_DIR/src/cli/index.ts" "\$@"
EOF
chmod +x "$BINARY"

# Kill old broker so the next command starts it fresh from source
BROKER_PID=$(lsof -ti :7899 2>/dev/null || true)
if [ -n "$BROKER_PID" ]; then
  kill "$BROKER_PID" 2>/dev/null || true
  echo "  → old broker (PID $BROKER_PID) stopped"
fi

echo "✓ Dev mode ON — $REPO_DIR/src/cli/index.ts"
echo "  Next: agents-mesh dashboard"
echo "  When done: bun run dev:off"
