import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const AGENTS = ["claude-code", "gemini-cli", "opencode", "copilot", "codex"] as const;
type Agent = typeof AGENTS[number];
type Scope = "global" | "local";

interface InstallOptions {
  global?: boolean;
  local?: boolean;
  all?: boolean;
}

const TRACKING_DIR = join(homedir(), ".agents-mesh");
const TRACKING_FILE = join(TRACKING_DIR, "installs.json");

// ── Tracking ───────────────────────────────────────────────────────────────────

interface InstallRecord {
  agent: string;
  scope: Scope;
  configPath: string;
  installedAt: string;
}

function loadTracking(): InstallRecord[] {
  if (!existsSync(TRACKING_FILE)) return [];
  try { return JSON.parse(readFileSync(TRACKING_FILE, "utf-8")); } catch { return []; }
}

function saveTracking(records: InstallRecord[]): void {
  mkdirSync(TRACKING_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(TRACKING_FILE, JSON.stringify(records, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}

function trackInstall(agent: string, scope: Scope, configPath: string): void {
  const records = loadTracking().filter(r => !(r.agent === agent && r.scope === scope));
  records.push({ agent, scope, configPath, installedAt: new Date().toISOString() });
  saveTracking(records);
}

function untrackInstall(agent: string, scope: Scope): void {
  saveTracking(loadTracking().filter(r => !(r.agent === agent && r.scope === scope)));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try { return JSON.parse(readFileSync(filePath, "utf-8")); } catch { return {}; }
}

function writeJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function backup(filePath: string): void {
  if (existsSync(filePath)) {
    const backupPath = `${filePath}.bak.${Date.now()}`;
    copyFileSync(filePath, backupPath);
    console.log(`  Backup: ${backupPath}`);
  }
}

function mcpEntry() {
  return { command: "agents-mesh", args: ["mcp"] };
}

function opencodeMcpEntry() {
  return { type: "local", command: ["agents-mesh", "mcp"], enabled: true };
}

// ── Config paths ───────────────────────────────────────────────────────────────

function getConfigPath(agent: Agent, scope: Scope): string {
  switch (agent) {
    case "claude-code":
      return scope === "global" ? join(homedir(), ".claude.json") : join(process.cwd(), ".mcp.json");
    case "gemini-cli":
      return scope === "global" ? join(homedir(), ".gemini", "settings.json") : join(process.cwd(), ".gemini", "settings.json");
    case "opencode":
      return scope === "global" ? join(homedir(), ".config", "opencode", "opencode.json") : join(process.cwd(), "opencode.json");
    case "copilot":
      return scope === "global"
        ? join(homedir(), ".copilot", "mcp-config.json")
        : join(process.cwd(), ".copilot", "mcp-config.json");
    case "codex":
      return scope === "global" ? join(homedir(), ".codex", "config.toml") : join(process.cwd(), "codex.toml");
  }
}

// ── Claude Code Stop hook ─────────────────────────────────────────────────────
// Wakes up idle agents: after each turn, checks for pending peer messages and
// blocks the stop so the agent reads them with peers_check.

const STOP_HOOK_CMD = "agents-mesh stop-hook";

function installClaudeStopHook(): void {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const settings = readJson(settingsPath);
  const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
  const stopHooks = (hooks.Stop as { hooks?: { command?: string }[] }[]) ?? [];
  const already = stopHooks.some(entry => entry.hooks?.some(h => h.command === STOP_HOOK_CMD));
  if (!already) {
    stopHooks.push({ hooks: [{ type: "command", command: STOP_HOOK_CMD } as { command: string }] });
    hooks.Stop = stopHooks;
    settings.hooks = hooks;
    writeJson(settingsPath, settings);
    console.log(`  Stop hook added to ${settingsPath} (auto-check peer messages after each turn)`);
  }
}

function uninstallClaudeStopHook(): void {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) return;
  const settings = readJson(settingsPath);
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  const stopHooks = hooks?.Stop as { hooks?: { command?: string }[] }[] | undefined;
  if (!stopHooks) return;
  const filtered = stopHooks.filter(entry => !entry.hooks?.some(h => h.command === STOP_HOOK_CMD));
  if (filtered.length !== stopHooks.length) {
    hooks!.Stop = filtered;
    if (filtered.length === 0) delete hooks!.Stop;
    settings.hooks = hooks;
    writeJson(settingsPath, settings);
    console.log(`  Stop hook removed from ${settingsPath}`);
  }
}

// ── Codex TOML helpers ────────────────────────────────────────────────────────

const CODEX_MCP_BLOCK = `\n[mcp_servers.agents-mesh]\ncommand = "agents-mesh"\nargs = ["mcp"]\n`;

function installCodexToml(configPath: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  if (existing.includes("[mcp_servers.agents-mesh]")) return;
  writeFileSync(configPath, existing + CODEX_MCP_BLOCK, "utf-8");
}

function uninstallCodexToml(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  const content = readFileSync(configPath, "utf-8");
  if (!content.includes("[mcp_servers.agents-mesh]")) return false;
  // Remove the block: from [mcp_servers.agents-mesh] to the next [section] or end of file
  const updated = content.replace(/\n?\[mcp_servers\.agents-mesh\][^\[]*/, "");
  writeFileSync(configPath, updated, "utf-8");
  return true;
}

function isCodexTomlInstalled(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  return readFileSync(configPath, "utf-8").includes("[mcp_servers.agents-mesh]");
}

// ── Install per agent ──────────────────────────────────────────────────────────

function installAgent(agent: Agent, scope: Scope): void {
  const configPath = getConfigPath(agent, scope);
  backup(configPath);
  const config = readJson(configPath);

  switch (agent) {
    case "claude-code": {
      const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
      mcpServers["agents-mesh"] = mcpEntry();
      config.mcpServers = mcpServers;
      if (scope === "global") installClaudeStopHook();
      break;
    }
    case "gemini-cli": {
      const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
      mcpServers["agents-mesh"] = mcpEntry();
      config.mcpServers = mcpServers;
      break;
    }
    case "opencode": {
      const mcp = (config.mcp as Record<string, unknown>) ?? {};
      mcp["agents-mesh"] = opencodeMcpEntry();
      config.mcp = mcp;
      break;
    }
    case "copilot": {
      const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
      mcpServers["agents-mesh"] = { type: "stdio", ...mcpEntry(), tools: ["*"] };
      config.mcpServers = mcpServers;
      break;
    }
    case "codex": {
      installCodexToml(configPath);
      trackInstall(agent, scope, configPath);
      console.log(`  MCP server added to ${configPath}`);
      return;
    }
  }

  writeJson(configPath, config);
  trackInstall(agent, scope, configPath);
  console.log(`  MCP server added to ${configPath}`);
}

// ── Uninstall per agent ────────────────────────────────────────────────────────

function uninstallAgent(agent: Agent, scope: Scope): boolean {
  const configPath = getConfigPath(agent, scope);
  if (!existsSync(configPath)) { console.log(`  ${agent} (${scope}): nothing to remove.`); return false; }
  backup(configPath);
  const config = readJson(configPath);
  let found = false;

  switch (agent) {
    case "claude-code": {
      const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
      if (mcpServers?.["agents-mesh"]) { delete mcpServers["agents-mesh"]; config.mcpServers = mcpServers; found = true; }
      if (scope === "global") uninstallClaudeStopHook();
      break;
    }
    case "gemini-cli": {
      const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
      if (mcpServers?.["agents-mesh"]) { delete mcpServers["agents-mesh"]; config.mcpServers = mcpServers; found = true; }
      break;
    }
    case "codex": {
      found = uninstallCodexToml(configPath);
      if (found) { untrackInstall(agent, scope); console.log(`  Removed agents-mesh from ${configPath}`); }
      else { console.log(`  ${agent} (${scope}): agents-mesh not found in config.`); }
      return;
    }
    case "opencode": {
      const mcp = config.mcp as Record<string, unknown> | undefined;
      if (mcp?.["agents-mesh"]) { delete mcp["agents-mesh"]; config.mcp = mcp; found = true; }
      break;
    }
    case "copilot": {
      const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
      if (mcpServers?.["agents-mesh"]) { delete mcpServers["agents-mesh"]; config.mcpServers = mcpServers; found = true; }
      break;
    }
  }

  if (found) {
    writeJson(configPath, config);
    untrackInstall(agent, scope);
    console.log(`  Removed agents-mesh from ${configPath}`);
  } else {
    console.log(`  ${agent} (${scope}): agents-mesh not found in config.`);
  }
  return found;
}

// ── Status per agent ───────────────────────────────────────────────────────────

function statusAgent(agent: Agent): void {
  for (const scope of ["global", "local"] as Scope[]) {
    const configPath = getConfigPath(agent, scope);
    const config = readJson(configPath);
    let installed = false;

    switch (agent) {
      case "claude-code":
      case "gemini-cli":
        installed = !!(config.mcpServers as Record<string, unknown> | undefined)?.["agents-mesh"];
        break;
      case "codex":
        installed = isCodexTomlInstalled(configPath);
        break;
      case "opencode":
        installed = !!(config.mcp as Record<string, unknown> | undefined)?.["agents-mesh"];
        break;
      case "copilot":
        installed = !!(config.mcpServers as Record<string, unknown> | undefined)?.["agents-mesh"];
        break;
    }

    const label = scope === "global" ? "Global" : "Local ";
    console.log(`  ${label} (${configPath}): ${installed ? "✓ installed" : "✗ not installed"}`);
  }
}

// ── Public commands ────────────────────────────────────────────────────────────

export async function installCommand(agent: string | undefined, opts: InstallOptions): Promise<void> {
  if (!agent) {
    console.log(`Usage: agents-mesh install <agent> [--global | --local]

Supported agents: ${AGENTS.join(", ")}

Options:
  --global    Install globally for all projects (default)
  --local     Install only for the current directory

Examples:
  agents-mesh install claude-code
  agents-mesh install gemini-cli --local
  agents-mesh install copilot --global
`);
    return;
  }

  if (!AGENTS.includes(agent as Agent)) {
    console.error(`Unsupported agent: ${agent}`);
    console.error(`Supported: ${AGENTS.join(", ")}`);
    console.error(`For other agents, see the README.`);
    process.exit(1);
  }

  const scope: Scope = opts.local ? "local" : "global";
  console.log(`Installing agents-mesh for ${agent} (${scope})...`);
  installAgent(agent as Agent, scope);
  console.log(`\n✓ agents-mesh installed. Restart ${agent} to activate.`);
}

export async function uninstallCommand(agent: string | undefined, opts: InstallOptions): Promise<void> {
  if (opts.all || agent === "--all") {
    const records = loadTracking();
    if (records.length === 0) {
      console.log("No installations recorded.");
      return;
    }
    console.log(`Removing agents-mesh from ${records.length} installation(s)...`);
    for (const r of records) {
      if (AGENTS.includes(r.agent as Agent)) {
        uninstallAgent(r.agent as Agent, r.scope);
      }
    }
    saveTracking([]);
    console.log("\n✓ agents-mesh removed from all agents.");
    return;
  }

  if (!agent) {
    console.log(`Usage: agents-mesh uninstall <agent> [--global | --local]
       agents-mesh uninstall --all\n`);
    return;
  }

  if (!AGENTS.includes(agent as Agent)) {
    console.error(`Unsupported agent: ${agent}`);
    process.exit(1);
  }

  const scope: Scope = opts.local ? "local" : "global";
  console.log(`Removing agents-mesh from ${agent} (${scope})...`);
  uninstallAgent(agent as Agent, scope);
}

export async function installStatusCommand(agent: string | undefined): Promise<void> {
  const agentsToCheck = agent ? [agent] : [...AGENTS];
  for (const a of agentsToCheck) {
    if (!AGENTS.includes(a as Agent)) continue;
    console.log(`\n${a}:`);
    statusAgent(a as Agent);
  }
}
