import { describe, test, expect } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DB = join(tmpdir(), `agents-mesh-sec-activity-test-${Date.now()}.db`);
process.env.AGENTS_MESH_DB = TEST_DB;
process.env.AGENTS_MESH_BROKER_PORT = "17901";

const { getDb } = await import("../../src/broker/db");
const { handleRequest } = await import("../../src/broker/server");

const NOW = new Date().toISOString();

function seedPeer(peerId: string, token: string) {
  getDb().run(
    `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
     VALUES (?, 'backend', '/tmp', 1, 'claude-code', '1.0', ?, ?, 'working', ?)`,
    [peerId, NOW, NOW, token]
  );
}

function seedActivity(timestamp: string, type: string, data: string) {
  getDb().run("INSERT INTO activity (timestamp, type, data) VALUES (?, ?, ?)", [timestamp, type, data]);
}

describe("token exposure (C6)", () => {
  test("GET /peers never includes token", async () => {
    seedPeer("peer_sec1", "secret-token-1");
    const res = await handleRequest(new Request("http://localhost/peers"));
    const peers = await res.json() as Record<string, unknown>[];
    expect(peers.length).toBeGreaterThan(0);
    for (const p of peers) expect(p.token).toBeUndefined();
  });

  test("GET /stats never includes token in peers", async () => {
    seedPeer("peer_sec2", "secret-token-2");
    const res = await handleRequest(new Request("http://localhost/stats"));
    const stats = await res.json() as { peers: Record<string, unknown>[] };
    expect(stats.peers.length).toBeGreaterThan(0);
    for (const p of stats.peers) expect(p.token).toBeUndefined();
  });
});

describe("GET /activity — format=json and since", () => {
  test("default format stays pipe-delimited strings", async () => {
    seedActivity("2026-01-01T00:00:00.000Z", "peer_join", "peer_a|backend|claude-code|/tmp");
    const res = await handleRequest(new Request("http://localhost/activity?limit=10"));
    const lines = await res.json() as string[];
    expect(typeof lines[0]).toBe("string");
    expect(lines.some(l => l.includes("|peer_join|"))).toBe(true);
  });

  test("format=json returns structured objects", async () => {
    const res = await handleRequest(new Request("http://localhost/activity?limit=10&format=json"));
    const rows = await res.json() as { timestamp: string; type: string; data: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("timestamp");
    expect(rows[0]).toHaveProperty("type");
    expect(rows[0]).toHaveProperty("data");
  });

  test("since filters out older events", async () => {
    seedActivity("2026-01-01T00:00:00.000Z", "old_event", "old");
    seedActivity("2026-06-01T00:00:00.000Z", "new_event", "new");
    const res = await handleRequest(
      new Request("http://localhost/activity?format=json&since=2026-03-01T00:00:00.000Z")
    );
    const rows = await res.json() as { type: string }[];
    expect(rows.some(r => r.type === "new_event")).toBe(true);
    expect(rows.some(r => r.type === "old_event")).toBe(false);
  });
});

describe("reply TTL", () => {
  test("stored reply expires well beyond 2 minutes", async () => {
    seedPeer("peer_replier", "tok-replier");
    const before = Date.now();
    const res = await handleRequest(new Request("http://localhost/message/response/peer_asker/msg_ttl1", {
      method: "POST",
      headers: { "Authorization": "Bearer tok-replier", "Content-Type": "application/json" },
      body: JSON.stringify({ content: "detailed answer", from_id: "peer_replier", from_role: "backend", from_agent: "claude-code" }),
    }));
    expect(res.status).toBe(200);
    const row = getDb().query("SELECT expires_at FROM messages WHERE id = 'res_msg_ttl1'").get() as { expires_at: string };
    const ttlMs = new Date(row.expires_at).getTime() - before;
    expect(ttlMs).toBeGreaterThan(10 * 60_000); // at least 10 min (configured: 15)
  });
});
