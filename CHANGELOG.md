# Changelog

## v0.2.12 — 2026-06-07

### Added
- **Desktop notifications** — when an Ask arrives at a peer, the user receives a native OS notification without having to monitor the terminal
  - macOS: `osascript` via Finder context (works on Sonoma, Sequoia, and Tahoe — zero extra dependencies)
  - Linux: `notify-send` (installed automatically by the install script if missing)
  - Windows: PowerShell toast via `Windows.UI.Notifications` (built-in since Windows 10)
- Deduplication: each `msg_id` triggers at most one notification per process lifetime

---

## v0.2.11 — 2026-06-07

### Added
- **Progress signals for long-running Asks** — while peer B is working on a reply, the broker tracks activity so peer A knows the Ask is still alive and doesn't time out prematurely
- **"Asks in progress" dashboard section** — live cards showing in-flight Asks with elapsed time and last-activity indicator

### Fixed
- Stale STALLED cards no longer linger in `/asks/in-progress` after a reply is consumed
- `AskResult` type corrected; `timeout_seconds` tool description updated

---

## v0.2.10 — 2026-05-15

### Changed
- Improved README docs across EN/ES/ZH
- Dashboard startup output is cleaner and more informative

---

## v0.2.9 — 2026-05-15

### Added
- Official agents-mesh logo in dashboard header and favicon

---

## v0.2.8 — 2026-05-14

### Fixed
- Dead peer cleanup now runs every 10s instead of 30s — stale peers leave the graph faster

---

## v0.2.5 — 2026-05-14

### Added
- SVG agent icons in dashboard (transparent background, infinite scale)

### Fixed
- Dashboard peer cards patch in-place instead of full re-render every 2s (no more flicker)
- Copy peer ID button shows green checkmark feedback on click

---

## v0.2.0 — 2026-05-14

### Fixed
- Agent icons embedded as base64 in compiled binary — dashboard works without external assets
- CI: added bun dependency cache to reduce flaky build failures

---

## v0.1.9 — 2026-05-14

### Fixed
- OpenCode config path corrected to `opencode.json`
- OpenCode MCP config structure fixed

---

## v0.1.6 — 2026-05-14

### Fixed
- Dashboard HTML and assets embedded in compiled binary (no external file reads at runtime)

---

## v0.1.2 — 2026-05-14

### Added
- `agents-mesh update` command — updates the binary in-place from the latest GitHub release
- Silent update notifications — peers are notified when a newer version is available

---

## v0.1.1 — 2026-05-14

### Fixed
- Copilot install path corrected to `~/.copilot/mcp-config.json`
- All CLI and MCP tool descriptions translated to English

### Added
- README in Spanish (README.es.md) and Chinese (README.zh.md)
- CONTRIBUTING.md
- Beta notice across all READMEs

---

## v0.1.0 — 2026-04-29

### Initial release

**MCP Server (7 tools)**
- `peers_list` — list active peers with filters
- `peers_status` — update current peer status
- `peers_ask` — ask another peer and wait for a reply
- `peers_reply` — reply to a received message
- `peers_notify` — broadcast to one or more peers
- `peers_search` — discover which peer knows about a topic
- `peers_check` — check pending messages

**CLI**
- `agents-mesh list` — list peers
- `agents-mesh ask <target> <msg>` — ask
- `agents-mesh reply <id> <msg>` — reply
- `agents-mesh notify <msg>` — broadcast
- `agents-mesh check` — pending messages
- `agents-mesh status` — update status
- `agents-mesh doctor` — diagnostics
- `agents-mesh dashboard` — web dashboard
- `agents-mesh install <agent>` — install into an agent
- `agents-mesh uninstall [--all]` — uninstall

**Dashboard**
- Real-time peer graph (Cytoscape.js)
- Activity feed via SSE (updates every 2s)
- Peer cards with status and copyable ID
- Dark mode

**Security**
- Anti-injection patterns
- Rate limiting (30 msgs/min per peer)
- Message TTL
- Messages framed as information, not instructions

**Supported agents**
- Claude Code, Gemini CLI, OpenCode, Copilot, Codex (native MCP)
- Any MCP-compatible agent (Cursor, Windsurf, Cline/Roo, etc.)
