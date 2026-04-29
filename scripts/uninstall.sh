#!/usr/bin/env bash
set -e

INSTALL_DIR="${HOME}/.claude-peers"
DATA_DIR="${HOME}/.claude-peers-data"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔═══════════════════════════════════╗"
echo "║  Claude Peers Uninstaller         ║"
echo "╚═══════════════════════════════════╝"
echo ""

read -rp "¿Desinstalar claude-peers? [y/N]: " confirm
[ "$confirm" = "y" ] || { echo "Cancelado."; exit 0; }

echo ""

echo -e "[1/4] Terminando procesos activos..."
pkill -f "claude-peers" 2>/dev/null || true
pkill -f "src/mcp/server.ts" 2>/dev/null || true
echo -e "  ${GREEN}✅${NC} Procesos terminados"

echo -e "[2/4] Removiendo MCP server..."
claude mcp remove claude-peers 2>/dev/null && echo -e "  ${GREEN}✅${NC} MCP removido" || echo -e "  (ya estaba removido)"

echo -e "[3/4] Eliminando archivos de código..."
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo -e "  ${GREEN}✅${NC} ${INSTALL_DIR} eliminado"
else
  echo -e "  (no existía)"
fi

echo -e "[4/4] Datos de runtime..."
read -rp "¿Eliminar historial y datos (~/.claude-peers-data)? [y/N]: " del_data
if [ "$del_data" = "y" ]; then
  rm -rf "$DATA_DIR"
  echo -e "  ${GREEN}✅${NC} Datos eliminados"
else
  echo -e "  ${YELLOW}⏭️${NC}  Datos preservados en ${DATA_DIR}"
fi

echo ""
echo "╔═══════════════════════════════════╗"
echo "║  ✅ Desinstalación completa       ║"
echo "╚═══════════════════════════════════╝"
echo ""
echo "Sistema restaurado al estado anterior."
echo ""
echo "Limpieza manual si algo quedó:"
echo "  pkill -f claude-peers"
echo "  claude mcp remove claude-peers"
echo "  rm -rf ~/.claude-peers ~/.claude-peers-data"
echo ""
