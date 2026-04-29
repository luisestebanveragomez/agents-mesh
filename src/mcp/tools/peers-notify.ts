import { getCurrentPeerId } from "../lifecycle";
import { brokerFetch } from "../../broker/launcher";
import { BrokerPeer, BrokerMessage } from "../../broker/types";
import { validateMessage } from "../security";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function peersNotifyTool(args: {
  target: string | string[];
  message: string;
  category?: string;
}): Promise<object> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { error: "No peer registrado" };

  const peers = await brokerFetch<BrokerPeer[]>("/peers");
  const self = peers.find(p => p.id === selfId);
  if (!self) return { error: "Peer no encontrado" };

  let targets: BrokerPeer[] = [];
  if (args.target === "all") {
    targets = peers.filter(p => p.id !== selfId);
  } else {
    const ts = Array.isArray(args.target) ? args.target : [args.target];
    targets = peers.filter(p => ts.includes(p.id) || ts.includes(p.role));
  }

  const delivered: string[] = [];
  for (const target of targets) {
    const msgId = generateId("msg");
    const validation = validateMessage({
      id: msgId, from: selfId, from_role: self.role, from_agent: self.agent as any,
      to: target.id, to_role: target.role, type: "notify", content: args.message,
      metadata: {}, created_at: now(), expires_at: expiresAt(TTL_S * 4),
      read_at: null, responded_at: null,
    });
    if (validation.valid) {
      await brokerFetch("/message/send", {
        method: "POST",
        body: JSON.stringify({
          id: msgId, from_id: selfId, from_role: self.role, from_agent: self.agent,
          to_id: target.id, to_role: target.role, type: "notify",
          content: args.message, metadata: JSON.stringify({ category: args.category ?? "info" }),
          created_at: now(), expires_at: expiresAt(TTL_S * 4),
        } as BrokerMessage),
      });
      delivered.push(target.id);
    }
  }

  return { delivered_to: delivered };
}
