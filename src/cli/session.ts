import { readFile } from "fs/promises";
import { join } from "path";
import { DATA_DIR } from "../shared/constants";
import { readPeer } from "../mcp/storage/peer-registry";
import { Peer } from "../shared/types";

export async function getSessionPeer(): Promise<Peer | null> {
  try {
    const raw = await readFile(join(DATA_DIR, "session.json"), "utf-8");
    const { peer_id } = JSON.parse(raw);
    return await readPeer(peer_id);
  } catch {
    return null;
  }
}
