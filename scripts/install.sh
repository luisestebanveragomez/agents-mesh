#!/usr/bin/env bash
set -euo pipefail

REPO="luisestebanveragomez/agents-mesh"
BINARY="agents-mesh"
INSTALL_DIR="${AGENTS_MESH_INSTALL_DIR:-/usr/local/bin}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BOLD}${1}${NC}"; }
success() { echo -e "${GREEN}✓${NC} ${1}"; }
warn()    { echo -e "${YELLOW}!${NC} ${1}"; }
error()   { echo -e "${RED}✗${NC} ${1}" >&2; exit 1; }

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64)  echo "darwin-arm64" ;;
        x86_64) echo "darwin-x64" ;;
        *)      error "Unsupported macOS architecture: $arch" ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64)  echo "linux-x64" ;;
        aarch64) echo "linux-arm64" ;;
        *)       error "Unsupported Linux architecture: $arch" ;;
      esac
      ;;
    *)
      error "Unsupported OS: $os. For Windows use WSL: https://learn.microsoft.com/windows/wsl/install"
      ;;
  esac
}

get_latest_version() {
  local version
  version="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed 's/.*"tag_name": *"\(.*\)".*/\1/')"
  [ -n "$version" ] || error "Could not fetch latest version from GitHub"
  echo "$version"
}

TMPDIR_CLEANUP=""
cleanup() { [ -n "$TMPDIR_CLEANUP" ] && rm -rf "$TMPDIR_CLEANUP"; }
trap cleanup EXIT

main() {
  echo ""
  info "Installing agents-mesh..."
  echo ""

  local platform version tarball url bin_file needs_sudo

  platform="$(detect_platform)"
  version="${AGENTS_MESH_VERSION:-$(get_latest_version)}"
  tarball="${BINARY}-${platform}.tar.gz"
  url="https://github.com/${REPO}/releases/download/${version}/${tarball}"

  echo "  Platform : $platform"
  echo "  Version  : $version"
  echo "  Install  : $INSTALL_DIR"
  echo ""

  command -v curl >/dev/null 2>&1 || error "curl is required but not installed"

  TMPDIR_CLEANUP="$(mktemp -d)"

  info "Downloading ${tarball}..."
  if ! curl -fsSL --progress-bar "$url" -o "${TMPDIR_CLEANUP}/${tarball}"; then
    error "Download failed.\nCheck that ${version} exists at https://github.com/${REPO}/releases"
  fi

  tar -xzf "${TMPDIR_CLEANUP}/${tarball}" -C "$TMPDIR_CLEANUP"

  bin_file="$(find "$TMPDIR_CLEANUP" -maxdepth 1 -type f -name "${BINARY}*" ! -name "*.tar.gz" | head -1)"
  [ -n "$bin_file" ] || error "Binary not found in archive"

  needs_sudo=""
  if [ ! -w "$INSTALL_DIR" ]; then
    warn "Installing to $INSTALL_DIR requires sudo..."
    needs_sudo="sudo"
  fi

  $needs_sudo mkdir -p "$INSTALL_DIR"
  $needs_sudo install -m 755 "$bin_file" "${INSTALL_DIR}/${BINARY}"

  echo ""
  success "agents-mesh ${version} installed to ${INSTALL_DIR}/${BINARY}"

  # Desktop notifications: install notify-send on Linux (macOS uses built-in osascript)
  if [ "$(uname -s)" = "Linux" ]; then
    if command -v notify-send >/dev/null 2>&1; then
      success "notify-send already installed (desktop notifications enabled)"
    elif command -v apt-get >/dev/null 2>&1; then
      info "Installing libnotify-bin for desktop notifications..."
      sudo apt-get install -y -qq libnotify-bin && \
        success "libnotify-bin installed (desktop notifications enabled)" || \
        warn "Could not install libnotify-bin — desktop notifications will be disabled"
    elif command -v dnf >/dev/null 2>&1; then
      info "Installing libnotify for desktop notifications..."
      sudo dnf install -y -q libnotify && \
        success "libnotify installed (desktop notifications enabled)" || \
        warn "Could not install libnotify — desktop notifications will be disabled"
    elif command -v pacman >/dev/null 2>&1; then
      info "Installing libnotify for desktop notifications..."
      sudo pacman -S --noconfirm --quiet libnotify && \
        success "libnotify installed (desktop notifications enabled)" || \
        warn "Could not install libnotify — desktop notifications will be disabled"
    else
      warn "Could not detect package manager — desktop notifications will be disabled"
      warn "To enable: install libnotify (provides notify-send)"
    fi
  fi

  if ! command -v agents-mesh >/dev/null 2>&1; then
    echo ""
    warn "$INSTALL_DIR is not in your PATH. Add this to your shell config:"
    echo ""
    echo "    export PATH=\"\$PATH:${INSTALL_DIR}\""
    echo ""
  fi

  echo ""
  info "Next steps:"
  echo "  agents-mesh install claude-code    # add to Claude Code"
  echo "  agents-mesh install gemini-cli     # add to Gemini CLI"
  echo "  agents-mesh install opencode       # add to OpenCode"
  echo "  agents-mesh installed              # check status"
  echo "  agents-mesh dashboard              # open web dashboard"
  echo ""
}

main "$@"
