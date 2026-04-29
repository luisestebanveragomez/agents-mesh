import { ensureBroker, brokerFetch } from "../../broker/launcher";
import { getSessionPeer } from "../session";
import { BrokerPeer, BrokerMessage } from "../../broker/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function askCommand(target: string, question: string, timeoutSec = TTL_S): Promise<void> {
  await ensureBroker();
  const self = await getSessionPeer();
  if (!self) {
    console.error("❌ No estás registrado. Ejecuta: claude-peers register");
    process.exit(1);
  }

  const peers = await brokerFetch<BrokerPeer[]>("/peers");
  const targetPeer = peers.find(p => p.id === target || p.role === target);
  if (!targetPeer) {
    console.error(`❌ Peer no encontrado: ${target}`);
    process.exit(1);
  }

  const msgId = generateId("msg");
  await brokerFetch("/message/send", {
    method: "POST",
    body: JSON.stringify({
      id: msgId, from_id: self.id, from_role: self.role, from_agent: self.agent,
      to_id: targetPeer.id, to_role: targetPeer.role, type: "ask",
      content: question, metadata: "{}", created_at: now(), expires_at: expiresAt(timeoutSec),
    } as BrokerMessage),
  });

  console.log(`💬 Pregunta enviada a ${targetPeer.role} (${targetPeer.id})`);
  console.log(`⏳ Esperando respuesta (timeout: ${timeoutSec}s)...`);

  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    await sleep(500);
    const result = await brokerFetch<{ found: boolean; content?: string }>(
      `/message/response/${self.id}/${msgId}`
    );
    if (result.found && result.content) {
      console.log(`\n✅ Respuesta de ${targetPeer.role}:\n${result.content}`);
      return;
    }
  }
  console.log(`⏰ Timeout — sin respuesta de ${targetPeer.role}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
