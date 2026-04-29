import { listPeers } from "../../mcp/storage/peer-registry";
import { PeerFilter } from "../../shared/types";

export async function listCommand(filter?: PeerFilter): Promise<void> {
  const peers = await listPeers(filter);

  if (peers.length === 0) {
    console.log("Sin peers activos");
    return;
  }

  console.log(`\n🤖 Peers activos (${peers.length}):\n`);
  for (const peer of peers) {
    const statusIcon = peer.status === "working" ? "🟢" : peer.status === "waiting" ? "🟡" : "⚫";
    console.log(`  ${statusIcon} ${peer.id}`);
    console.log(`     Role:   ${peer.role}`);
    console.log(`     Agent:  ${peer.agent} ${peer.agent_version}`);
    console.log(`     Path:   ${peer.path}`);
    if (peer.current_task) console.log(`     Task:   ${peer.current_task}`);
    console.log();
  }
}
