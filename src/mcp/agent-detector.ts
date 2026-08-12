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
    // Walk up 8 levels of the process tree to find the agent (Codex/Copilot use wrapper processes)
    let pid = process.ppid;
    for (let i = 0; i < 8; i++) {
      const line = execSync(`ps -o comm=,ppid= -p ${pid}`, { encoding: "utf-8" }).trim();
      const [comm, ppidStr] = line.split(/\s+/);
      const name = (comm ?? "").toLowerCase();
      if (name.includes("claude") || name.includes("gemini") ||
          name.includes("opencode") || name.includes("copilot") || name.includes("codex")) {
        return name;
      }
      // Also check full command line for node-based agents
      try {
        const cmdline = execSync(`ps -o args= -p ${pid}`, { encoding: "utf-8" }).trim().toLowerCase();
        if (cmdline.includes("gemini")) return "gemini";
        if (cmdline.includes("opencode")) return "opencode";
        if (cmdline.includes("copilot")) return "copilot";
        if (cmdline.includes("codex")) return "codex";
      } catch {}
      const nextPid = Number(ppidStr);
      if (!nextPid || nextPid === pid) break;
      pid = nextPid;
    }
    return execSync(`ps -o comm= -p ${process.ppid}`, { encoding: "utf-8" }).trim().toLowerCase();
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
