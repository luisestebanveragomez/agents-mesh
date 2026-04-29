import { readPeer, listPeers } from "../storage/peer-registry";
import { enqueueMessage, readResponse, deleteResponse, deleteMessage } from "../storage/message-queue";
import { validateMessage } from "../security";
import { logActivity } from "../storage/activity-log";
import { getCurrentPeerId } from "../lifecycle";
import { Message, AskResult } from "../../shared/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function peersAskTool(args: {
  target: string;
  question: string;
  search_if_unknown?: boolean;
  search_scope?: string;
  timeout_seconds?: number;
}): Promise<AskResult> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { answered: false, timeout: false };

  const self = await readPeer(selfId);
  if (!self) return { answered: false, timeout: false };

  // Resolver target: puede ser un ID directo o un role
  let targetPeer = await readPeer(args.target);
  if (!targetPeer) {
    const peers = await listPeers({ exclude_self: true });
    targetPeer = peers.find(p => p.role === args.target || p.id === args.target) ?? null;
  }
  if (!targetPeer) {
    return { answered: false, timeout: false };
  }

  const msgId = generateId("msg");
  const timeoutSec = args.timeout_seconds ?? TTL_S;

  const msg: Message = {
    id: msgId,
    from: selfId,
    from_role: self.role,
    from_agent: self.agent,
    to: targetPeer.id,
    to_role: targetPeer.role,
    type: "ask",
    content: args.question,
    metadata: {
      search_if_unknown: args.search_if_unknown ?? false,
      search_scope: args.search_scope,
      timeout_seconds: timeoutSec,
      reply_to: null,
    },
    created_at: now(),
    expires_at: expiresAt(timeoutSec),
    read_at: null,
    responded_at: null,
  };

  const validation = validateMessage(msg);
  if (!validation.valid) {
    return { answered: false, timeout: false };
  }

  await enqueueMessage(msg);
  await logActivity("message", `${selfId}→${targetPeer.id}`, "ask", args.question.slice(0, 100));

  // Polling para respuesta
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    await sleep(500);
    const response = await readResponse(selfId, msgId);
    if (response !== null) {
      await deleteResponse(selfId, msgId);
      await logActivity("message", `${targetPeer!.id}→${selfId}`, "reply", response.slice(0, 100));
      return {
        answered: true,
        answer: response,
        answered_by: targetPeer!.id,
        answered_by_agent: targetPeer!.agent,
      };
    }
  }

  await deleteMessage(targetPeer.id, msgId);
  return { answered: false, timeout: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
