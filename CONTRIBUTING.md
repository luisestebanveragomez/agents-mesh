# Contributing to agents-mesh

Thanks for your interest in contributing. This document covers how to get started, the project structure, and the process for submitting changes.

## Getting started

```bash
git clone git@github.com:luisestebanveragomez/agents-mesh.git
cd agents-mesh
bun install
```

Run the tests to make sure everything works:

```bash
bun test
```

## Project structure

```
src/
  broker/         HTTP broker — SQLite + Bun.serve (runs on localhost:7899)
  mcp/            MCP server — 7 tools exposed to AI agents via stdio
  cli/            CLI — install, dashboard, list, ask, check, etc.
  dashboard/      Web dashboard — SSE + Cytoscape.js
  shared/         Constants, types, utils
tests/
  unit/           Unit tests (Bun test runner)
scripts/
  install.sh      curl installer for end users
```

## Running locally

Start the broker:
```bash
bun src/cli/index.ts broker
```

Start the MCP server (connects to the broker automatically):
```bash
bun src/cli/index.ts mcp
```

Open the dashboard:
```bash
bun src/cli/index.ts dashboard
```

## How to contribute

1. **Open an issue first** for anything beyond small fixes — lets us align before you invest time writing code.
2. **Fork the repo** and create a branch from `main`.
3. **Write tests** for any new behavior. Run `bun test` before submitting.
4. **Keep PRs focused** — one feature or fix per PR.
5. **Open the PR** against `main` with a clear description of what and why.

## Adding support for a new agent

New agent installs live in `src/cli/commands/install.ts`. Each agent needs:

- A config path resolver in `getConfigPath()`
- Install logic in `installAgent()`
- Uninstall logic in `uninstallAgent()`
- Status check in `statusAgent()`
- An entry in the `AGENTS` constant at the top of the file

Look at the `claude-code` implementation as a reference.

## Reporting bugs

Open a GitHub issue with:
- OS and architecture
- agents-mesh version (`agents-mesh --version`)
- Steps to reproduce
- What you expected vs what happened

## Code style

- TypeScript, no `any` where avoidable
- No external runtime dependencies beyond `bun` and `@modelcontextprotocol/sdk`
- Keep files small and focused — if a file is getting large, split it

## License

By contributing you agree that your contributions will be licensed under the MIT License.
