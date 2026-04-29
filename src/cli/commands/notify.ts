import { listPeers } from "../../mcp/storage/peer-registry";
import { enqueueMessage } from "../../mcp/storage/message-queue";
import { logActivity } from "../../mcp/storage/activity-log";
import { Message, MessageCategory } from "../../shared/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function notifyCommand(message: string, category: MessageCategory = "info"): Promise<void> {
  const peers = await listPeers();
  const self = peers.find(p => p.pid === process.pid);

  if (!self) {
    console.error("❌ No estás registrado como peer. Ejecuta: claude-peers register");
    process.exit(1);
  }

  const targets = peers.filter(p => p.id !== self.id);
  if (targets.length === 0) {
    console.log("Sin otros peers activos");
    return;
  }

  for (const target of targets) {
    const msgId = generateId("msg");
    const msg: Message = {
      id: msgId,
      from: self.id,
      from_role: self.role,
      from_agent: self.agent,
      to: target.id,
      to_role: target.role,
      type: "notify",
      content: message,
      metadata: { category, reply_to: null },
      created_at: now(),
      expires_at: expiresAt(TTL_S * 4),
      read_at: null,
      responded_at: null,
    };
    await enqueueMessage(msg);
    await logActivity("message", `${self.id}→${target.id}`, "notify", message.slice(0, 100));
  }

  console.log(`✅ Notificación enviada a ${targets.length} peer(s)`);
}
