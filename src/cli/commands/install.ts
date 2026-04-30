import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const AGENTS = ["claude-code", "gemini-cli", "opencode", "copilot", "codex"] as const;
type Agent = typeof AGENTS[number];

interface InstallOptions {
  global?: boolean;
  local?: boolean;
}

function getMcpServerPath(): string {
  // Resolve the path to the MCP server entry point
  const scriptPath = new URL(import.meta.url).pathname;
  return join(dirname(dirname(dirname(scriptPath))), "mcp", "server.ts");
}

function readJson(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
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

function mcpServerEntry(serverPath: string) {
  return {
    command: "bun",
    args: [serverPath],
    env: {},
  };
}

// ── Claude Code ────────────────────────────────────────────────────────────────

function installClaudeCode(scope: "global" | "local", serverPath: string): void {
  if (scope === "global") {
    const configPath = join(homedir(), ".claude.json");
    backup(configPath);
    const config = readJson(configPath);
    const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
    mcpServers["agents-mesh"] = mcpServerEntry(serverPath);
    config.mcpServers = mcpServers;
    writeJson(configPath, config);
    console.log(`  MCP server added to ${configPath}`);
  } else {
    // Local: .mcp.json in current directory (Claude Code project-level config)
    const configPath = join(process.cwd(), ".mcp.json");
    backup(configPath);
    const config = readJson(configPath);
    const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
    mcpServers["agents-mesh"] = mcpServerEntry(serverPath);
    config.mcpServers = mcpServers;
    writeJson(configPath, config);
    console.log(`  MCP server added to ${configPath}`);
  }
}

function uninstallClaudeCode(scope: "global" | "local"): void {
  const configPath = scope === "global"
    ? join(homedir(), ".claude.json")
    : join(process.cwd(), ".mcp.json");
  if (!existsSync(configPath)) {
    console.log("  Nothing to remove.");
    return;
  }
  backup(configPath);
  const config = readJson(configPath);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  if (mcpServers?.["agents-mesh"]) {
    delete mcpServers["agents-mesh"];
    config.mcpServers = mcpServers;
    writeJson(configPath, config);
    console.log(`  Removed agents-mesh from ${configPath}`);
  } else {
    console.log("  agents-mesh not found in config.");
  }
}

function statusClaudeCode(): void {
  const globalPath = join(homedir(), ".claude.json");
  const localPath = join(process.cwd(), ".mcp.json");
  const globalConfig = readJson(globalPath);
  const localConfig = readJson(localPath);
  const globalInstalled = !!(globalConfig.mcpServers as Record<string, unknown> | undefined)?.["agents-mesh"];
  const localInstalled = !!(localConfig.mcpServers as Record<string, unknown> | undefined)?.["agents-mesh"];
  console.log(`  Global (${globalPath}): ${globalInstalled ? "✓ installed" : "✗ not installed"}`);
  console.log(`  Local  (${localPath}): ${localInstalled ? "✓ installed" : "✗ not installed"}`);
}

// ── Gemini CLI ─────────────────────────────────────────────────────────────────

function installGeminiCli(scope: "global" | "local", serverPath: string): void {
  const configPath = scope === "global"
    ? join(homedir(), ".gemini", "settings.json")
    : join(process.cwd(), ".gemini", "settings.json");
  backup(configPath);
  const config = readJson(configPath);
  const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
  mcpServers["agents-mesh"] = mcpServerEntry(serverPath);
  config.mcpServers = mcpServers;
  writeJson(configPath, config);
  console.log(`  MCP server added to ${configPath}`);
}

function uninstallGeminiCli(scope: "global" | "local"): void {
  const configPath = scope === "global"
    ? join(homedir(), ".gemini", "settings.json")
    : join(process.cwd(), ".gemini", "settings.json");
  if (!existsSync(configPath)) { console.log("  Nothing to remove."); return; }
  backup(configPath);
  const config = readJson(configPath);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  if (mcpServers?.["agents-mesh"]) {
    delete mcpServers["agents-mesh"];
    config.mcpServers = mcpServers;
    writeJson(configPath, config);
    console.log(`  Removed agents-mesh from ${configPath}`);
  } else {
    console.log("  agents-mesh not found in config.");
  }
}

function statusGeminiCli(): void {
  const globalPath = join(homedir(), ".gemini", "settings.json");
  const localPath = join(process.cwd(), ".gemini", "settings.json");
  const globalConfig = readJson(globalPath);
  const localConfig = readJson(localPath);
  const globalInstalled = !!(globalConfig.mcpServers as Record<string, unknown> | undefined)?.["agents-mesh"];
  const localInstalled = !!(localConfig.mcpServers as Record<string, unknown> | undefined)?.["agents-mesh"];
  console.log(`  Global (${globalPath}): ${globalInstalled ? "✓ installed" : "✗ not installed"}`);
  console.log(`  Local  (${localPath}): ${localInstalled ? "✓ installed" : "✗ not installed"}`);
}

// ── OpenCode ───────────────────────────────────────────────────────────────────

function installOpenCode(scope: "global" | "local", serverPath: string): void {
  const configPath = scope === "global"
    ? join(homedir(), ".config", "opencode", "config.json")
    : join(process.cwd(), "opencode.config.json");
  backup(configPath);
  const config = readJson(configPath);
  const mcp = (config.mcp as Record<string, unknown>) ?? {};
  const servers = (mcp.servers as Record<string, unknown>) ?? {};
  servers["agents-mesh"] = {
    type: "local",
    command: ["bun", serverPath],
  };
  mcp.servers = servers;
  config.mcp = mcp;
  writeJson(configPath, config);
  console.log(`  MCP server added to ${configPath}`);
}

function uninstallOpenCode(scope: "global" | "local"): void {
  const configPath = scope === "global"
    ? join(homedir(), ".config", "opencode", "config.json")
    : join(process.cwd(), "opencode.config.json");
  if (!existsSync(configPath)) { console.log("  Nothing to remove."); return; }
  backup(configPath);
  const config = readJson(configPath);
  const mcp = config.mcp as Record<string, unknown> | undefined;
  const servers = mcp?.servers as Record<string, unknown> | undefined;
  if (servers?.["agents-mesh"]) {
    delete servers["agents-mesh"];
    writeJson(configPath, config);
    console.log(`  Removed agents-mesh from ${configPath}`);
  } else {
    console.log("  agents-mesh not found in config.");
  }
}

function statusOpenCode(): void {
  const globalPath = join(homedir(), ".config", "opencode", "config.json");
  const localPath = join(process.cwd(), "opencode.config.json");
  for (const [label, p] of [["Global", globalPath], ["Local", localPath]]) {
    const config = readJson(p);
    const installed = !!(config.mcp as Record<string, unknown> | undefined)?.["servers"] &&
      !!((config.mcp as Record<string, Record<string, unknown>>)?.["servers"]?.["agents-mesh"]);
    console.log(`  ${label} (${p}): ${installed ? "✓ installed" : "✗ not installed"}`);
  }
}

// ── GitHub Copilot ─────────────────────────────────────────────────────────────

function installCopilot(scope: "global" | "local", serverPath: string): void {
  // VS Code settings: global = ~/.vscode/settings.json (or per platform), local = .vscode/settings.json
  const configPath = scope === "global"
    ? join(homedir(), "Library", "Application Support", "Code", "User", "settings.json")
    : join(process.cwd(), ".vscode", "settings.json");
  backup(configPath);
  const config = readJson(configPath);
  const servers = (config["github.copilot.chat.experimental.mcpServers"] as Record<string, unknown>) ?? {};
  servers["agents-mesh"] = {
    command: "bun",
    args: [serverPath],
  };
  config["github.copilot.chat.experimental.mcpServers"] = servers;
  writeJson(configPath, config);
  console.log(`  MCP server added to ${configPath}`);
}

function uninstallCopilot(scope: "global" | "local"): void {
  const configPath = scope === "global"
    ? join(homedir(), "Library", "Application Support", "Code", "User", "settings.json")
    : join(process.cwd(), ".vscode", "settings.json");
  if (!existsSync(configPath)) { console.log("  Nothing to remove."); return; }
  backup(configPath);
  const config = readJson(configPath);
  const servers = config["github.copilot.chat.experimental.mcpServers"] as Record<string, unknown> | undefined;
  if (servers?.["agents-mesh"]) {
    delete servers["agents-mesh"];
    config["github.copilot.chat.experimental.mcpServers"] = servers;
    writeJson(configPath, config);
    console.log(`  Removed agents-mesh from ${configPath}`);
  } else {
    console.log("  agents-mesh not found in config.");
  }
}

function statusCopilot(): void {
  const globalPath = join(homedir(), "Library", "Application Support", "Code", "User", "settings.json");
  const localPath = join(process.cwd(), ".vscode", "settings.json");
  for (const [label, p] of [["Global", globalPath], ["Local", localPath]]) {
    const config = readJson(p);
    const installed = !!(config["github.copilot.chat.experimental.mcpServers"] as Record<string, unknown> | undefined)?.["agents-mesh"];
    console.log(`  ${label} (${p}): ${installed ? "✓ installed" : "✗ not installed"}`);
  }
}

// ── Codex ──────────────────────────────────────────────────────────────────────

function installCodex(scope: "global" | "local", serverPath: string): void {
  const configPath = scope === "global"
    ? join(homedir(), ".codex", "config.json")
    : join(process.cwd(), "codex.json");
  backup(configPath);
  const config = readJson(configPath);
  const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
  mcpServers["agents-mesh"] = {
    command: "bun",
    args: [serverPath],
  };
  config.mcpServers = mcpServers;
  writeJson(configPath, config);
  console.log(`  MCP server added to ${configPath}`);
}

function uninstallCodex(scope: "global" | "local"): void {
  const configPath = scope === "global"
    ? join(homedir(), ".codex", "config.json")
    : join(process.cwd(), "codex.json");
  if (!existsSync(configPath)) { console.log("  Nothing to remove."); return; }
  backup(configPath);
  const config = readJson(configPath);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  if (mcpServers?.["agents-mesh"]) {
    delete mcpServers["agents-mesh"];
    config.mcpServers = mcpServers;
    writeJson(configPath, config);
    console.log(`  Removed agents-mesh from ${configPath}`);
  } else {
    console.log("  agents-mesh not found in config.");
  }
}

function statusCodex(): void {
  const globalPath = join(homedir(), ".codex", "config.json");
  const localPath = join(process.cwd(), "codex.json");
  for (const [label, p] of [["Global", globalPath], ["Local", localPath]]) {
    const config = readJson(p);
    const installed = !!(config.mcpServers as Record<string, unknown> | undefined)?.["agents-mesh"];
    console.log(`  ${label} (${p}): ${installed ? "✓ installed" : "✗ not installed"}`);
  }
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────

export async function installCommand(agent: string | undefined, opts: InstallOptions): Promise<void> {
  if (!agent) {
    console.log(`Uso: agents-mesh install <agent> [--global | --local]

Agents soportados: ${AGENTS.join(", ")}

Opciones:
  --global    Instala globalmente (default)
  --local     Instala solo en el directorio actual

Ejemplos:
  agents-mesh install claude-code
  agents-mesh install gemini-cli --local
  agents-mesh install copilot --global
`);
    return;
  }

  if (!AGENTS.includes(agent as Agent)) {
    console.error(`Agent no soportado: ${agent}`);
    console.error(`Soportados: ${AGENTS.join(", ")}`);
    console.error(`Para otros agentes, consulta el README.`);
    process.exit(1);
  }

  const scope: "global" | "local" = opts.local ? "local" : "global";
  const serverPath = getMcpServerPath();

  console.log(`Instalando agents-mesh para ${agent} (${scope})...`);

  switch (agent as Agent) {
    case "claude-code":  installClaudeCode(scope, serverPath); break;
    case "gemini-cli":   installGeminiCli(scope, serverPath); break;
    case "opencode":     installOpenCode(scope, serverPath); break;
    case "copilot":      installCopilot(scope, serverPath); break;
    case "codex":        installCodex(scope, serverPath); break;
  }

  console.log(`\n✓ agents-mesh instalado. Reinicia ${agent} para activarlo.`);
}

export async function uninstallCommand(agent: string | undefined, opts: InstallOptions): Promise<void> {
  if (!agent) {
    console.log(`Uso: agents-mesh uninstall <agent> [--global | --local]\n`);
    return;
  }

  if (!AGENTS.includes(agent as Agent)) {
    console.error(`Agent no soportado: ${agent}`);
    process.exit(1);
  }

  const scope: "global" | "local" = opts.local ? "local" : "global";
  console.log(`Desinstalando agents-mesh de ${agent} (${scope})...`);

  switch (agent as Agent) {
    case "claude-code":  uninstallClaudeCode(scope); break;
    case "gemini-cli":   uninstallGeminiCli(scope); break;
    case "opencode":     uninstallOpenCode(scope); break;
    case "copilot":      uninstallCopilot(scope); break;
    case "codex":        uninstallCodex(scope); break;
  }
}

export async function installStatusCommand(agent: string | undefined): Promise<void> {
  const agentsToCheck = agent ? [agent] : [...AGENTS];

  for (const a of agentsToCheck) {
    if (!AGENTS.includes(a as Agent)) continue;
    console.log(`\n${a}:`);
    switch (a as Agent) {
      case "claude-code":  statusClaudeCode(); break;
      case "gemini-cli":   statusGeminiCli(); break;
      case "opencode":     statusOpenCode(); break;
      case "copilot":      statusCopilot(); break;
      case "codex":        statusCodex(); break;
    }
  }
}
