import { updatePeerStatus } from "../../mcp/storage/peer-registry";
import { PeerStatus } from "../../shared/types";

export async function statusCommand(options: {
  status?: PeerStatus;
  task?: string;
  role?: string;
}): Promise<void> {
  const { getSessionPeer } = await import("../session");
  const self = await getSessionPeer();

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
