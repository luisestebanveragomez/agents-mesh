import { generateId, now, secondsAgo } from "../shared/utils";
import { detectAgent } from "./agent-detector";
import { inferRole } from "./role-inferrer";
import { writePeer, deletePeer, updateHeartbeat, listPeers, cleanDeadPeers, ensureDirectories } from "./storage/peer-registry";
import { logActivity } from "./storage/activity-log";
import { Peer } from "../shared/types";
import { HEARTBEAT_MS, POLL_MS, DEAD_PEER_THRESHOLD_S } from "../shared/constants";

let currentPeerId: string | null = null;

export function getCurrentPeerId(): string | null {
  return currentPeerId;
}

export async function startPeer(): Promise<string> {
  await ensureDirectories();

  const id = generateId("peer");
  const agent = detectAgent();
  const role = await inferRole(process.cwd());

  let gitBranch: string | undefined;
  try {
    const { execSync } = await import("child_process");
    gitBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
  } catch {
    gitBranch = undefined;
  }

  const peer: Peer = {
    id,
    role,
    path: process.cwd(),
    pid: process.pid,
    agent: agent.name as Peer["agent"],
    agent_version: agent.version,
    started_at: now(),
    last_heartbeat: now(),
    status: "idle",
    git_branch: gitBranch,
  };

  await writePeer(peer);
  await logActivity("peer_join", id, role, agent.name, process.cwd());

  currentPeerId = id;

  // Heartbeat
  const heartbeatTimer = setInterval(() => updateHeartbeat(id), HEARTBEAT_MS);

  // Cleanup de peers muertos
  const cleanupTimer = setInterval(async () => {
    const removed = await cleanDeadPeers();
    for (const deadId of removed) {
      await logActivity("peer_timeout", deadId);
    }
  }, 60_000);

  // Cleanup al salir
  const cleanup = async () => {
    clearInterval(heartbeatTimer);
    clearInterval(cleanupTimer);
    await deletePeer(id);
    await logActivity("peer_leave", id, role, agent.name);
    currentPeerId = null;
  };

  process.on("SIGTERM", () => { cleanup().then(() => process.exit(0)); });
  process.on("SIGINT",  () => { cleanup().then(() => process.exit(0)); });
  // Note: 'exit' event is synchronous, use beforeExit for async
  process.on("beforeExit", async () => { await cleanup(); });

  return id;
}

export async function stopPeer(): Promise<void> {
  if (currentPeerId) {
    await deletePeer(currentPeerId);
    currentPeerId = null;
  }
}
