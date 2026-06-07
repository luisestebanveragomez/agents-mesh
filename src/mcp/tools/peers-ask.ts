import { getCurrentPeerId } from "../lifecycle";
import { brokerFetch } from "../../broker/launcher";
import { validateMessage } from "../security";
import { BrokerPeer, BrokerMessage } from "../../broker/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";
import { AskResult } from "../../shared/types";

// Max wait times depending on target status
const TIMEOUT_BY_STATUS: Record<string, number> = {
  idle:    120,   // 2 min — should respond quickly
  working: 600,   // 10 min — busy, give it time
  waiting: 300,   // 5 min — waiting on something else
};

// How long to wait for ACK before giving up (peer likely dead)
const ACK_TIMEOUT_S = 30;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForAck(msgId: string, deadlineMs: number): Promise<boolean> {
  while (Date.now() < deadlineMs) {
    await sleep(500);
    try {
      const result = await brokerFetch<{ acked: boolean }>(`/message/ack/${msgId}`);
      if (result.acked) return true;
    } catch {}
  }
  return false;
}

async function isPeerAlive(peerId: string): Promise<{ alive: boolean; status: string }> {
  try {
    const peers = await brokerFetch<BrokerPeer[]>("/peers");
    const peer = peers.find(p => p.id === peerId);
    if (!peer) return { alive: false, status: "dead" };
    return { alive: true, status: peer.status };
  } catch {
    return { alive: false, status: "dead" };
  }
}

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

  const target = peers.find(p => p.id === args.target || p.role === args.target);
  if (!target) return { answered: false };

  // Adaptive timeout: use explicit override, or derive from target's current status
  const adaptiveTimeout = args.timeout_seconds ?? TIMEOUT_BY_STATUS[target.status] ?? TTL_S;
  const msgId = generateId("msg");

  const validation = validateMessage({
    id: msgId, from: selfId, from_role: self.role, from_agent: self.agent as any,
    to: target.id, to_role: target.role, type: "ask", content: args.question,
    metadata: {}, created_at: now(), expires_at: expiresAt(adaptiveTimeout),
    read_at: null, responded_at: null,
  });
  if (!validation.valid) return { answered: false };

  await brokerFetch("/message/send", {
    method: "POST",
    body: JSON.stringify({
      id: msgId, from_id: selfId, from_role: self.role, from_agent: self.agent,
      to_id: target.id, to_role: target.role, type: "ask",
      content: args.question,
      metadata: JSON.stringify({ search_if_unknown: args.search_if_unknown, search_scope: args.search_scope }),
      created_at: now(), expires_at: expiresAt(adaptiveTimeout),
    } as BrokerMessage),
  });

  // Phase 1: wait for ACK (confirms B is alive and received the message)
  const ackDeadline = Date.now() + ACK_TIMEOUT_S * 1000;
  const acked = await waitForAck(msgId, ackDeadline);

  if (!acked) {
    // B never acknowledged — check if it's still alive
    const { alive, status } = await isPeerAlive(target.id);
    if (!alive) {
      return { answered: false, timeout: true, error: `Peer ${target.role} is no longer active` };
    }
    // Alive but no ACK yet — it may not have polled yet, continue waiting
  }

  // Phase 2: wait for response using floor + silence timer + hard cap
  const ackAt = Date.now();
  const floorDeadline   = ackAt + adaptiveTimeout * 1000;
  const hardCapDeadline = ackAt + 30 * 60 * 1000;
  let lastProgressAt    = ackAt;

  while (Date.now() < hardCapDeadline) {
    await sleep(500);

    const result = await brokerFetch<{ found: boolean; content?: string; last_progress_at?: string; progress_count?: number }>(
      `/message/response/${selfId}/${msgId}`
    );
    if (result.found && result.content) {
      return {
        answered: true,
        answer: result.content,
        answered_by: target.id,
        answered_by_agent: target.agent as any,
      };
    }

    if (result.last_progress_at) {
      lastProgressAt = new Date(result.last_progress_at).getTime();
    }

    const silenceMs = Number(process.env.AGENTS_MESH_PROGRESS_SILENCE_MS) || 30_000;
    const silenceDeadline = lastProgressAt + silenceMs;
    if (Date.now() > floorDeadline && Date.now() > silenceDeadline) {
      return { answered: false, timeout: true, error: "no progress" };
    }
  }

  return { answered: false, timeout: true, error: "hard cap" };
}
