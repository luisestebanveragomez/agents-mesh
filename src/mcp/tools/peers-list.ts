import { listPeers } from "../storage/peer-registry";
import { PeerFilter } from "../../shared/types";

export async function peersListTool(args: { filter?: PeerFilter }): Promise<object> {
  const peers = await listPeers(args.filter);
  return { peers };
}
