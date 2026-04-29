import { ensureBroker, brokerFetch } from "../../broker/launcher";
import { BrokerPeer } from "../../broker/types";

export async function listCommand(): Promise<void> {
  await ensureBroker();
  const peers = await brokerFetch<BrokerPeer[]>("/peers");

  if (peers.length === 0) {
    console.log("Sin peers activos");
    return;
  }

  console.log(`\n🤖 Peers activos (${peers.length}):\n`);
  for (const peer of peers) {
    const icon = peer.status === "working" ? "🟢" : peer.status === "waiting" ? "🟡" : "⚫";
    console.log(`  ${icon} ${peer.id}`);
    console.log(`     Role:   ${peer.role}`);
    console.log(`     Agent:  ${peer.agent} ${peer.agent_version}`);
    console.log(`     Path:   ${peer.path}`);
    if (peer.current_task) console.log(`     Task:   ${peer.current_task}`);
    console.log();
  }
}
