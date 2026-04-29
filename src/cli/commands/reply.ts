import { ensureBroker, brokerFetch } from "../../broker/launcher";
import { getSessionPeer } from "../session";
import { BrokerMessage } from "../../broker/types";

export async function replyCommand(messageId: string, content: string): Promise<void> {
  await ensureBroker();
  const self = await getSessionPeer();
  if (!self) {
    console.error("❌ No estás registrado");
    process.exit(1);
  }

  // Obtener mensajes pendientes para encontrar el mensaje original
  const messages = await brokerFetch<BrokerMessage[]>(`/message/poll/${self.id}`);
  const original = messages.find(m => m.id === messageId);
  if (!original) {
    console.error(`❌ Mensaje no encontrado: ${messageId}`);
    process.exit(1);
  }

  await brokerFetch(`/message/response/${original.from_id}/${messageId}`, {
    method: "POST",
    body: JSON.stringify({ content, from_id: self.id, from_role: self.role, from_agent: self.agent }),
  });

  console.log(`✅ Respuesta enviada a ${original.from_role}`);
}
