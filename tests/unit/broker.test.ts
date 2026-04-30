import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "path";
import { tmpdir } from "os";

// Usar DB temporal para tests
const TEST_DB = join(tmpdir(), `agents-mesh-test-${Date.now()}.db`);
process.env.AGENTS_MESH_DB = TEST_DB;
process.env.AGENTS_MESH_BROKER_PORT = "17899";

const { getDb, closeDb } = await import("../../src/broker/db");

describe("broker db", () => {
  afterAll(() => {
    closeDb();
    try { require("fs").unlinkSync(TEST_DB); } catch {}
  });

  test("crea las tablas correctamente", () => {
    const db = getDb();
    const tables = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain("peers");
    expect(names).toContain("messages");
    expect(names).toContain("activity");
  });

  test("inserta y lee un peer", () => {
    const db = getDb();
    db.run(`
      INSERT INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status)
      VALUES ('test_peer_1', 'frontend', '/tmp', 123, 'claude-code', '2.0', ?, ?, 'idle')
    `, [new Date().toISOString(), new Date().toISOString()]);
    const peer = db.query("SELECT * FROM peers WHERE id = ?").get("test_peer_1") as any;
    expect(peer).not.toBeNull();
    expect(peer.role).toBe("frontend");
    expect(peer.agent).toBe("claude-code");
  });

  test("inserta y lee un mensaje", () => {
    const db = getDb();
    const expires = new Date(Date.now() + 30000).toISOString();
    db.run(`
      INSERT INTO messages (id, from_id, from_role, from_agent, to_id, to_role, type, content, created_at, expires_at)
      VALUES ('msg_test_1', 'peer_a', 'frontend', 'claude-code', 'peer_b', 'backend', 'ask', '¿hola?', ?, ?)
    `, [new Date().toISOString(), expires]);
    const msg = db.query("SELECT * FROM messages WHERE id = 'msg_test_1'").get() as any;
    expect(msg).not.toBeNull();
    expect(msg.content).toBe("¿hola?");
    expect(msg.delivered).toBe(0);
  });

  test("WAL mode está activo", () => {
    const db = getDb();
    const result = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("wal");
  });

  test("índices existen", () => {
    const db = getDb();
    const indexes = db.query(
      "SELECT name FROM sqlite_master WHERE type='index'"
    ).all() as { name: string }[];
    const names = indexes.map(i => i.name);
    expect(names).toContain("idx_messages_to_delivered");
    expect(names).toContain("idx_peers_heartbeat");
  });
});
