import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DB = join(tmpdir(), `agents-mesh-asks-in-progress-${Date.now()}.db`);
process.env.AGENTS_MESH_DB = TEST_DB;
process.env.AGENTS_MESH_BROKER_PORT = "17910";

const { getDb, closeDb } = await import("../../src/broker/db");
const { handleRequest } = await import("../../src/broker/server");

const NOW = new Date().toISOString();
const EXPIRES = new Date(Date.now() + 60_000).toISOString();

async function get(path: string) {
  return handleRequest(new Request(`http://localhost${path}`));
}

function seedAsk(opts: {
  msgId: string;
  fromId: string;
  toId: string;
  delivered?: number;
  metadata?: string;
}) {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO messages
       (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
     VALUES (?, ?, 'frontend', 'claude-code', ?, 'backend', 'ask', 'question?', ?, ?, ?, ?)`,
    [
      opts.msgId,
      opts.fromId,
      opts.toId,
      opts.metadata ?? "{}",
      NOW,
      EXPIRES,
      opts.delivered ?? 1,
    ]
  );
}

function seedReply(msgId: string) {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO messages
       (id, from_id, from_role, from_agent, to_id, to_role, type, content, metadata, created_at, expires_at, delivered)
     VALUES (?, 'peer_b', 'backend', 'claude-code', 'peer_a', 'frontend', 'reply', 'answer', '{}', ?, ?, 0)`,
    [`res_${msgId}`, NOW, EXPIRES]
  );
}

afterAll(() => {
  closeDb();
  try { require("fs").unlinkSync(TEST_DB); } catch {}
});

describe("GET /asks/in-progress", () => {
  test("returns empty array when no asks in progress", async () => {
    const res = await get("/asks/in-progress");
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  test("returns delivered ask without reply", async () => {
    seedAsk({ msgId: "msg_active_1", fromId: "peer_a", toId: "peer_b", delivered: 1 });

    const res = await get("/asks/in-progress");
    const body = await res.json() as any[];
    const found = body.find((r: any) => r.id === "msg_active_1");
    expect(found).toBeDefined();
    expect(found.from_id).toBe("peer_a");
    expect(found.to_id).toBe("peer_b");
  });

  test("excludes ask that already has a reply", async () => {
    seedAsk({ msgId: "msg_replied_1", fromId: "peer_a", toId: "peer_b", delivered: 1 });
    seedReply("msg_replied_1");

    const res = await get("/asks/in-progress");
    const body = await res.json() as any[];
    expect(body.find((r: any) => r.id === "msg_replied_1")).toBeUndefined();
  });

  test("excludes ask after reply row was consumed (deleted) by the asker", async () => {
    // replied_at in metadata = what POST /message/reply will write once fixed
    const meta = JSON.stringify({ replied_at: NOW });
    seedAsk({ msgId: "msg_replied_consumed_1", fromId: "peer_a", toId: "peer_b", delivered: 1, metadata: meta });
    // no res_ row — simulates GET /message/response having already deleted it

    const res = await get("/asks/in-progress");
    const body = await res.json() as any[];
    expect(body.find((r: any) => r.id === "msg_replied_consumed_1")).toBeUndefined();
  });

  test("excludes ask that hasn't been delivered yet", async () => {
    seedAsk({ msgId: "msg_undelivered_1", fromId: "peer_a", toId: "peer_b", delivered: 0 });

    const res = await get("/asks/in-progress");
    const body = await res.json() as any[];
    expect(body.find((r: any) => r.id === "msg_undelivered_1")).toBeUndefined();
  });

  test("includes progress fields when present", async () => {
    const meta = JSON.stringify({
      acked_at: NOW,
      progress: { last_at: NOW, count: 3 },
    });
    seedAsk({ msgId: "msg_with_progress_1", fromId: "peer_a", toId: "peer_b", delivered: 1, metadata: meta });

    const res = await get("/asks/in-progress");
    const body = await res.json() as any[];
    const found = body.find((r: any) => r.id === "msg_with_progress_1");
    expect(found).toBeDefined();
    expect(found.acked_at).toBe(NOW);
    expect(found.progress_last_at).toBe(NOW);
    expect(found.progress_count).toBe(3);
  });

  test("returns null progress fields when ask has no progress yet", async () => {
    const meta = JSON.stringify({ acked_at: NOW });
    seedAsk({ msgId: "msg_acked_no_progress_1", fromId: "peer_a", toId: "peer_b", delivered: 1, metadata: meta });

    const res = await get("/asks/in-progress");
    const body = await res.json() as any[];
    const found = body.find((r: any) => r.id === "msg_acked_no_progress_1");
    expect(found).toBeDefined();
    expect(found.acked_at).toBe(NOW);
    expect(found.progress_last_at).toBeNull();
    expect(found.progress_count).toBeNull();
  });
});
