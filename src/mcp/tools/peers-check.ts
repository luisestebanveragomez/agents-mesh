import { getPendingMessages, clearPendingMessages } from "../lifecycle";
import { formatForAgent } from "../security";
import { BrokerMessage } from "../../broker/types";

export async function peersCheckTool(): Promise<object> {
  const messages = [...getPendingMessages()];
  clearPendingMessages();

  const formatted = messages.map(msg => ({
    id: msg.id,
    from: msg.from_role,
    from_agent: msg.from_agent,
    type: msg.type,
    content: formatForAgent({
      id: msg.id, from: msg.from_id, from_role: msg.from_role, from_agent: msg.from_agent as any,
      to: msg.to_id, to_role: msg.to_role, type: msg.type as any, content: msg.content,
      metadata: {}, created_at: msg.created_at, expires_at: msg.expires_at,
      read_at: null, responded_at: null,
    }),
    created_at: msg.created_at,
  }));

  return { pending: formatted, count: formatted.length };
}
