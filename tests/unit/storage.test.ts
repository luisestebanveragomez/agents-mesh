import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

// Sobrescribimos DATA_DIR para tests
process.env.CLAUDE_PEERS_DATA = join(tmpdir(), "claude-peers-test-" + Date.now());

// Importamos DESPUÉS de setear el env var
const { writePeer, readPeer, deletePeer, listPeers, updateHeartbeat, cleanDeadPeers, ensureDirectories } =
  await import("../../src/mcp/storage/peer-registry");

import { Peer } from "../../src/shared/types";
import { now } from "../../src/shared/utils";

function makePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    id: "test_" + Math.random().toString(36).slice(2),
    role: "frontend-test",
    path: "/tmp/test",
    pid: process.pid,
    agent: "claude-code",
    agent_version: "2.0.0",
    started_at: now(),
    last_heartbeat: now(),
    status: "idle",
    ...overrides,
  };
}

describe("peer-registry", () => {
  beforeEach(async () => {
    await ensureDirectories();
  });

  test("writePeer y readPeer funcionan", async () => {
    const peer = makePeer({ id: "abc123" });
    await writePeer(peer);
    const read = await readPeer("abc123");
    expect(read).not.toBeNull();
    expect(read?.id).toBe("abc123");
    expect(read?.role).toBe("frontend-test");
  });

  test("readPeer devuelve null si no existe", async () => {
    const result = await readPeer("no-existe");
    expect(result).toBeNull();
  });

  test("deletePeer elimina el archivo", async () => {
    const peer = makePeer({ id: "del_test" });
    await writePeer(peer);
    await deletePeer("del_test");
    const result = await readPeer("del_test");
    expect(result).toBeNull();
  });

  test("deletePeer no falla si no existe", async () => {
    await expect(deletePeer("fantasma")).resolves.toBeUndefined();
  });

  test("listPeers devuelve peers activos", async () => {
    const p1 = makePeer({ id: "list_1" });
    const p2 = makePeer({ id: "list_2" });
    await writePeer(p1);
    await writePeer(p2);
    const peers = await listPeers();
    const ids = peers.map(p => p.id);
    expect(ids).toContain("list_1");
    expect(ids).toContain("list_2");
  });

  test("listPeers filtra por role", async () => {
    const p1 = makePeer({ id: "role_1", role: "backend" });
    const p2 = makePeer({ id: "role_2", role: "frontend" });
    await writePeer(p1);
    await writePeer(p2);
    const peers = await listPeers({ role: "backend" });
    expect(peers.every(p => p.role === "backend")).toBe(true);
  });

  test("updateHeartbeat actualiza last_heartbeat", async () => {
    const peer = makePeer({ id: "hb_test" });
    const oldHb = new Date(Date.now() - 5000).toISOString();
    peer.last_heartbeat = oldHb;
    await writePeer(peer);
    await updateHeartbeat("hb_test");
    const updated = await readPeer("hb_test");
    expect(new Date(updated!.last_heartbeat).getTime()).toBeGreaterThan(new Date(oldHb).getTime());
  });

  test("cleanDeadPeers elimina peers con heartbeat viejo", async () => {
    const deadPeer = makePeer({
      id: "dead_peer",
      last_heartbeat: new Date(Date.now() - 120_000).toISOString(), // 2 minutos atrás
    });
    await writePeer(deadPeer);
    const removed = await cleanDeadPeers();
    expect(removed).toContain("dead_peer");
    const result = await readPeer("dead_peer");
    expect(result).toBeNull();
  });
});
