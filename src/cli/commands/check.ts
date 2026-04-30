import { ensureBroker, brokerFetch } from "../../broker/launcher";
import { getSessionPeer } from "../session";
import { BrokerMessage } from "../../broker/types";

export async function checkCommand(): Promise<void> {
  await ensureBroker();
  const self = await getSessionPeer();
  if (!self) {
    console.error("❌ No estás registrado");
    process.exit(1);
  }

  const messages = await brokerFetch<BrokerMessage[]>(`/message/poll/${self.id}`);
  if (messages.length === 0) {
    console.log("📭 Sin mensajes pendientes");
    return;
  }

  console.log(`📬 ${messages.length} mensaje(s):\n`);
  for (const msg of messages) {
    console.log("─".repeat(60));
    console.log(`De: ${msg.from_role} (${msg.from_agent})`);
    console.log(`ID: ${msg.id}`);
    console.log(`Tipo: ${msg.type}`);
    console.log(`\n${msg.content}\n`);
    console.log(`Para responder: agents-mesh reply ${msg.id} "tu respuesta"`);
    console.log();
  }
}
