#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.claude-peers"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "🔄 Actualizando claude-peers..."
echo ""

# Obtener versión actual
CURRENT_VERSION="desconocida"
if [ -f "${INSTALL_DIR}/package.json" ]; then
  CURRENT_VERSION=$(node -p "require('${INSTALL_DIR}/package.json').version" 2>/dev/null || echo "desconocida")
fi

# Obtener versión nueva
NEW_VERSION=$(node -p "require('${SOURCE_DIR}/package.json').version" 2>/dev/null || echo "desconocida")

echo -e "  Versión actual: ${YELLOW}${CURRENT_VERSION}${NC}"
echo -e "  Versión nueva:  ${GREEN}${NEW_VERSION}${NC}"
echo ""

if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  echo -e "${YELLOW}Ya estás en la versión más reciente.${NC}"
  exit 0
fi

echo -e "${BLUE}[1/3] Actualizando código...${NC}"
rm -rf "$INSTALL_DIR"
cp -r "$SOURCE_DIR" "$INSTALL_DIR"
echo -e "${GREEN}✅ Código actualizado${NC}"

echo -e "${BLUE}[2/3] Actualizando dependencias...${NC}"
cd "$INSTALL_DIR"
bun install --silent
echo -e "${GREEN}✅ Dependencias actualizadas${NC}"

echo -e "${BLUE}[3/3] Actualizando MCP server...${NC}"
claude mcp remove claude-peers 2>/dev/null || true
claude mcp add \
  --scope user \
  --transport stdio \
  claude-peers \
  -- bun "${INSTALL_DIR}/src/mcp/server.ts"
echo -e "${GREEN}✅ MCP server actualizado${NC}"

echo ""
echo -e "${GREEN}✅ Actualizado a v${NEW_VERSION}${NC}"
echo ""
