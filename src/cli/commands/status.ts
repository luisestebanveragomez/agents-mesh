import { listPeers, updatePeerStatus } from "../../mcp/storage/peer-registry";
import { PeerStatus } from "../../shared/types";

export async function statusCommand(options: {
  status?: PeerStatus;
  task?: string;
  role?: string;
}): Promise<void> {
  const peers = await listPeers();
  const self = peers.find(p => p.pid === process.pid);

  if (!self) {
    console.error("❌ No estás registrado como peer");
    process.exit(1);
  }

  await updatePeerStatus(self.id, {
    status: options.status,
    current_task: options.task,
    role: options.role,
  });

  console.log("✅ Estado actualizado");
}
