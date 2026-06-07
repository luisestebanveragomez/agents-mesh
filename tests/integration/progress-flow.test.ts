import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

// Short silence timer so the "death" case doesn't take 30s
process.env.AGENTS_MESH_PROGRESS_SILENCE_MS = "800";

const TEST_DB = join(tmpdir(), `agents-mesh-integration-${Date.now()}.db`);
process.env.AGENTS_MESH_DB = TEST_DB;
process.env.AGENTS_MESH_BROKER_PORT = "17950";

const { getDb, closeDb } = await import("../../src/broker/db");
const { handleRequest } = await import("../../src/broker/server");

const NOW = () => new Date().toISOString();
const EXPIRES = () => new Date(Date.now() + 60_000).toISOString();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
async function post(path: string, token: string, body?: object) {
  return handleRequest(new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
}
async function get(path: string) {
  return handleRequest(new Request(`http://localhost${path}`));
}

// Register a peer and return its token
async function registerPeer(id: string, role: string, status = "idle"): Promise<string> {
  const db = getDb();
  const token = `token-${id}`;
  db.run(
    `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
     VALUES (?, ?, '/tmp', 1, 'test-agent', '1.0', ?, ?, ?, ?)`,
    [id, role, NOW(), NOW(), status, token]
  );
  return token;
}

describe("progress signal integration: golden path", () => {
  const PEER_A = "peer_int_a";
  const PEER_B = "peer_int_b";
  let tokenA: string;
  let tokenB: string;
  let msgId: string;

  beforeAll(async () => {
    tokenA = await registerPeer(PEER_A, "frontend", "idle");
    tokenB = await registerPeer(PEER_B, "backend", "working");
  });

  test("A sends ask, B ACKs, broker stores message", async () => {
    const db = getDb();
    msgId = `msg_int_${Date.now()}`;
    db.run(
      `INSERT INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
       VALUES (?, ?, 'frontend', 'test-agent', ?, 'backend', 'ask', 'what is the answer?', '{}', ?, ?, 1)`,
      [msgId, PEER_A, PEER_B, NOW(), EXPIRES()]
    );

    // B ACKs
    await post(`/message/ack/${msgId}`, tokenB);

    const row = db.query("SELECT metadata FROM messages WHERE id = ?").get(msgId) as any;
    const meta = JSON.parse(row.metadata);
    expect(meta.acked_at).toBeDefined();
  });

  test("B emits 3 progress signals, count increments to 3", async () => {
    await post(`/message/progress/${msgId}`, tokenB);
    await post(`/message/progress/${msgId}`, tokenB);
    await post(`/message/progress/${msgId}`, tokenB);

    const db = getDb();
    const row = db.query("SELECT metadata FROM messages WHERE id = ?").get(msgId) as any;
    const meta = JSON.parse(row.metadata);
    expect(meta.progress.count).toBe(3);
    expect(typeof meta.progress.last_at).toBe("string");
  });

  test("A polls response and sees last_progress_at", async () => {
    const res = await get(`/message/response/${PEER_A}/${msgId}`);
    const body = await res.json() as any;
    expect(body.found).toBe(false);
    expect(body.progress_count).toBe(3);
    expect(typeof body.last_progress_at).toBe("string");
  });

  test("B replies, A receives answer", async () => {
    // B sends reply
    await post(`/message/response/${PEER_A}/${msgId}`, tokenB, {
      content: "42 is the answer",
      from_id: PEER_B,
      from_role: "backend",
      from_agent: "test-agent",
    });

    // A polls — should now find the reply
    const res = await get(`/message/response/${PEER_A}/${msgId}`);
    const body = await res.json() as any;
    expect(body.found).toBe(true);
    expect(body.content).toBe("42 is the answer");
  });
});

afterAll(() => {
  closeDb();
  try { require("fs").unlinkSync(TEST_DB); } catch {}
});

describe("progress signal integration: death case", () => {
  const PEER_C = "peer_int_c";
  const PEER_D = "peer_int_d";
  let tokenD: string;
  let msgId2: string;

  beforeAll(async () => {
    await registerPeer(PEER_C, "frontend-2", "idle");
    tokenD = await registerPeer(PEER_D, "backend-2", "working");

    const db = getDb();
    msgId2 = `msg_int2_${Date.now()}`;
    db.run(
      `INSERT INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
       VALUES (?, ?, 'frontend-2', 'test-agent', ?, 'backend-2', 'ask', 'deep question', '{}', ?, ?, 1)`,
      [msgId2, PEER_C, PEER_D, NOW(), EXPIRES()]
    );
  });

  test("A polls response, sees no progress (B is silent)", async () => {
    const res = await get(`/message/response/${PEER_C}/${msgId2}`);
    const body = await res.json() as any;
    expect(body.found).toBe(false);
    expect(body.last_progress_at).toBeUndefined();
  });

  test("after B emits 1 signal then goes silent, progress_count stays at 1", async () => {
    await post(`/message/progress/${msgId2}`, tokenD);

    const db = getDb();
    const row = db.query("SELECT metadata FROM messages WHERE id = ?").get(msgId2) as any;
    const meta = JSON.parse(row.metadata);
    expect(meta.progress.count).toBe(1);

    // B goes silent — no more signals emitted
    const res = await get(`/message/response/${PEER_C}/${msgId2}`);
    const body = await res.json() as any;
    expect(body.progress_count).toBe(1);
    expect(body.found).toBe(false);
  });
});
