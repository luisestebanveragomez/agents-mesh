import { execSync } from "child_process";
import { brokerFetch, ensureBroker } from "../../broker/launcher";
import { BrokerPeer } from "../../broker/types";
import { BROKER_PORT } from "../../shared/constants";

export async function doctorCommand(): Promise<void> {
  console.log(`\nagents-mesh doctor v0.1.0`);
  console.log("─".repeat(30));

  // 1. Broker running
  let brokerOk = false;
  try {
    await ensureBroker();
    brokerOk = true;
  } catch {}
  console.log(`Broker HTTP:        ${brokerOk ? `✅ (localhost:${BROKER_PORT})` : "❌ not responding"}`);

  // 2. Active peers
  let peers: BrokerPeer[] = [];
  if (brokerOk) {
    try { peers = await brokerFetch<BrokerPeer[]>("/peers"); } catch {}
  }
  console.log(`Active peers:       ${peers.length}`);

  // 3. MCP registered
  let mcpOk = false;
  try {
    const output = execSync("claude mcp list 2>/dev/null", { encoding: "utf-8" });
    mcpOk = output.includes("agents-mesh");
  } catch {}
  console.log(`MCP registered:     ${mcpOk ? "✅" : "❌"}`);

  // 4. Binary in PATH
  let binaryOk = false;
  try {
    execSync("which agents-mesh", { encoding: "utf-8" });
    binaryOk = true;
  } catch {}
  console.log(`agents-mesh in PATH: ${binaryOk ? "✅" : "❌"}`);

  // 5. Claude Code
  let claudeOk = false;
  let claudeVersion = "";
  try {
    claudeVersion = execSync("claude --version 2>/dev/null", { encoding: "utf-8" }).trim();
    claudeOk = true;
  } catch {}
  console.log(`Claude Code:        ${claudeOk ? `✅ ${claudeVersion}` : "❌ not found"}`);

  console.log("─".repeat(30));
  console.log(brokerOk ? "✅ All good\n" : "⚠️  Issues detected\n");
}
