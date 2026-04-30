import { ensureBroker, brokerFetch } from "../broker/launcher";
import { inferRole } from "../mcp/role-inferrer";
import { generateId, now } from "../shared/utils";
import { HEARTBEAT_MS } from "../shared/constants";
import { BrokerPeer } from "../broker/types";
import { writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const SESSION_FILE = join(homedir(), ".agents-mesh-session.json");

export async function register(options: {
  agent?: string;
  role?: string;
  detach?: boolean;
}): Promise<void> {
  await ensureBroker();

  const agentName = options.agent ?? process.env.AGENTS_MESH_AGENT ?? "unknown";
  const role = options.role ?? await inferRole(process.cwd());
  const id = generateId("peer");

  const peer: BrokerPeer = {
    id,
    role,
    path: process.cwd(),
    pid: process.pid,
    agent: agentName,
    agent_version: process.env.AGENTS_MESH_AGENT_VERSION ?? "unknown",
    started_at: now(),
    last_heartbeat: now(),
    status: "idle",
  };

  await brokerFetch("/peer/register", {
    method: "POST",
    body: JSON.stringify(peer),
  });

  // Guardar sesión localmente
  await writeFile(SESSION_FILE, JSON.stringify({ peer_id: id, pid: process.pid }), "utf-8");

  console.log(`✅ Peer registrado: ${id}`);
  console.log(`   Role:  ${role}`);
  console.log(`   Agent: ${agentName}`);
  console.log(`   Path:  ${process.cwd()}`);

  if (!options.detach) {
    const timer = setInterval(async () => {
      try {
        await brokerFetch("/peer/heartbeat", {
          method: "POST",
          body: JSON.stringify({ id }),
        });
      } catch {}
    }, HEARTBEAT_MS);

    const cleanup = async () => {
      clearInterval(timer);
      try {
        await brokerFetch(`/peer/${id}`, { method: "DELETE" });
        await writeFile(SESSION_FILE, "{}", "utf-8").catch(() => {});
      } catch {}
      console.log(`\n👋 Peer ${id} eliminado`);
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    console.log(`\n🔄 Heartbeat activo (Ctrl+C para salir)`);
    await new Promise(() => {});
  }
}
