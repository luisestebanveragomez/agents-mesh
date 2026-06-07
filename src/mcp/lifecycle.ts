import { ensureBroker, brokerFetch, setPeerToken } from "../broker/launcher";
import { detectAgent } from "./agent-detector";
import { inferRole } from "./role-inferrer";
import { generateId, now } from "../shared/utils";
import { HEARTBEAT_MS, BROKER_POLL_MS } from "../shared/constants";
import { BrokerPeer, BrokerMessage } from "../broker/types";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// C4: use ~/.agents-mesh/peers/ instead of /tmp/ to avoid world-writable symlink attacks
const PEER_MAP_DIR = join(homedir(), ".agents-mesh", "peers");

function writePeerMap(peerId: string): void {
  try {
    mkdirSync(PEER_MAP_DIR, { recursive: true, mode: 0o700 }); // C4: private dir
    writeFileSync(join(PEER_MAP_DIR, String(process.ppid)), peerId, { encoding: "utf-8", mode: 0o600 }); // C4: private file
  } catch {}
}

function removePeerMap(): void {
  try { rmSync(join(PEER_MAP_DIR, String(process.ppid)), { force: true }); } catch {}
}

let currentPeerId: string | null = null;
let cleanupDone = false;

// Callback set by server.ts to trigger sendToolListChanged()
let toolListChangedNotifier: (() => void) | null = null;

// Cola de mensajes pendientes detectados por el polling
const pendingMessages: BrokerMessage[] = [];

// Mensajes ya entregados al agente vía middleware, esperando peers_reply
export const deliveredMessages = new Map<string, BrokerMessage>();

export function getCurrentPeerId(): string | null {
  return currentPeerId;
}

export function _setCurrentPeerIdForTesting(id: string | null): void {
  currentPeerId = id;
}

export function getPendingMessages(): BrokerMessage[] {
  return pendingMessages;
}

export function getPendingCount(): number {
  return pendingMessages.length;
}

export function getDeliveredMessage(id: string): BrokerMessage | undefined {
  return deliveredMessages.get(id);
}

export function removeDeliveredMessage(id: string): void {
  deliveredMessages.delete(id);
}

export async function emitProgressSignals(
  fetch: (path: string, opts?: RequestInit) => Promise<unknown> = brokerFetch
): Promise<void> {
  await Promise.all(
    Array.from(deliveredMessages.keys()).map(msgId =>
      fetch(`/message/progress/${msgId}`, { method: "POST" }).catch(() => {})
    )
  );
}

export function moveToDelivered(): void {
  for (const msg of pendingMessages) {
    deliveredMessages.set(msg.id, msg);
  }
  pendingMessages.length = 0;
}

export function clearPendingMessages(): void {
  moveToDelivered();
}

// Set by server.ts after creating the MCP server instance
export function setToolListChangedNotifier(fn: () => void): void {
  toolListChangedNotifier = fn;
}

export async function startPeer(): Promise<string> {
  await ensureBroker();

  const id = generateId("peer");
  const agent = detectAgent();
  const role = await inferRole(process.cwd());

  let gitBranch: string | undefined;
  try {
    const { execSync } = await import("child_process");
    gitBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
  } catch {}

  const peer: BrokerPeer = {
    id,
    role,
    path: process.cwd(),
    pid: process.pid,
    agent: agent.name,
    agent_version: agent.version,
    started_at: now(),
    last_heartbeat: now(),
    status: "idle",
    git_branch: gitBranch,
  };

  const registerRes = await brokerFetch<{ ok: boolean; token: string }>("/peer/register", {
    method: "POST",
    body: JSON.stringify(peer),
  });

  // C3: store token so all subsequent brokerFetch calls are authenticated
  if (registerRes.token) setPeerToken(registerRes.token);

  currentPeerId = id;
  writePeerMap(id);

  // Heartbeat cada 15s
  const heartbeatTimer = setInterval(async () => {
    try {
      await brokerFetch("/peer/heartbeat", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    } catch {}
  }, HEARTBEAT_MS);

  let pollTick = 0;
  // Polling de mensajes cada 1s
  const pollTimer = setInterval(async () => {
    if (!currentPeerId) return;
    // Emit progress signals every 5 ticks for each in-flight Ask
    if (++pollTick % 5 === 0) emitProgressSignals();
    try {
      const messages = await brokerFetch<BrokerMessage[]>(`/message/poll/${id}`);
      if (messages.length === 0) return;

      for (const msg of messages) {
        // L1: cap in-memory buffer to prevent OOM
        if (pendingMessages.length < 1000) {
          pendingMessages.push(msg);
        }
        // ACK automático: avisar al emisor que el mensaje fue recibido
        if (msg.type === "ask" || msg.type === "notify") {
          brokerFetch(`/message/ack/${msg.id}`, { method: "POST" }).catch(() => {});
        }
      }

      // Notify the MCP client that tools list changed (triggers re-fetch of descriptions)
      toolListChangedNotifier?.();

    } catch {}
  }, BROKER_POLL_MS);

  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
    removePeerMap();
    try {
      await brokerFetch(`/peer/${id}`, { method: "DELETE" });
    } catch {}
    currentPeerId = null;
  };

  process.on("SIGTERM", () => { cleanup().then(() => process.exit(0)); });
  process.on("SIGINT",  () => { cleanup().then(() => process.exit(0)); });
  process.on("beforeExit", async () => { await cleanup(); });

  return id;
}

export async function stopPeer(): Promise<void> {
  if (currentPeerId) {
    try {
      await brokerFetch(`/peer/${currentPeerId}`, { method: "DELETE" });
    } catch {}
    currentPeerId = null;
  }
}
