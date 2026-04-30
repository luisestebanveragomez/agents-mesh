# agents-mesh

Multi-agent communication for AI coding agents. Allows Claude Code, Gemini CLI, OpenCode, Copilot, Codex and others to communicate across terminals without the user as intermediary.

## Status

In development — v0.1.0

## Install

### Homebrew (recommended)

```bash
brew tap luisestebanveragomez/agents-mesh https://github.com/luisestebanveragomez/agents-mesh
brew install agents-mesh
```

### From source

```bash
git clone git@github.com:luisestebanveragomez/agents-mesh.git
cd agents-mesh
bun install
bun link   # adds agents-mesh to PATH
```

## Adding agents-mesh to an AI agent

### Supported agents (automatic)

Use the `agents-mesh install` command:

```bash
# Install globally (all projects)
agents-mesh install claude-code
agents-mesh install gemini-cli
agents-mesh install opencode
agents-mesh install copilot
agents-mesh install codex

# Install locally (current project only)
agents-mesh install claude-code --local
agents-mesh install gemini-cli --local

# Check installation status
agents-mesh installed
agents-mesh installed claude-code

# Remove
agents-mesh uninstall claude-code
agents-mesh uninstall claude-code --local
```

Config files modified per agent:

| Agent | Global config | Local config |
|-------|--------------|--------------|
| claude-code | `~/.claude.json` | `.mcp.json` |
| gemini-cli | `~/.gemini/settings.json` | `.gemini/settings.json` |
| opencode | `~/.config/opencode/config.json` | `opencode.config.json` |
| copilot | `~/Library/Application Support/Code/User/settings.json` (macOS) | `.vscode/settings.json` |
| codex | `~/.codex/config.json` | `codex.json` |

All commands create a timestamped `.bak` backup before modifying any file.

### Unsupported agents (manual)

For any agent that supports MCP servers, add this to its config:

```json
{
  "mcpServers": {
    "agents-mesh": {
      "command": "agents-mesh",
      "args": ["mcp"]
    }
  }
}
```

This works for **Cursor** (`.cursor/mcp.json`), **Windsurf** (`~/.codeium/windsurf/mcp_config.json`), **Cline/Roo** (MCP Settings in VS Code), and any other MCP-compatible agent.

The MCP server runs as a stdio process: `agents-mesh mcp`

## Usage

Once installed, the following MCP tools are available inside the agent:

| Tool | Description |
|------|-------------|
| `peers_list` | List all active agents in the mesh |
| `peers_ask` | Send a question to another agent and wait for the answer |
| `peers_notify` | Broadcast a message to all agents |
| `peers_check` | Check for incoming messages |
| `peers_reply` | Reply to a received message |
| `peers_search` | Find agents by role or path |
| `peers_status` | Update this agent's status/task |

## Dashboard

```bash
agents-mesh dashboard
```

Opens a local web dashboard at http://localhost:5723 showing all active agents, messages, and the communication graph.

## Uninstall

```bash
# Remove from all AI agents first
agents-mesh uninstall --all

# Then remove the binary
brew uninstall agents-mesh
brew untap luisestebanveragomez/agents-mesh
```
