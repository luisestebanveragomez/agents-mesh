import { getCurrentPeerId } from "../lifecycle";
import { brokerFetch } from "../../broker/launcher";
import { validateMessage } from "../security";
import { BrokerPeer, BrokerMessage } from "../../broker/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";
import { AskResult } from "../../shared/types";

export async function peersAskTool(args: {
  target: string;
  question: string;
  search_if_unknown?: boolean;
  search_scope?: string;
  timeout_seconds?: number;
}): Promise<AskResult> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { answered: false };

  const peers = await brokerFetch<BrokerPeer[]>("/peers");
  const self = peers.find(p => p.id === selfId);
  if (!self) return { answered: false };

  // Resolver target por ID o por role
  const target = peers.find(p => p.id === args.target || p.role === args.target);
  if (!target) return { answered: false };

  const msgId = generateId("msg");
  const timeoutSec = args.timeout_seconds ?? TTL_S;

  // Validar (usando el tipo Message compatible)
  const validation = validateMessage({
    id: msgId, from: selfId, from_role: self.role, from_agent: self.agent as any,
    to: target.id, to_role: target.role, type: "ask", content: args.question,
    metadata: {}, created_at: now(), expires_at: expiresAt(timeoutSec),
    read_at: null, responded_at: null,
  });
  if (!validation.valid) return { answered: false };

  await brokerFetch("/message/send", {
    method: "POST",
    body: JSON.stringify({
      id: msgId, from_id: selfId, from_role: self.role, from_agent: self.agent,
      to_id: target.id, to_role: target.role, type: "ask",
      content: args.question, metadata: JSON.stringify({ search_if_unknown: args.search_if_unknown, search_scope: args.search_scope }),
      created_at: now(), expires_at: expiresAt(timeoutSec),
    } as BrokerMessage),
  });

  // Polling para respuesta
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    await sleep(500);
    const result = await brokerFetch<{ found: boolean; content?: string }>(
      `/message/response/${selfId}/${msgId}`
    );
    if (result.found && result.content) {
      return { answered: true, answer: result.content, answered_by: target.id, answered_by_agent: target.agent as any };
    }
  }

  return { answered: false, timeout: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
