import { ensureBroker, brokerFetch } from "../../broker/launcher";
import { getSessionPeer } from "../session";
import { BrokerPeer, BrokerMessage } from "../../broker/types";
import { generateId, now, expiresAt } from "../../shared/utils";
import { TTL_S } from "../../shared/constants";

export async function notifyCommand(message: string, category = "info"): Promise<void> {
  await ensureBroker();
  const self = await getSessionPeer();
  if (!self) {
    console.error("❌ No estás registrado");
    process.exit(1);
  }

  const peers = await brokerFetch<BrokerPeer[]>("/peers");
  const targets = peers.filter(p => p.id !== self.id);
  if (targets.length === 0) {
    console.log("Sin otros peers activos");
    return;
  }

  for (const target of targets) {
    await brokerFetch("/message/send", {
      method: "POST",
      body: JSON.stringify({
        id: generateId("msg"), from_id: self.id, from_role: self.role, from_agent: self.agent,
        to_id: target.id, to_role: target.role, type: "notify",
        content: message, metadata: JSON.stringify({ category }),
        created_at: now(), expires_at: expiresAt(TTL_S * 4),
      } as BrokerMessage),
    });
  }
  console.log(`✅ Notificación enviada a ${targets.length} peer(s)`);
}
