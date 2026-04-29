import { execSync } from "child_process";
import { listPeers, cleanDeadPeers, ensureDirectories } from "../../mcp/storage/peer-registry";
import { readPendingMessages } from "../../mcp/storage/message-queue";
import { DATA_DIR, ACTIVITY_LOG } from "../../shared/constants";
import { access } from "fs/promises";

export async function doctorCommand(): Promise<void> {
  console.log(`\nClaude Peers Doctor v0.1.0`);
  console.log("─".repeat(30));

  // 1. MCP registrado
  let mcpOk = false;
  try {
    const output = execSync("claude mcp list 2>/dev/null", { encoding: "utf-8" });
    mcpOk = output.includes("claude-peers");
  } catch {
    mcpOk = false;
  }
  console.log(`MCP registrado:     ${mcpOk ? "✅" : "❌"}`);

  // 2. Directorio de datos
  let dataOk = false;
  try {
    await access(DATA_DIR);
    dataOk = true;
  } catch {
    dataOk = false;
  }
  console.log(`Directorio datos:   ${dataOk ? `✅ (${DATA_DIR})` : "❌"}`);

  // 3. Peers activos
  await ensureDirectories();
  const peers = await listPeers();
  console.log(`Peers activos:      ${peers.length}`);

  // 4. Mensajes pendientes
  let pendingCount = 0;
  for (const peer of peers) {
    const msgs = await readPendingMessages(peer.id);
    pendingCount += msgs.length;
  }
  console.log(`Mensajes pendientes: ${pendingCount}`);

  // 5. Peers muertos
  const dead = await cleanDeadPeers();
  if (dead.length > 0) {
    console.log(`Peers muertos:      ${dead.length} (limpiados)`);
  } else {
    console.log(`Peers muertos:      0`);
  }

  // 6. Bun disponible
  let bunOk = false;
  let bunVersion = "";
  try {
    bunVersion = execSync("bun --version", { encoding: "utf-8" }).trim();
    bunOk = true;
  } catch {
    bunOk = false;
  }
  console.log(`Bun disponible:     ${bunOk ? `✅ v${bunVersion}` : "❌"}`);

  // 7. Claude Code
  let claudeOk = false;
  let claudeVersion = "";
  try {
    claudeVersion = execSync("claude --version 2>/dev/null", { encoding: "utf-8" }).trim();
    claudeOk = true;
  } catch {
    claudeOk = false;
  }
  console.log(`Claude Code:        ${claudeOk ? `✅ ${claudeVersion}` : "❌ (no instalado)"}`);

  console.log("─".repeat(30));

  const allOk = dataOk && bunOk;
  console.log(allOk ? "✅ Todo en orden\n" : "⚠️  Hay problemas — revisa los ❌ arriba\n");
}
