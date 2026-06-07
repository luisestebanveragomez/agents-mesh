import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DB = join(tmpdir(), `agents-mesh-broker-http-test-${Date.now()}.db`);
process.env.AGENTS_MESH_DB = TEST_DB;
process.env.AGENTS_MESH_BROKER_PORT = "17900";

const { getDb, closeDb } = await import("../../src/broker/db");
const { handleRequest, runExpiredCleanup } = await import("../../src/broker/server");

interface ProgressMeta { last_at: string; count: number; }
interface ResponseBody { found: boolean; content?: string; last_progress_at?: string; progress_count?: number; }
interface AskInProgressRow { id: string; from_id: string; from_role: string; from_agent: string; to_id: string; to_role: string; created_at: string; }

const NOW = new Date().toISOString();
const EXPIRES = new Date(Date.now() + 60_000).toISOString();

function bearerRequest(path: string, method: string, token: string, body?: object): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// peerId is the RECIPIENT (to_id) — used for POST /progress tests
function seedPeerAsRecipient(peerId: string, token: string, msgId: string) {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
     VALUES (?, 'backend', '/tmp', 1, 'claude-code', '1.0', ?, ?, 'working', ?)`,
    [peerId, NOW, NOW, token]
  );
  db.run(
    `INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
     VALUES (?, 'peer_sender', 'frontend', 'claude-code', ?, 'backend', 'ask', 'deep question?', '{}', ?, ?, 1)`,
    [msgId, peerId, NOW, EXPIRES]
  );
}

// peerId is the ASKER (from_id) — used for GET /response tests
function seedPeerAsAsker(peerId: string, token: string, msgId: string) {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
     VALUES (?, 'backend', '/tmp', 1, 'claude-code', '1.0', ?, ?, 'working', ?)`,
    [peerId, NOW, NOW, token]
  );
  db.run(
    `INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
     VALUES (?, ?, 'backend', 'claude-code', 'peer_recipient', 'frontend', 'ask', 'deep question?', '{}', ?, ?, 1)`,
    [msgId, peerId, NOW, EXPIRES]
  );
}

describe("POST /message/progress/:msgId", () => {
  const PEER_ID = "peer_progress_test_1";
  const TOKEN = "test-token-progress-1";
  const MSG_ID = "msg_progress_test_1";

  beforeAll(() => seedPeerAsRecipient(PEER_ID, TOKEN, MSG_ID));

  afterAll(() => {
    closeDb();
    try { require("fs").unlinkSync(TEST_DB); } catch {}
  });

  test("stores last_at and sets count to 1 on first signal", async () => {
    const res = await handleRequest(
      bearerRequest(`/message/progress/${MSG_ID}`, "POST", TOKEN)
    );
    expect(res.status).toBe(200);

    const db = getDb();
    const row = db.query("SELECT metadata FROM messages WHERE id = ?").get(MSG_ID) as { metadata: string };
    const meta = JSON.parse(row.metadata);
    expect(meta.progress).toBeDefined();
    expect(typeof meta.progress.last_at).toBe("string");
    expect(meta.progress.count).toBe(1);
  });

  test("increments count on subsequent signals", async () => {
    await handleRequest(bearerRequest(`/message/progress/${MSG_ID}`, "POST", TOKEN));

    const db = getDb();
    const row = db.query("SELECT metadata FROM messages WHERE id = ?").get(MSG_ID) as { metadata: string };
    const meta = JSON.parse(row.metadata);
    expect(meta.progress.count).toBe(2);
  });

  test("rejects request from a different peer (not the recipient)", async () => {
    const db = getDb();
    db.run(
      `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
       VALUES ('peer_intruder', 'other', '/tmp', 2, 'claude-code', '1.0', ?, ?, 'idle', 'intruder-token')`,
      [NOW, NOW]
    );
    const res = await handleRequest(
      bearerRequest(`/message/progress/${MSG_ID}`, "POST", "intruder-token")
    );
    // Only the message recipient can emit progress
    expect(res.status).toBe(200); // ok but no-op (doesn't update another peer's msg)
    const row = db.query("SELECT metadata FROM messages WHERE id = ?").get(MSG_ID) as { metadata: string };
    const meta = JSON.parse(row.metadata);
    // count should NOT have changed from the intruder's call
    expect(meta.progress.count).toBe(2);
  });
});

