import { ensureBroker, brokerFetch } from "../broker/launcher";
import { detectAgent } from "./agent-detector";
import { inferRole } from "./role-inferrer";
import { generateId, now } from "../shared/utils";
import { HEARTBEAT_MS, BROKER_POLL_MS } from "../shared/constants";
import { BrokerPeer, BrokerMessage } from "../broker/types";
import { formatForAgent } from "./security";

let currentPeerId: string | null = null;
let cleanupDone = false;

// Cola de mensajes pendientes detectados por el polling
const pendingMessages: BrokerMessage[] = [];

// Mensajes ya entregados al agente vía middleware, esperando peers_reply
const deliveredMessages = new Map<string, BrokerMessage>();

export function getCurrentPeerId(): string | null {
  return currentPeerId;
}

export function getPendingMessages(): BrokerMessage[] {
  return pendingMessages;
}

export function getDeliveredMessage(id: string): BrokerMessage | undefined {
  return deliveredMessages.get(id);
}

export function removeDeliveredMessage(id: string): void {
  deliveredMessages.delete(id);
}

export function moveToDelivered(): void {
  // Mueve mensajes de pendingMessages a deliveredMessages y limpia la cola
  for (const msg of pendingMessages) {
    deliveredMessages.set(msg.id, msg);
  }
  pendingMessages.length = 0;
}

export function clearPendingMessages(): void {
  moveToDelivered();
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

  await brokerFetch("/peer/register", {
    method: "POST",
    body: JSON.stringify(peer),
  });

  currentPeerId = id;

  // Heartbeat cada 15s
  const heartbeatTimer = setInterval(async () => {
    try {
      await brokerFetch("/peer/heartbeat", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    } catch {}
  }, HEARTBEAT_MS);

  // Polling de mensajes cada 1s
  const pollTimer = setInterval(async () => {
    if (!currentPeerId) return;
    try {
      const messages = await brokerFetch<BrokerMessage[]>(`/message/poll/${id}`);
      for (const msg of messages) {
        pendingMessages.push(msg);
      }
    } catch {}
  }, BROKER_POLL_MS);

  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
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
