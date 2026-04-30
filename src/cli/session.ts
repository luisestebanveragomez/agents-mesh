import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { brokerFetch } from "../broker/launcher";
import { BrokerPeer } from "../broker/types";

const SESSION_FILE = join(homedir(), ".agents-mesh-session.json");

export async function getSessionPeer(): Promise<BrokerPeer | null> {
  try {
    const raw = await readFile(SESSION_FILE, "utf-8");
    const { peer_id } = JSON.parse(raw);
    if (!peer_id) return null;
    const peers = await brokerFetch<BrokerPeer[]>("/peers");
    return peers.find(p => p.id === peer_id) ?? null;
  } catch {
    return null;
  }
}
