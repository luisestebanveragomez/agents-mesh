import { getCurrentPeerId } from "../lifecycle";
import { updatePeerStatus } from "../storage/peer-registry";
import { logActivity } from "../storage/activity-log";
import { PeerStatus } from "../../shared/types";

export async function peersStatusTool(args: {
  role?: string;
  current_task?: string;
  status?: PeerStatus;
}): Promise<object> {
  const id = getCurrentPeerId();
  if (!id) return { error: "No peer registrado en esta sesión" };

  await updatePeerStatus(id, {
    role: args.role,
    current_task: args.current_task,
    status: args.status,
  });

  if (args.current_task || args.status) {
    await logActivity("peer_status", id, args.status ?? "", args.current_task ?? "");
  }

  return { updated: true, id };
}