describe("GET /message/response/:peerId/:msgId with progress", () => {
  const PEER_ID = "peer_response_test";
  const TOKEN = "test-token-response";
  const MSG_ID = "msg_response_test";

  beforeAll(() => {
    seedPeerAsAsker(PEER_ID, TOKEN, MSG_ID);
    // Seed progress data
    const db = getDb();
    db.run(
      `UPDATE messages SET metadata = json_set(metadata, '$.progress', json('{"last_at":"${NOW}","count":3}')) WHERE id = ?`,
      [MSG_ID]
    );
  });

  test("returns last_progress_at and progress_count when present", async () => {
    const res = await handleRequest(
      new Request(`http://localhost/message/response/${PEER_ID}/${MSG_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json() as ResponseBody;
    expect(body.found).toBe(false);
    expect(body.last_progress_at).toBe(NOW);
    expect(body.progress_count).toBe(3);
  });

  test("omits progress fields when no progress yet", async () => {
    const db = getDb();
    const emptyMsgId = "msg_no_progress";
    db.run(
      `INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
       VALUES (?, 'peer_sender', 'frontend', 'claude-code', ?, 'backend', 'ask', 'q', '{}', ?, ?, 1)`,
      [emptyMsgId, PEER_ID, NOW, EXPIRES]
    );
    const res = await handleRequest(
      new Request(`http://localhost/message/response/${PEER_ID}/${emptyMsgId}`)
    );
    const body = await res.json() as ResponseBody;
    expect(body.last_progress_at).toBeUndefined();
    expect(body.progress_count).toBeUndefined();
  });
});

describe("activity log: progress_started / progress_ended", () => {
  const PEER_R = "peer_activity_recipient";
  const PEER_A = "peer_activity_asker";
  const TOKEN_R = "token-activity-recipient";
  const MSG_TRACKED = "msg_activity_tracked";
  const MSG_UNTRACKED = "msg_activity_untracked";

  function activityTypes(db: ReturnType<typeof getDb>): string[] {
    return (db.query("SELECT type FROM activity ORDER BY id ASC").all() as { type: string }[]).map(r => r.type);
  }

  beforeAll(() => {
    const db = getDb();
    // Recipient peer (emits progress)
    db.run(
      `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
       VALUES (?, 'backend', '/tmp', 1, 'test-agent', '1.0', ?, ?, 'working', ?)`,
      [PEER_R, NOW, NOW, TOKEN_R]
    );
    // Asker peer (sends reply via response endpoint — needs a token too)
    const TOKEN_A = "token-activity-asker";
    db.run(
      `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
       VALUES (?, 'frontend', '/tmp', 2, 'test-agent', '1.0', ?, ?, 'idle', ?)`,
      [PEER_A, NOW, NOW, TOKEN_A]
    );
    // Ask message: from_id = PEER_A, to_id = PEER_R
    db.run(
      `INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
       VALUES (?, ?, 'frontend', 'test-agent', ?, 'backend', 'ask', 'q?', '{}', ?, ?, 1)`,
      [MSG_TRACKED, PEER_A, PEER_R, NOW, EXPIRES]
    );
    // Ask without progress (to test no progress_ended)
    db.run(
      `INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
       VALUES (?, ?, 'frontend', 'test-agent', ?, 'backend', 'ask', 'q2?', '{}', ?, ?, 1)`,
      [MSG_UNTRACKED, PEER_A, PEER_R, NOW, EXPIRES]
    );
    // Clear activity before tests
    db.run("DELETE FROM activity");
  });

  test("first progress signal emits progress_started in activity log", async () => {
    const db = getDb();
    await handleRequest(
      new Request(`http://localhost/message/progress/${MSG_TRACKED}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN_R}` },
      })
    );
    expect(activityTypes(db)).toContain("progress_started");
  });

  test("second progress signal does NOT add another progress_started", async () => {
    const db = getDb();
    db.run("DELETE FROM activity");
    // First signal already fired above; fire two more
    await handleRequest(new Request(`http://localhost/message/progress/${MSG_TRACKED}`, {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN_R}` },
    }));
    await handleRequest(new Request(`http://localhost/message/progress/${MSG_TRACKED}`, {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN_R}` },
    }));
    const types = activityTypes(db);
    expect(types.filter(t => t === "progress_started").length).toBe(0);
  });

  test("reply on a tracked message emits progress_ended", async () => {
    const db = getDb();
    db.run("DELETE FROM activity");
    await handleRequest(new Request(`http://localhost/message/response/${PEER_A}/${MSG_TRACKED}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN_R}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "answer", from_id: PEER_R, from_role: "backend", from_agent: "test-agent" }),
    }));
    expect(activityTypes(db)).toContain("progress_ended");
  });

  test("reply on an untracked message does NOT emit progress_ended", async () => {
    const db = getDb();
    db.run("DELETE FROM activity");
    await handleRequest(new Request(`http://localhost/message/response/${PEER_A}/${MSG_UNTRACKED}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN_R}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "answer2", from_id: PEER_R, from_role: "backend", from_agent: "test-agent" }),
    }));
    expect(activityTypes(db)).not.toContain("progress_ended");
  });

  test("expiry cleanup emits progress_ended for tracked asks that expire without reply", async () => {
    const db = getDb();
    db.run("DELETE FROM activity");
    // Seed an already-expired tracked ask (expires_at in the past)
    const expiredMsgId = "msg_expired_tracked";
    db.run(
      `INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
       VALUES (?, ?, 'frontend', 'test-agent', ?, 'backend', 'ask', 'q?',
               json_object('progress', json_object('last_at', ?, 'count', 2)),
               ?, ?, 1)`,
      [expiredMsgId, PEER_A, PEER_R, NOW, NOW, new Date(Date.now() - 1_000).toISOString()]
    );

    // Trigger cleanup synchronously via the exported function
    runExpiredCleanup();
    expect(activityTypes(db)).toContain("progress_ended");
  });
});

