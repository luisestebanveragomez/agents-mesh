import { ensureDirectories, writePeer, deletePeer, updateHeartbeat } from "../mcp/storage/peer-registry";
import { logActivity } from "../mcp/storage/activity-log";
import { inferRole } from "../mcp/role-inferrer";
import { generateId, now } from "../shared/utils";
import { HEARTBEAT_MS, DATA_DIR } from "../shared/constants";
import { Peer, AgentName } from "../shared/types";
import { join } from "path";
import { writeFile } from "fs/promises";

export async function register(options: {
  agent?: string;
  role?: string;
  detach?: boolean;
}): Promise<void> {
  await ensureDirectories();

  const agentName = (options.agent ?? process.env.CLAUDE_PEERS_AGENT ?? "unknown") as AgentName;
  const role = options.role ?? await inferRole(process.cwd());
  const id = generateId("peer");

  const peer: Peer = {
    id,
    role,
    path: process.cwd(),
    pid: process.pid,
    agent: agentName,
    agent_version: process.env.CLAUDE_PEERS_AGENT_VERSION ?? "unknown",
    started_at: now(),
    last_heartbeat: now(),
    status: "idle",
  };

  await writePeer(peer);
  await writeFile(join(DATA_DIR, "session.json"), JSON.stringify({ peer_id: id, pid: process.pid }), "utf-8");
  await logActivity("peer_join", id, role, agentName, process.cwd());

  console.log(`✅ Peer registrado: ${id}`);
  console.log(`   Role: ${role}`);
  console.log(`   Agent: ${agentName}`);
  console.log(`   Path: ${process.cwd()}`);

  if (!options.detach) {
    // Mantener el peer vivo con heartbeat hasta Ctrl+C
    const timer = setInterval(() => updateHeartbeat(id), HEARTBEAT_MS);

    const cleanup = async () => {
      clearInterval(timer);
      await deletePeer(id);
      await logActivity("peer_leave", id, role, agentName);
      await writeFile(join(DATA_DIR, "session.json"), JSON.stringify({}), "utf-8").catch(() => {});
      console.log(`\n👋 Peer ${id} eliminado`);
      process.exit(0);
    };

    process.on("SIGINT",  cleanup);
    process.on("SIGTERM", cleanup);

    console.log(`\n🔄 Heartbeat activo (Ctrl+C para salir)`);
    // Mantener el proceso vivo
    await new Promise(() => {}); // Infinity
  }
}
