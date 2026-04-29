import { mkdir, writeFile, readFile, unlink, readdir } from "fs/promises";
import { join } from "path";
import { PEERS_DIR, MESSAGES_DIR, RESPONSES_DIR, LOCKS_DIR, DEAD_PEER_THRESHOLD_S } from "../../shared/constants";
import { Peer, PeerFilter } from "../../shared/types";
import { secondsAgo, now } from "../../shared/utils";

export async function ensureDirectories(): Promise<void> {
  await Promise.all([
    mkdir(PEERS_DIR, { recursive: true }),
    mkdir(MESSAGES_DIR, { recursive: true }),
    mkdir(RESPONSES_DIR, { recursive: true }),
    mkdir(LOCKS_DIR, { recursive: true }),
  ]);
}

export async function writePeer(peer: Peer): Promise<void> {
  await mkdir(PEERS_DIR, { recursive: true });
  const path = join(PEERS_DIR, `${peer.id}.peer`);
  await writeFile(path, JSON.stringify(peer, null, 2), "utf-8");
}

export async function readPeer(id: string): Promise<Peer | null> {
  try {
    const path = join(PEERS_DIR, `${id}.peer`);
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as Peer;
  } catch {
    return null;
  }
}

export async function deletePeer(id: string): Promise<void> {
  try {
    const path = join(PEERS_DIR, `${id}.peer`);
    await unlink(path);
  } catch {
    // si no existe, ignorar
  }
}

export async function listPeers(filter?: PeerFilter): Promise<Peer[]> {
  try {
    const files = await readdir(PEERS_DIR);
    const peerFiles = files.filter((f) => f.endsWith(".peer"));

    const peers: Peer[] = [];
    for (const file of peerFiles) {
      try {
        const raw = await readFile(join(PEERS_DIR, file), "utf-8");
        const peer = JSON.parse(raw) as Peer;

        // Only include live peers
        if (secondsAgo(peer.last_heartbeat) > DEAD_PEER_THRESHOLD_S) continue;

        // Apply filters
        if (filter) {
          if (filter.role && peer.role !== filter.role) continue;
          if (filter.agent && peer.agent !== filter.agent) continue;
          if (filter.path && !peer.path.startsWith(filter.path)) continue;
          if (filter.active_within !== undefined && secondsAgo(peer.last_heartbeat) > filter.active_within) continue;
          if (filter.exclude_self && peer.pid === process.pid) continue;
        }

        peers.push(peer);
      } catch {
        // skip unparseable files
      }
    }

    return peers;
  } catch {
    return [];
  }
}

export async function updateHeartbeat(id: string): Promise<void> {
  const peer = await readPeer(id);
  if (peer) {
    peer.last_heartbeat = now();
    await writePeer(peer);
  }
}

export async function updatePeerStatus(
  id: string,
  updates: Partial<Pick<Peer, "status" | "current_task" | "role">>
): Promise<void> {
  const peer = await readPeer(id);
  if (peer) {
    Object.assign(peer, updates);
    await writePeer(peer);
  }
}

export async function cleanDeadPeers(): Promise<string[]> {
  const removed: string[] = [];
  try {
    const files = await readdir(PEERS_DIR);
    for (const file of files.filter((f) => f.endsWith(".peer"))) {
      try {
        const raw = await readFile(join(PEERS_DIR, file), "utf-8");
        const peer = JSON.parse(raw) as Peer;
        if (secondsAgo(peer.last_heartbeat) > DEAD_PEER_THRESHOLD_S) {
          await unlink(join(PEERS_DIR, file));
          removed.push(peer.id);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // directory may not exist yet
  }
  return removed;
}
