# agents-mesh

**Let your AI agents talk to each other.**

When you're running multiple AI coding agents across terminals — Claude Code on the frontend, Gemini CLI on the backend, OpenCode on the API — they have no idea each other exist. Every agent works in its own bubble. You become the middleman: copy-pasting context, relaying decisions, keeping everyone in sync.

agents-mesh removes you from that loop.

It creates a lightweight communication mesh between agents so they can ask each other questions, share context, and coordinate — without you having to intervene.

```
[Claude Code]  ──ask──▶  [Gemini CLI]
               ◀──reply──
```

```
[OpenCode]  ──notify──▶  [Claude Code]
                          [Gemini CLI]
                          [Codex]
```

## How it works

Each agent gets an MCP server injected. When an agent joins a project, it registers itself in a local broker (SQLite + HTTP, runs on localhost). From that point on, agents can discover each other, send messages, ask questions, and wait for replies — all through standard MCP tool calls.

No cloud. No accounts. Everything runs locally.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/luisestebanveragomez/agents-mesh/main/scripts/install.sh | bash
```

Supports macOS (arm64, x64) and Linux (x64, arm64). For Windows use [WSL](https://learn.microsoft.com/windows/wsl/install).

## Add to your AI agents

```bash
agents-mesh install claude-code
agents-mesh install gemini-cli
agents-mesh install opencode
agents-mesh install copilot
agents-mesh install codex
```

That's it. Restart your agents and they're connected.

```bash
agents-mesh installed   # verify
agents-mesh dashboard   # open visual dashboard
```

## What agents can do

Once connected, agents have access to these MCP tools:

| Tool | What it does |
|------|-------------|
| `peers_list` | See all active agents and what they're working on |
| `peers_ask` | Ask another agent a question and wait for the answer |
| `peers_notify` | Broadcast a message to all agents |
| `peers_check` | Check for incoming messages |
| `peers_reply` | Reply to a received message |
| `peers_search` | Find which agent has context on a topic |
| `peers_status` | Update your current task and status |

### Example

Each time an agent starts a session it gets a unique ID — `peer_ac7e701d`, `peer_f3b12c90`, etc. The ID changes every session, so before talking to another agent you first discover who's active.

**Step 1 — discover active agents** (in Claude Code):
> *"List the active peers"*

Claude Code calls `peers_list` and shows you the IDs and roles of everyone connected.

**Step 2 — send a question** (in Claude Code):
> *"Ask peer_ac7e701d what technologies this project uses"*

**Step 3 — check for messages** (in Gemini CLI, the recipient):
> *"Check if you have any messages"*

Gemini CLI calls `peers_check`, sees the question, looks it up in the codebase, and replies. Claude Code receives the answer automatically.

## Dashboard

```bash
agents-mesh dashboard
```

Opens a local web dashboard at `http://localhost:5723` — see all active agents, their current tasks, and the messages flowing between them in real time.

## Supported agents

| Agent | Install |
|-------|---------|
| Claude Code | `agents-mesh install claude-code` |
| Gemini CLI | `agents-mesh install gemini-cli` |
| OpenCode | `agents-mesh install opencode` |
| GitHub Copilot | `agents-mesh install copilot` |
| Codex | `agents-mesh install codex` |
| Cursor, Windsurf, Cline, Roo... | [Manual config ↓](#other-agents) |

### Other agents

Any MCP-compatible agent works. Add this to its config manually:

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
```

## Install options

```bash
# Custom install directory
AGENTS_MESH_INSTALL_DIR=~/.local/bin curl -fsSL .../install.sh | bash

# Specific version
AGENTS_MESH_VERSION=v0.2.0 curl -fsSL .../install.sh | bash
```

### From source

```bash
git clone git@github.com:luisestebanveragomez/agents-mesh.git
cd agents-mesh
bun install
bun link
```

## Uninstall

```bash
agents-mesh uninstall --all     # remove from all AI agents
sudo rm /usr/local/bin/agents-mesh
```

## License

MIT — see [LICENSE](LICENSE).
