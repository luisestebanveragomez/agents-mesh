import { execSync } from "child_process";
import { brokerFetch, ensureBroker } from "../../broker/launcher";
import { BrokerPeer } from "../../broker/types";
import { BROKER_PORT } from "../../shared/constants";

export async function doctorCommand(): Promise<void> {
  console.log(`\nClaude Peers Doctor v0.1.0`);
  console.log("─".repeat(30));

  // 1. Broker corriendo
  let brokerOk = false;
  try {
    await ensureBroker();
    brokerOk = true;
  } catch {}
  console.log(`Broker HTTP:        ${brokerOk ? `✅ (localhost:${BROKER_PORT})` : "❌ no responde"}`);

  // 2. Peers activos
  let peers: BrokerPeer[] = [];
  if (brokerOk) {
    try { peers = await brokerFetch<BrokerPeer[]>("/peers"); } catch {}
  }
  console.log(`Peers activos:      ${peers.length}`);

  // 3. MCP registrado
  let mcpOk = false;
  try {
    const output = execSync("claude mcp list 2>/dev/null", { encoding: "utf-8" });
    mcpOk = output.includes("agents-mesh");
  } catch {}
  console.log(`MCP registrado:     ${mcpOk ? "✅" : "❌"}`);

  // 4. Bun disponible
  let bunVersion = "";
  let bunOk = false;
  try {
    bunVersion = execSync("bun --version", { encoding: "utf-8" }).trim();
    bunOk = true;
  } catch {}
  console.log(`Bun disponible:     ${bunOk ? `✅ v${bunVersion}` : "❌"}`);

  // 5. Claude Code
  let claudeOk = false;
  let claudeVersion = "";
  try {
    claudeVersion = execSync("claude --version 2>/dev/null", { encoding: "utf-8" }).trim();
    claudeOk = true;
  } catch {}
  console.log(`Claude Code:        ${claudeOk ? `✅ ${claudeVersion}` : "❌"}`);

  console.log("─".repeat(30));
  console.log(brokerOk && bunOk ? "✅ Todo en orden\n" : "⚠️  Hay problemas\n");
}
