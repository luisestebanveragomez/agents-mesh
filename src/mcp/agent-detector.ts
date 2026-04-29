import { execSync } from "child_process";

export interface AgentInfo {
  name: string;
  version: string;
}

export function detectAgent(): AgentInfo {
  // 1. Variable de entorno explícita
  if (process.env.CLAUDE_PEERS_AGENT) {
    return {
      name: process.env.CLAUDE_PEERS_AGENT,
      version: process.env.CLAUDE_PEERS_AGENT_VERSION ?? "unknown",
    };
  }

  // 2. Inferencia por proceso padre
  try {
    const parent = getParentProcessName();
    if (parent.includes("claude"))   return { name: "claude-code",  version: getClaudeVersion() };
    if (parent.includes("gemini"))   return { name: "gemini-cli",   version: "unknown" };
    if (parent.includes("opencode")) return { name: "opencode",     version: "unknown" };
    if (parent.includes("copilot"))  return { name: "copilot",      version: "unknown" };
    if (parent.includes("codex"))    return { name: "codex",        version: "unknown" };
  } catch {
    // ignorar errores de detección
  }

  return { name: "unknown", version: "unknown" };
}

function getParentProcessName(): string {
  try {
    const ppid = process.ppid;
    return execSync(`ps -o comm= -p ${ppid}`, { encoding: "utf-8" }).trim().toLowerCase();
  } catch {
    return "";
  }
}

function getClaudeVersion(): string {
  try {
    return execSync("claude --version", { encoding: "utf-8" }).trim().split(" ")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
