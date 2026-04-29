import { readPeer, listPeers } from "../storage/peer-registry";
import { enqueueMessage } from "../storage/message-queue";
import { validateMessage } from "../security";
import { logActivity } from "../storage/activity-log";
import { getCurrentPeerId } from "../lifecycle";
import { Message, MessageCategory } from "../../shared/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function peersNotifyTool(args: {
  target: string | string[];
  message: string;
  category?: MessageCategory;
}): Promise<object> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { error: "No peer registrado" };

  const self = await readPeer(selfId);
  if (!self) return { error: "Peer no encontrado" };

  // Resolver targets
  let targetPeers = [];
  if (args.target === "all") {
    targetPeers = await listPeers({ exclude_self: true });
  } else {
    const targets = Array.isArray(args.target) ? args.target : [args.target];
    const allPeers = await listPeers({ exclude_self: true });
    for (const t of targets) {
      const found = allPeers.find(p => p.id === t || p.role === t);
      if (found) targetPeers.push(found);
    }
  }

  const deliveredTo: string[] = [];
  for (const target of targetPeers) {
    const msgId = generateId("msg");
    const msg: Message = {
      id: msgId,
      from: selfId,
      from_role: self.role,
      from_agent: self.agent,
      to: target.id,
      to_role: target.role,
      type: "notify",
      content: args.message,
      metadata: {
        category: args.category ?? "info",
        reply_to: null,
      },
      created_at: now(),
      expires_at: expiresAt(TTL_S * 4),
      read_at: null,
      responded_at: null,
    };

    const validation = validateMessage(msg);
    if (validation.valid) {
      await enqueueMessage(msg);
      deliveredTo.push(target.id);
      await logActivity("message", `${selfId}→${target.id}`, "notify", args.message.slice(0, 100));
    }
  }

  return { delivered_to: deliveredTo };
}
