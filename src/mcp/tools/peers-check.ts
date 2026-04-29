import { getCurrentPeerId } from "../lifecycle";
import { readPendingMessages, markMessageRead } from "../storage/message-queue";
import { formatForAgent } from "../security";

export async function peersCheckTool(): Promise<object> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { pending: [] };

  const messages = await readPendingMessages(selfId);

  // Marcar todos como leídos
  for (const msg of messages) {
    await markMessageRead(selfId, msg.id);
  }

  // Formatear para el agente
  const formatted = messages.map(msg => ({
    id: msg.id,
    from: msg.from_role,
    from_agent: msg.from_agent,
    type: msg.type,
    content: formatForAgent(msg),
    created_at: msg.created_at,
  }));

  return { pending: formatted, count: formatted.length };
}
