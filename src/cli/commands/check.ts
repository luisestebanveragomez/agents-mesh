import { ensureBroker, brokerFetch } from "../../broker/launcher";
import { getSessionPeer } from "../session";
import { BrokerMessage } from "../../broker/types";

export async function checkCommand(): Promise<void> {
  await ensureBroker();
  const self = await getSessionPeer();
  if (!self) {
    console.error("❌ Not registered");
    process.exit(1);
  }

  const messages = await brokerFetch<BrokerMessage[]>(`/message/poll/${self.id}`);
  if (messages.length === 0) {
    console.log("📭 No pending messages");
    return;
  }

  console.log(`📬 ${messages.length} message(s):\n`);
  for (const msg of messages) {
    console.log("─".repeat(60));
    console.log(`From: ${msg.from_role} (${msg.from_agent})`);
    console.log(`ID:   ${msg.id}`);
    console.log(`Type: ${msg.type}`);
    console.log(`\n${msg.content}\n`);
    console.log(`To reply: agents-mesh reply ${msg.id} "your response"`);
    console.log();
  }
}
