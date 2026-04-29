import { getCurrentPeerId } from "../lifecycle";
import { brokerFetch } from "../../broker/launcher";
import { BrokerPeer, BrokerMessage } from "../../broker/types";
import { validateMessage } from "../security";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";
import { SearchMatch } from "../../shared/types";

export async function peersSearchTool(args: {
  topic: string;
  timeout_seconds?: number;
}): Promise<object> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { matches: [] };

  const peers = await brokerFetch<BrokerPeer[]>("/peers");
  const self = peers.find(p => p.id === selfId);
  if (!self) return { matches: [] };

  const others = peers.filter(p => p.id !== selfId);
  if (others.length === 0) return { matches: [] };

  const timeoutSec = args.timeout_seconds ?? TTL_S;
  const searchQ = `[SEARCH] ¿Tienes contexto sobre: "${args.topic}"? Responde JSON: {"relevance":"high"|"medium"|"low"|"none","summary":"..."}`;

  const msgIds = new Map<string, string>();
  for (const peer of others) {
    const msgId = generateId("srch");
    const validation = validateMessage({
      id: msgId, from: selfId, from_role: self.role, from_agent: self.agent as any,
      to: peer.id, to_role: peer.role, type: "search", content: searchQ,
      metadata: {}, created_at: now(), expires_at: expiresAt(timeoutSec),
      read_at: null, responded_at: null,
    });
    if (validation.valid) {
      await brokerFetch("/message/send", {
        method: "POST",
        body: JSON.stringify({
          id: msgId, from_id: selfId, from_role: self.role, from_agent: self.agent,
          to_id: peer.id, to_role: peer.role, type: "search",
          content: searchQ, metadata: "{}", created_at: now(), expires_at: expiresAt(timeoutSec),
        } as BrokerMessage),
      });
      msgIds.set(peer.id, msgId);
    }
  }

  const deadline = Date.now() + timeoutSec * 1000;
  const matches: SearchMatch[] = [];
  const pending = new Set(msgIds.keys());

  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(500);
    for (const peerId of [...pending]) {
      const msgId = msgIds.get(peerId)!;
      const result = await brokerFetch<{ found: boolean; content?: string }>(
        `/message/response/${selfId}/${msgId}`
      );
      if (result.found && result.content) {
        pending.delete(peerId);
        const peer = others.find(p => p.id === peerId)!;
        try {
          const parsed = JSON.parse(result.content);
          if (parsed.relevance && parsed.relevance !== "none") {
            matches.push({ peer_id: peerId, peer_role: peer.role, peer_agent: peer.agent as any, relevance: parsed.relevance, summary: parsed.summary ?? result.content.slice(0, 200) });
          }
        } catch {
          matches.push({ peer_id: peerId, peer_role: peer.role, peer_agent: peer.agent as any, relevance: "medium", summary: result.content.slice(0, 200) });
        }
      }
    }
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  matches.sort((a, b) => (order[a.relevance] ?? 3) - (order[b.relevance] ?? 3));
  return { matches };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
