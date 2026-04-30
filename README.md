# agents-mesh

Multi-agent communication mesh for AI coding agents. Allows Claude Code, Gemini CLI, OpenCode, Copilot, Codex and others to communicate across terminals without the user as intermediary.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/luisestebanveragomez/agents-mesh/main/scripts/install.sh | bash
```

Supports macOS (arm64, x64) and Linux (x64, arm64). For Windows use [WSL](https://learn.microsoft.com/windows/wsl/install).

### Install options

```bash
# Install to a custom directory
AGENTS_MESH_INSTALL_DIR=~/.local/bin curl -fsSL .../install.sh | bash

# Install a specific version
AGENTS_MESH_VERSION=v0.2.0 curl -fsSL .../install.sh | bash
```

### From source

```bash
git clone git@github.com:luisestebanveragomez/agents-mesh.git
cd agents-mesh
bun install
bun link   # adds agents-mesh to PATH
```

## Adding agents-mesh to an AI agent

Once installed, add agents-mesh to your AI agents:

```bash
# Add to specific agents
agents-mesh install claude-code
agents-mesh install gemini-cli
agents-mesh install opencode
agents-mesh install copilot
agents-mesh install codex

# Install locally (current project only)
agents-mesh install claude-code --local

# Check status
agents-mesh installed

# Remove from a specific agent
agents-mesh uninstall claude-code
```

Config files modified per agent:

| Agent | Global config | Local config |
|-------|--------------|--------------|
| claude-code | `~/.claude.json` | `.mcp.json` |
| gemini-cli | `~/.gemini/settings.json` | `.gemini/settings.json` |
| opencode | `~/.config/opencode/config.json` | `opencode.config.json` |
| copilot | `~/Library/Application Support/Code/User/settings.json` | `.vscode/settings.json` |
| codex | `~/.codex/config.json` | `codex.json` |

All commands create a timestamped `.bak` backup before modifying any file.

### Other MCP-compatible agents

For Cursor, Windsurf, Cline/Roo, or any other agent that supports MCP servers, add this manually to its config:

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

## Usage

Once added to an agent, the following MCP tools are available:

| Tool | Description |
|------|-------------|
| `peers_list` | List all active agents in the mesh |
| `peers_ask` | Send a question to another agent and wait for the reply |
| `peers_notify` | Broadcast a message to all agents |
| `peers_check` | Check for incoming messages |
| `peers_reply` | Reply to a received message |
| `peers_search` | Find agents by role or path |
| `peers_status` | Update this agent's current status and task |

## Dashboard

```bash
agents-mesh dashboard
```

Opens a local web dashboard at `http://localhost:5723` showing all active agents, messages, and the communication graph.

## CLI reference

```
agents-mesh install <agent> [--global|--local]   Add to an AI agent
agents-mesh uninstall <agent> [--global|--local] Remove from an AI agent
agents-mesh uninstall --all                      Remove from all agents
agents-mesh installed [agent]                    Show installation status
agents-mesh list                                 List active peers
agents-mesh ask <target> <question>              Ask another peer
agents-mesh notify <message>                     Notify all peers
agents-mesh check                                Check pending messages
agents-mesh reply <msg_id> <response>            Reply to a message
agents-mesh status [--task <t>] [--status <s>]  Update your status
agents-mesh doctor                               Diagnose the setup
agents-mesh dashboard                            Open the web dashboard
agents-mesh mcp                                  Start the MCP server (stdio)
agents-mesh broker                               Start the HTTP broker
```

## Uninstall

```bash
# Remove agents-mesh from all AI agents
agents-mesh uninstall --all

# Remove the binary
sudo rm /usr/local/bin/agents-mesh
```
