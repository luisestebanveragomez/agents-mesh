import { serve } from "bun";
import { getDb, closeDb } from "./db";
import { BrokerPeer, BrokerMessage } from "./types";

const BROKER_PORT = Number(process.env.CLAUDE_PEERS_BROKER_PORT) || 7899;
const DEAD_PEER_THRESHOLD_S = 60;

function now(): string {
  return new Date().toISOString();
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // ── Health ──────────────────────────────────────────────
  if (path === "/health" && method === "GET") {
    return json({ ok: true, version: "0.1.0" });
  }

  // ── Peers ────────────────────────────────────────────────
  if (path === "/peers" && method === "GET") {
    const db = getDb();
    const threshold = new Date(Date.now() - DEAD_PEER_THRESHOLD_S * 1000).toISOString();
    const peers = db.query("SELECT * FROM peers WHERE last_heartbeat > ?").all(threshold);
    return json(peers);
  }

  if (path === "/peer/register" && method === "POST") {
    const body = await req.json() as BrokerPeer;
    const db = getDb();
    db.run(`
      INSERT OR REPLACE INTO peers
        (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, current_task, git_branch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [body.id, body.role, body.path, body.pid, body.agent, body.agent_version,
        body.started_at, body.last_heartbeat, body.status, body.current_task ?? null, body.git_branch ?? null]);
    logActivity("peer_join", [body.id, body.role, body.agent, body.path].join("|"));
    return json({ ok: true });
  }

  if (path === "/peer/heartbeat" && method === "POST") {
    const body = await req.json() as { id: string; status?: string; current_task?: string };
    const db = getDb();
    db.run(
      "UPDATE peers SET last_heartbeat = ?, status = COALESCE(?, status), current_task = COALESCE(?, current_task) WHERE id = ?",
      [now(), body.status ?? null, body.current_task ?? null, body.id]
    );
    return json({ ok: true });
  }

  if (path.startsWith("/peer/") && method === "DELETE") {
    const id = path.split("/")[2];
    const db = getDb();
    const peer = db.query("SELECT * FROM peers WHERE id = ?").get(id) as BrokerPeer | null;
    db.run("DELETE FROM peers WHERE id = ?", [id]);
    if (peer) logActivity("peer_leave", [id, peer.role, peer.agent].join("|"));
    return json({ ok: true });
  }

  if (path === "/peer/status" && method === "POST") {
    const body = await req.json() as { id: string; status?: string; current_task?: string; role?: string };
    const db = getDb();
    db.run(
      "UPDATE peers SET status = COALESCE(?, status), current_task = COALESCE(?, current_task), role = COALESCE(?, role) WHERE id = ?",
      [body.status ?? null, body.current_task ?? null, body.role ?? null, body.id]
    );
    logActivity("peer_status", [body.id, body.status ?? "", body.current_task ?? ""].join("|"));
    return json({ ok: true });
  }

  // ── Messages ─────────────────────────────────────────────
  if (path === "/message/send" && method === "POST") {
    const body = await req.json() as BrokerMessage;
    const db = getDb();
    db.run(`
      INSERT INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [body.id, body.from_id, body.from_role, body.from_agent, body.to_id, body.to_role,
        body.type, body.content, body.metadata ?? "{}", body.created_at, body.expires_at]);
    logActivity("message", `${body.from_id}→${body.to_id}|${body.type}|${body.content.slice(0, 100)}`);
    return json({ ok: true });
  }

  if (path.startsWith("/message/poll/") && method === "GET") {
    const peerId = path.split("/")[3];
    const db = getDb();
    // Limpiar mensajes expirados
    db.run("DELETE FROM messages WHERE expires_at < ? AND delivered = 0", [now()]);
    // Obtener mensajes no entregados para este peer
    const messages = db.query(
      "SELECT * FROM messages WHERE to_id = ? AND delivered = 0 ORDER BY created_at ASC"
    ).all(peerId) as BrokerMessage[];
    // Marcar como entregados
    if (messages.length > 0) {
      const ids = messages.map(m => `'${m.id}'`).join(",");
      db.run(`UPDATE messages SET delivered = 1 WHERE id IN (${ids})`);
    }
    return json(messages);
  }

  if (path.startsWith("/message/response/") && method === "POST") {
    // Guardar respuesta: reutilizamos la tabla messages con type="reply"
    const parts = path.split("/");
    const targetId = parts[3];   // el peer que preguntó (quien recibe la respuesta)
    const msgId = parts[4];      // el id del mensaje original
    const body = await req.json() as { content: string; from_id: string; from_role: string; from_agent: string };
    const db = getDb();
    const responseId = `res_${msgId}`;
    db.run(`
      INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
      VALUES (?, ?, ?, ?, ?, ?, 'reply', ?, '{}', ?, ?, 0)
    `, [responseId, body.from_id, body.from_role, body.from_agent, targetId, "",
        body.content, now(), new Date(Date.now() + 120_000).toISOString()]);
    return json({ ok: true });
  }

  if (path.startsWith("/message/response/") && method === "GET") {
    // Buscar respuesta a un mensaje específico
    const parts = path.split("/");
    const targetId = parts[3];
    const msgId = parts[4];
    const responseId = `res_${msgId}`;
    const db = getDb();
    const response = db.query(
      "SELECT content FROM messages WHERE id = ? AND to_id = ? AND type = 'reply'"
    ).get(responseId, targetId) as { content: string } | null;
    if (response) {
      db.run("DELETE FROM messages WHERE id = ?", [responseId]);
      return json({ found: true, content: response.content });
    }
    return json({ found: false });
  }

  // ── Activity ──────────────────────────────────────────────
  if (path === "/activity" && method === "GET") {
    const limit = Number(url.searchParams.get("limit")) || 50;
    const db = getDb();
    const rows = db.query(
      "SELECT timestamp, type, data FROM activity ORDER BY id DESC LIMIT ?"
    ).all(limit) as { timestamp: string; type: string; data: string }[];
    const lines = rows.map(r => `${r.timestamp}|${r.type}|${r.data}`);
    return json(lines);
  }

  // ── Stats ─────────────────────────────────────────────────
  if (path === "/stats" && method === "GET") {
    const db = getDb();
    const threshold = new Date(Date.now() - DEAD_PEER_THRESHOLD_S * 1000).toISOString();
    const peers = db.query("SELECT * FROM peers WHERE last_heartbeat > ?").all(threshold) as BrokerPeer[];
    return json({
      total: peers.length,
      working: peers.filter(p => p.status === "working").length,
      waiting: peers.filter(p => p.status === "waiting").length,
      idle: peers.filter(p => p.status === "idle").length,
      peers,
    });
  }

  return json({ error: "Not found" }, 404);
}