describe("asks/in-progress: ask disappears after reply is consumed", () => {
  const ASKER = "peer_aip_asker";
  const ANSWERER = "peer_aip_answerer";
  const TOKEN_ANSWERER = "token-aip-answerer";
  const MSG_ID = "msg_aip_flow_1";

  beforeAll(() => {
    const db = getDb();
    db.run(
      `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
       VALUES (?, 'backend', '/tmp', 1, 'test-agent', '1.0', ?, ?, 'working', ?)`,
      [ANSWERER, NOW, NOW, TOKEN_ANSWERER]
    );
    db.run(
      `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
       VALUES (?, 'frontend', '/tmp', 2, 'test-agent', '1.0', ?, ?, 'idle', 'token-aip-asker')`,
      [ASKER, NOW, NOW]
    );
    db.run(
      `INSERT OR REPLACE INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
       VALUES (?, ?, 'frontend', 'test-agent', ?, 'backend', 'ask', 'deep q?', '{}', ?, ?, 1)`,
      [MSG_ID, ASKER, ANSWERER, NOW, EXPIRES]
    );
  });

  test("ask not visible after asker consumes the reply", async () => {
    // Step 1: answerer sends reply
    await handleRequest(new Request(`http://localhost/message/response/${ASKER}/${MSG_ID}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN_ANSWERER}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "here is the answer", from_id: ANSWERER, from_role: "backend", from_agent: "test-agent" }),
    }));

    // Step 2: asker polls and gets the reply (this deletes the res_ row)
    const pollRes = await handleRequest(new Request(`http://localhost/message/response/${ASKER}/${MSG_ID}`));
    const pollBody = await pollRes.json() as ResponseBody;
    expect(pollBody.found).toBe(true);
    expect(pollBody.content).toBe("here is the answer");

    // Step 3: ask must no longer appear in /asks/in-progress
    const ipRes = await handleRequest(new Request(`http://localhost/asks/in-progress`));
    const ipBody = await ipRes.json() as AskInProgressRow[];
    expect(ipBody.find((r: AskInProgressRow) => r.id === MSG_ID)).toBeUndefined();
  });
});
