import { listPeers, readPeer } from "../storage/peer-registry";
import { enqueueMessage, readResponse, deleteResponse, deleteMessage } from "../storage/message-queue";
import { logActivity } from "../storage/activity-log";
import { getCurrentPeerId } from "../lifecycle";
import { validateMessage } from "../security";
import { Message, SearchMatch } from "../../shared/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function peersSearchTool(args: {
  topic: string;
  timeout_seconds?: number;
}): Promise<object> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { matches: [] };

  const self = await readPeer(selfId);
  if (!self) return { matches: [] };

  const peers = await listPeers({ exclude_self: true });
  if (peers.length === 0) return { matches: [] };

  const timeoutSec = args.timeout_seconds ?? TTL_S;
  const searchQuestion = `[SEARCH] ¿Tienes contexto relevante sobre: "${args.topic}"? Responde con un JSON: {"relevance": "high"|"medium"|"low"|"none", "summary": "breve descripción de qué sabes"}`;

  // Enviar pregunta de búsqueda a todos los peers en paralelo
  const msgIds = new Map<string, string>(); // peerId -> msgId
  for (const peer of peers) {
    const msgId = generateId("srch");
    const msg: Message = {
      id: msgId,
      from: selfId,
      from_role: self.role,
      from_agent: self.agent,
      to: peer.id,
      to_role: peer.role,
      type: "search",
      content: searchQuestion,
      metadata: { timeout_seconds: timeoutSec, reply_to: null },
      created_at: now(),
      expires_at: expiresAt(timeoutSec),
      read_at: null,
      responded_at: null,
    };
    const validation = validateMessage(msg);
    if (validation.valid) {
      await enqueueMessage(msg);
      msgIds.set(peer.id, msgId);
    }
  }

  // Esperar respuestas con timeout
  const deadline = Date.now() + timeoutSec * 1000;
  const matches: SearchMatch[] = [];
  const pending = new Set(peers.map(p => p.id));

  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(500);
    for (const peerId of [...pending]) {
      const msgId = msgIds.get(peerId)!;
      const response = await readResponse(selfId, msgId);
      if (response !== null) {
        pending.delete(peerId);
        await deleteResponse(selfId, msgId);
        const peer = peers.find(p => p.id === peerId)!;

        try {
          const parsed = JSON.parse(response);
          if (parsed.relevance && parsed.relevance !== "none") {
            matches.push({
              peer_id: peerId,
              peer_role: peer.role,
              peer_agent: peer.agent,
              relevance: parsed.relevance,
              summary: parsed.summary ?? response.slice(0, 200),
            });
          }
        } catch {
          // Respuesta no-JSON: asumir relevancia media
          matches.push({
            peer_id: peerId,
            peer_role: peer.role,
            peer_agent: peer.agent,
            relevance: "medium",
            summary: response.slice(0, 200),
          });
        }
      }
    }
  }

  // Limpiar mensajes sin respuesta
  for (const [peerId, msgId] of msgIds) {
    if (pending.has(peerId)) {
      await deleteMessage(peerId, msgId);
    }
  }

  // Ordenar por relevancia
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  matches.sort((a, b) => (order[a.relevance] ?? 3) - (order[b.relevance] ?? 3));

  return { matches };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
