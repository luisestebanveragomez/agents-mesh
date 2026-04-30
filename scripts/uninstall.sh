#!/usr/bin/env bash
set -e

INSTALL_DIR="${HOME}/.agents-mesh"
DATA_DIR="${HOME}/.agents-mesh-data"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔═══════════════════════════════════╗"
echo "║  Claude Peers Uninstaller         ║"
echo "╚═══════════════════════════════════╝"
echo ""

read -rp "¿Desinstalar agents-mesh? [y/N]: " confirm
[ "$confirm" = "y" ] || { echo "Cancelado."; exit 0; }

echo ""

echo -e "[1/4] Terminando procesos activos..."
pkill -f "agents-mesh" 2>/dev/null || true
pkill -f "src/mcp/server.ts" 2>/dev/null || true
echo -e "  ${GREEN}✅${NC} Procesos terminados"

echo -e "[2/4] Removiendo MCP server..."
claude mcp remove agents-mesh 2>/dev/null && echo -e "  ${GREEN}✅${NC} MCP removido" || echo -e "  (ya estaba removido)"

echo -e "[3/4] Eliminando archivos de código..."
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo -e "  ${GREEN}✅${NC} ${INSTALL_DIR} eliminado"
else
  echo -e "  (no existía)"
fi

echo -e "[4/4] Datos de runtime..."
read -rp "¿Eliminar historial y datos (~/.agents-mesh-data)? [y/N]: " del_data
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
echo "  pkill -f agents-mesh"
echo "  claude mcp remove agents-mesh"
echo "  rm -rf ~/.agents-mesh ~/.agents-mesh-data"
echo ""