function logActivity(type: string, data: string): void {
  try {
    const db = getDb();
    db.run("INSERT INTO activity (timestamp, type, data) VALUES (?, ?, ?)", [now(), type, data]);
    // Mantener solo los últimos 10k eventos
    db.run("DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 10000)");
  } catch {
    // no bloquear si el log falla
  }
}

// Limpieza periódica de peers muertos
setInterval(() => {
  try {
    const db = getDb();
    const threshold = new Date(Date.now() - DEAD_PEER_THRESHOLD_S * 1000).toISOString();
    const dead = db.query("SELECT id, role, agent FROM peers WHERE last_heartbeat < ?").all(threshold) as BrokerPeer[];
    for (const peer of dead) {
      db.run("DELETE FROM peers WHERE id = ?", [peer.id]);
      logActivity("peer_timeout", `${peer.id}|${peer.role}|${peer.agent}`);
    }
  } catch {}
}, 30_000);

// Limpieza de mensajes expirados
setInterval(() => {
  try {
    getDb().run("DELETE FROM messages WHERE expires_at < ? AND type != 'reply'", [now()]);
  } catch {}
}, 60_000);

const server = serve({
  port: BROKER_PORT,
  fetch: handleRequest,
});

console.log(`claude-peers broker v0.1.0 running on port ${server.port}`);

// Cleanup al salir
process.on("SIGTERM", () => { closeDb(); process.exit(0); });
process.on("SIGINT",  () => { closeDb(); process.exit(0); });

if (import.meta.main) {
  // Mantener vivo
  await new Promise(() => {});
}
