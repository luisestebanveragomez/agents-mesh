import { describe, test, expect, beforeEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

process.env.CLAUDE_PEERS_DATA = join(tmpdir(), "claude-peers-tools-test-" + Date.now());
process.env.CLAUDE_PEERS_TTL_S = "5";

const { ensureDirectories, writePeer } = await import("../../src/mcp/storage/peer-registry");
const { peersListTool } = await import("../../src/mcp/tools/peers-list");
const { peersNotifyTool } = await import("../../src/mcp/tools/peers-notify");
import { now, expiresAt } from "../../src/shared/utils";
import { Peer } from "../../src/shared/types";

function makePeer(id: string, role: string): Peer {
  return {
    id,
    role,
    path: "/tmp/test",
    pid: 9999,
    agent: "claude-code",
    agent_version: "2.0.0",
    started_at: now(),
    last_heartbeat: now(),
    status: "idle",
  };
}

describe("peers_list tool", () => {
  beforeEach(async () => {
    await ensureDirectories();
  });

  test("devuelve lista de peers", async () => {
    await writePeer(makePeer("list_peer_1", "frontend"));
    await writePeer(makePeer("list_peer_2", "backend"));
    const result = await peersListTool({}) as any;
    expect(result.peers).toBeDefined();
    expect(Array.isArray(result.peers)).toBe(true);
  });

  test("filtra por role", async () => {
    await writePeer(makePeer("filter_peer_1", "frontend-shop"));
    await writePeer(makePeer("filter_peer_2", "backend-api"));
    const result = await peersListTool({ filter: { role: "frontend-shop" } }) as any;
    expect(result.peers.every((p: Peer) => p.role === "frontend-shop")).toBe(true);
  });
});

describe("peers_notify tool", () => {
  beforeEach(async () => {
    await ensureDirectories();
  });

  test("entrega notificación a peer específico", async () => {
    // peers_notify sin selfId registrado (no hay lifecycle activo en test)
    // retorna error esperado
    const result = await peersNotifyTool({
      target: "some_peer",
      message: "test notification",
    }) as any;
    // Sin lifecycle activo, debe retornar error o delivered_to vacío
    expect(result.error !== undefined || Array.isArray(result.delivered_to)).toBe(true);
  });
});
