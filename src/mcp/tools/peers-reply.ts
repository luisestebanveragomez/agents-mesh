import { getCurrentPeerId } from "../lifecycle";
import { brokerFetch } from "../../broker/launcher";
import { getPendingMessages } from "../lifecycle";

export async function peersReplyTool(args: {
  message_id: string;
  content: string;
}): Promise<object> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { error: "No peer registrado" };

  // Buscar el mensaje en los pendientes para saber el from
  const pending = getPendingMessages();
  const original = pending.find(m => m.id === args.message_id);
  if (!original) return { error: "Mensaje no encontrado o ya respondido", message_id: args.message_id };

  // Obtener info del peer actual del broker
  const peers = await brokerFetch<{ id: string; role: string; agent: string }[]>("/peers");
  const self = peers.find(p => p.id === selfId);

  await brokerFetch(`/message/response/${original.from_id}/${args.message_id}`, {
    method: "POST",
    body: JSON.stringify({
      content: args.content,
      from_id: selfId,
      from_role: self?.role ?? "unknown",
      from_agent: self?.agent ?? "unknown",
    }),
  });

  return { sent: true, to: original.from_id };
}
