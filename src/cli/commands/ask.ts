import { readPeer, listPeers } from "../../mcp/storage/peer-registry";
import { enqueueMessage, readResponse, deleteResponse, deleteMessage } from "../../mcp/storage/message-queue";
import { logActivity } from "../../mcp/storage/activity-log";
import { Message } from "../../shared/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function askCommand(target: string, question: string, timeoutSec = TTL_S): Promise<void> {
  const { getSessionPeer } = await import("../session");
  const self = await getSessionPeer();

  if (!self) {
    console.error("❌ No estás registrado como peer. Ejecuta: claude-peers register");
    process.exit(1);
  }

  // Resolver target
  let targetPeer = await readPeer(target);
  if (!targetPeer) {
    const allPeers = await listPeers();
    targetPeer = allPeers.find(p => p.role === target || p.id === target) ?? null;
  }

  if (!targetPeer) {
    console.error(`❌ Peer no encontrado: ${target}`);
    process.exit(1);
  }

  const msgId = generateId("msg");
  const msg: Message = {
    id: msgId,
    from: self.id,
    from_role: self.role,
    from_agent: self.agent,
    to: targetPeer.id,
    to_role: targetPeer.role,
    type: "ask",
    content: question,
    metadata: { timeout_seconds: timeoutSec, reply_to: null },
    created_at: now(),
    expires_at: expiresAt(timeoutSec),
    read_at: null,
    responded_at: null,
  };

  await enqueueMessage(msg);
  await logActivity("message", `${self.id}→${targetPeer.id}`, "ask", question.slice(0, 100));

  console.log(`💬 Pregunta enviada a ${targetPeer.role} (${targetPeer.id})`);
  console.log(`⏳ Esperando respuesta (timeout: ${timeoutSec}s)...`);

  // Polling
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    await sleep(500);
    const response = await readResponse(self.id, msgId);
    if (response !== null) {
      await deleteResponse(self.id, msgId);
      console.log(`\n✅ Respuesta de ${targetPeer.role}:\n${response}`);
      return;
    }
  }

  await deleteMessage(targetPeer.id, msgId);
  console.log(`⏰ Timeout — sin respuesta de ${targetPeer.role}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
