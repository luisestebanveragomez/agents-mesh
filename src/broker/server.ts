import { serve } from "bun";
import { randomBytes } from "crypto";
import { getDb, closeDb } from "./db";
import { BrokerPeer, BrokerMessage } from "./types";

const BROKER_PORT = Number(process.env.AGENTS_MESH_BROKER_PORT) || 7899;
const DEAD_PEER_THRESHOLD_S = 60;
const PEER_ID_RE = /^peer_[a-zA-Z0-9_-]{1,64}$/; // L2: peer ID format validation
const MAX_TTL_MS = 24 * 60 * 60 * 1000;           // L5: max 24h TTL

// C3: validate bearer token → return peerId or null
function authPeer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const db = getDb();
  const row = db.query("SELECT id FROM peers WHERE token = ?").get(token) as { id: string } | null;
  return row?.id ?? null;
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function now(): string {
  return new Date().toISOString();
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function handleRequest(req: Request): Promise<Response> {
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
    // L2: validate peer ID format before storing
    if (!body.id || !PEER_ID_RE.test(body.id)) {
      return json({ error: "Invalid peer id format" }, 400);
    }
    // C3: generate per-peer auth token
    const token = randomBytes(32).toString("hex");
    const db = getDb();
    db.run(`
      INSERT OR REPLACE INTO peers
        (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, current_task, git_branch, token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [body.id, body.role, body.path, body.pid, body.agent, body.agent_version,
        body.started_at, body.last_heartbeat, body.status, body.current_task ?? null, body.git_branch ?? null, token]);
    logActivity("peer_join", [body.id, body.role, body.agent, body.path].join("|"));
    return json({ ok: true, token });
  }

  if (path === "/peer/heartbeat" && method === "POST") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const body = await req.json() as { status?: string; current_task?: string };
    const db = getDb();
    db.run(
      "UPDATE peers SET last_heartbeat = ?, status = COALESCE(?, status), current_task = COALESCE(?, current_task) WHERE id = ?",
      [now(), body.status ?? null, body.current_task ?? null, peerId]
    );
    return json({ ok: true });
  }

  if (path.startsWith("/peer/") && method === "DELETE") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const id = path.split("/")[2];
    // C3: peer can only delete itself
    if (id !== peerId) return json({ error: "Forbidden" }, 403);
    const db = getDb();
    const peer = db.query("SELECT * FROM peers WHERE id = ?").get(id) as BrokerPeer | null;
    db.run("DELETE FROM peers WHERE id = ?", [id]);
    if (peer) logActivity("peer_leave", [id, peer.role, peer.agent].join("|"));
    return json({ ok: true });
  }

  if (path === "/peer/status" && method === "POST") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const body = await req.json() as { status?: string; current_task?: string; role?: string };
    const db = getDb();
    db.run(
      "UPDATE peers SET status = COALESCE(?, status), current_task = COALESCE(?, current_task), role = COALESCE(?, role) WHERE id = ?",
      [body.status ?? null, body.current_task ?? null, body.role ?? null, peerId]
    );
    logActivity("peer_status", [peerId, body.status ?? "", body.current_task ?? ""].join("|"));
    return json({ ok: true });
  }

  // ── Messages ─────────────────────────────────────────────
  if (path === "/message/send" && method === "POST") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const body = await req.json() as BrokerMessage;
    // C3: from_id is derived from token, not trusted from body
    const maxExpiry = new Date(Date.now() + MAX_TTL_MS).toISOString();
    const expiresAt = body.expires_at && body.expires_at < maxExpiry ? body.expires_at : maxExpiry;
    const db = getDb();
    const sender = db.query("SELECT role, agent FROM peers WHERE id = ?").get(peerId) as { role: string; agent: string } | null;
    db.run(`
      INSERT INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [body.id, peerId, sender?.role ?? body.from_role, sender?.agent ?? body.from_agent,
        body.to_id, body.to_role, body.type, body.content, body.metadata ?? "{}", body.created_at, expiresAt]);
    logActivity("message", `${peerId}→${body.to_id}|${body.type}|${body.content.slice(0, 100)}`);
    return json({ ok: true });
  }

  // Marcar mensaje como auto-respondido (para que el middleware no lo duplique)
  if (path.startsWith("/message/auto-responded/") && method === "POST") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const msgId = path.split("/")[3];
    const db = getDb();
    db.run("UPDATE messages SET auto_responded = 1 WHERE id = ? AND to_id = ?", [msgId, peerId]);
    return json({ ok: true });
  }

  // ACK: marcar que el receptor recibió el mensaje (sin entregarlo aún al LLM)
  if (path.startsWith("/message/ack/") && method === "POST") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const msgId = path.split("/")[3];
    const db = getDb();
    // C3: only the intended recipient can ACK
    db.run("UPDATE messages SET metadata = json_set(COALESCE(metadata,'{}'), '$.acked_at', ?) WHERE id = ? AND to_id = ?", [now(), msgId, peerId]);
    return json({ ok: true });
  }

  // Verificar si un mensaje fue recibido (ACK)
  if (path.startsWith("/message/ack/") && method === "GET") {
    const msgId = path.split("/")[3];
    const db = getDb();
    const row = db.query("SELECT metadata FROM messages WHERE id = ?").get(msgId) as { metadata: string } | null;
    if (!row) return json({ acked: false });
    try {
      const meta = JSON.parse(row.metadata || "{}");
      return json({ acked: !!meta.acked_at, acked_at: meta.acked_at ?? null });
    } catch { return json({ acked: false }); }
  }

  if (path.startsWith("/message/count/") && method === "GET") {
    const peerId = path.split("/")[3];
    const db = getDb();
    const row = db.query(
      "SELECT COUNT(*) as count FROM messages WHERE to_id = ? AND delivered = 0 AND type != 'reply' AND expires_at > ?"
    ).get(peerId, now()) as { count: number };
    return json({ count: row?.count ?? 0 });
  }

  if (path.startsWith("/message/poll/") && method === "GET") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    // C3: ignore path segment — use identity from token
    const db = getDb();
    // Limpiar mensajes expirados
    db.run("DELETE FROM messages WHERE expires_at < ? AND delivered = 0", [now()]);
    // Obtener mensajes no entregados para este peer
    const messages = db.query(
      "SELECT * FROM messages WHERE to_id = ? AND delivered = 0 ORDER BY created_at ASC"
    ).all(peerId) as BrokerMessage[];
    // Marcar como entregados — parámetros bound para evitar SQL injection (M2)
    if (messages.length > 0) {
      const placeholders = messages.map(() => "?").join(",");
      const ids = messages.map(m => m.id);
      db.run(`UPDATE messages SET delivered = 1 WHERE id IN (${placeholders})`, ids);
    }
    return json(messages);
  }

  // Progress signal: B emits "still working on msg X" every 5s
  if (path.startsWith("/message/progress/") && method === "POST") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const msgId = path.split("/")[3];
    const db = getDb();
    // Check if this is the first signal (no progress yet) before updating
    const existing = db.query(
      "SELECT json_extract(metadata, '$.progress.count') as count FROM messages WHERE id = ? AND to_id = ?"
    ).get(msgId, peerId) as { count: number | null } | null;
    const isFirst = existing && existing.count == null;
    // Only the recipient of the message can emit progress
    db.run(
      `UPDATE messages
       SET metadata = json_set(
         COALESCE(metadata, '{}'),
         '$.progress', json_object(
           'last_at', ?,
           'count', COALESCE(json_extract(metadata, '$.progress.count'), 0) + 1
         )
       )
       WHERE id = ? AND to_id = ?`,
      [now(), msgId, peerId]
    );
    if (isFirst) logActivity("progress_started", `${peerId}|${msgId}`);
    return json({ ok: true });
  }

  if (path.startsWith("/message/response/") && method === "POST") {
    const peerId = authPeer(req);
    if (!peerId) return unauthorized();
    const parts = path.split("/");
    const targetId = parts[3];   // el peer que preguntó (quien recibe la respuesta)
    const msgId = parts[4];      // el id del mensaje original
    const body = await req.json() as { content: string; from_id: string; from_role: string; from_agent: string };
    const db = getDb();
    const responseId = `res_${msgId}`;
    // Emit progress_ended if the ask was being tracked
    const tracked = db.query(
      "SELECT json_extract(metadata, '$.progress.count') as count FROM messages WHERE id = ? AND type = 'ask'"
    ).get(msgId) as { count: number | null } | null;
    if (tracked?.count != null) logActivity("progress_ended", `${peerId}|${targetId}|${msgId}`);
    // C3: from_id derived from token, not body
    const sender = db.query("SELECT role, agent FROM peers WHERE id = ?").get(peerId) as { role: string; agent: string } | null;
    db.run(`
      INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
      VALUES (?, ?, ?, ?, ?, ?, 'reply', ?, '{}', ?, ?, 0)
    `, [responseId, peerId, sender?.role ?? body.from_role, sender?.agent ?? body.from_agent, targetId, "",
        body.content, now(), new Date(Date.now() + 120_000).toISOString()]);
    return json({ ok: true });
  }

  if (path.startsWith("/message/response/") && method === "GET") {
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
    // Include progress fields if present on the original ask message
    // targetId is the asker (from_id), not the recipient (to_id)
    const askRow = db.query(
      "SELECT metadata FROM messages WHERE id = ? AND from_id = ? AND type = 'ask'"
    ).get(msgId, targetId) as { metadata: string } | null;
    if (askRow) {
      try {
        const meta = JSON.parse(askRow.metadata || "{}");
        if (meta.progress?.last_at) {
          return json({ found: false, last_progress_at: meta.progress.last_at, progress_count: meta.progress.count });
        }
      } catch {}
    }
    return json({ found: false });
  }

  // ── Asks in progress ─────────────────────────────────────
  if (path === "/asks/in-progress" && method === "GET") {
    const db = getDb();
    const rows = db.query(`
      SELECT
        m.id, m.from_id, m.from_agent, m.to_id, m.created_at,
        json_extract(m.metadata, '$.acked_at')           AS acked_at,
        json_extract(m.metadata, '$.progress.last_at')   AS progress_last_at,
        json_extract(m.metadata, '$.progress.count')     AS progress_count
      FROM messages m
      WHERE m.type = 'ask'
        AND m.delivered = 1
        AND NOT EXISTS (
          SELECT 1 FROM messages r WHERE r.id = ('res_' || m.id)
        )
      ORDER BY m.created_at ASC
    `).all() as { id: string; from_id: string; from_agent: string; to_id: string; created_at: string; acked_at: string | null; progress_last_at: string | null; progress_count: number | null }[];
    return json(rows);
  }

  // ── Activity ──────────────────────────────────────────────
  if (path === "/activity" && method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500); // H3: cap DoS
    const db = getDb();
    const rows = db.query(
      "SELECT timestamp, type, data FROM activity ORDER BY id DESC LIMIT ?"
    ).all(limit) as { timestamp: string; type: string; data: string }[];
    const lines = rows.map(r => `${r.timestamp}|${r.type}|${r.data}`);
    return json(lines);
  }

  // ── Connections (pares que han intercambiado mensajes) ────
  if (path === "/connections" && method === "GET") {
    const db = getDb();
    const rows = db.query(
      "SELECT DISTINCT from_id, to_id FROM messages"
    ).all() as { from_id: string; to_id: string }[];
    // Normalizar: siempre el ID menor primero para evitar duplicados A-B / B-A
    const seen = new Set<string>();
    const pairs: { a: string; b: string }[] = [];
    for (const { from_id, to_id } of rows) {
      const key = [from_id, to_id].sort().join('|');
      if (!seen.has(key)) { seen.add(key); pairs.push({ a: from_id, b: to_id }); }
    }
    return json(pairs);
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
}, 10_000);

// Limpieza de mensajes expirados
setInterval(() => {
  try {
    getDb().run("DELETE FROM messages WHERE expires_at < ? AND type != 'reply'", [now()]);
  } catch {}
}, 60_000);

if (import.meta.main) {
  const server = serve({
    port: BROKER_PORT,
    hostname: "127.0.0.1",  // C1: bind only to loopback — never expose to network
    fetch: handleRequest,
  });

  console.log(`agents-mesh broker v0.1.0 running on port ${server.port}`);

  process.on("SIGTERM", () => { closeDb(); process.exit(0); });
  process.on("SIGINT",  () => { closeDb(); process.exit(0); });

  await new Promise(() => {});
}
