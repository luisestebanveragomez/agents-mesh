import { listPeers } from "../../mcp/storage/peer-registry";
import { readPendingMessages, markMessageRead } from "../../mcp/storage/message-queue";
import { formatForAgent } from "../../mcp/security";

export async function checkCommand(): Promise<void> {
  const peers = await listPeers();
  const self = peers.find(p => p.pid === process.pid);

  if (!self) {
    console.error("❌ No estás registrado como peer");
    process.exit(1);
  }

  const messages = await readPendingMessages(self.id);

  if (messages.length === 0) {
    console.log("📭 Sin mensajes pendientes");
    return;
  }

  console.log(`📬 ${messages.length} mensaje(s) pendiente(s):\n`);
  for (const msg of messages) {
    console.log("─".repeat(60));
    console.log(formatForAgent(msg));
    console.log();
    await markMessageRead(self.id, msg.id);
  }
}
