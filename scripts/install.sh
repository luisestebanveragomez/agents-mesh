#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.agents-mesh"
DATA_DIR="${HOME}/.agents-mesh-data"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COMPLETED_STEPS=()

rollback() {
  echo -e "\n${RED}❌ Error en la instalación, revirtiendo...${NC}"
  for step in "${COMPLETED_STEPS[@]}"; do
    case "$step" in
      "mcp")        claude mcp remove agents-mesh 2>/dev/null || true ;;
      "install_dir") rm -rf "$INSTALL_DIR" ;;
      "data_dir")   rm -rf "$DATA_DIR" ;;
    esac
  done
  echo -e "${YELLOW}Sistema limpio. Nada fue modificado permanentemente.${NC}"
  exit 1
}
trap rollback ERR

check_deps() {
  echo -e "${BLUE}[1/5] Verificando dependencias...${NC}"

  command -v node &>/dev/null || {
    echo -e "${RED}❌ Node.js no encontrado. Instálalo desde https://nodejs.org${NC}"
    exit 1
  }

  command -v claude &>/dev/null || {
    echo -e "${RED}❌ Claude Code no encontrado. Instálalo desde https://claude.ai/code${NC}"
    exit 1
  }

  if ! command -v bun &>/dev/null; then
    echo -e "${YELLOW}  Bun no encontrado, instalando...${NC}"
    curl -fsSL https://bun.sh/install | bash
    # Agregar bun al PATH para este script
    export PATH="$HOME/.bun/bin:$PATH"
    command -v bun &>/dev/null || {
      echo -e "${RED}❌ No se pudo instalar Bun${NC}"
      exit 1
    }
  fi

  echo -e "${GREEN}✅ Dependencias OK (node: $(node --version), bun: $(bun --version))${NC}"
}

install_files() {
  echo -e "${BLUE}[2/5] Instalando archivos...${NC}"

  [ -d "$INSTALL_DIR" ] && rm -rf "$INSTALL_DIR"
  cp -r "$SOURCE_DIR" "$INSTALL_DIR"

  cd "$INSTALL_DIR"
  bun install --silent

  COMPLETED_STEPS+=("install_dir")
  echo -e "${GREEN}✅ Archivos instalados en ${INSTALL_DIR}${NC}"
}

create_data_dir() {
  echo -e "${BLUE}[3/5] Creando directorio de datos...${NC}"

  mkdir -p "${DATA_DIR}/peers"
  mkdir -p "${DATA_DIR}/messages"
  mkdir -p "${DATA_DIR}/responses"
  mkdir -p "${DATA_DIR}/locks"
  touch "${DATA_DIR}/activity.log"

  COMPLETED_STEPS+=("data_dir")
  echo -e "${GREEN}✅ Datos en ${DATA_DIR}${NC}"
}

register_mcp() {
  echo -e "${BLUE}[4/5] Registrando MCP server...${NC}"

  claude mcp add \
    --scope user \
    --transport stdio \
    agents-mesh \
    -- bun "${INSTALL_DIR}/src/mcp/server.ts"

  COMPLETED_STEPS+=("mcp")
  echo -e "${GREEN}✅ MCP registrado globalmente${NC}"
}

verify() {
  echo -e "${BLUE}[5/5] Verificando instalación...${NC}"

  claude mcp list 2>/dev/null | grep -q "agents-mesh" || {
    echo -e "${RED}❌ MCP no aparece en la lista${NC}"
    return 1
  }

  echo -e "${GREEN}✅ Verificación OK${NC}"
}

main() {
  echo ""
  echo "╔═══════════════════════════════════╗"
  echo "║  Claude Peers Installer v0.1.0    ║"
  echo "╚═══════════════════════════════════╝"
  echo ""

  check_deps
  install_files
  create_data_dir
  register_mcp
  verify

  echo ""
  echo "╔═══════════════════════════════════╗"
  echo "║  ✅ Instalación completa          ║"
  echo "╚═══════════════════════════════════╝"
  echo ""
  echo "Próximos pasos:"
  echo "  → Abre Claude Code y escribe: 'lista los peers activos'"
  echo "  → Dashboard: bun ${INSTALL_DIR}/src/cli/index.ts dashboard"
  echo "  → Desinstalar: bash ${INSTALL_DIR}/scripts/uninstall.sh"
  echo ""
}

main "$@"
