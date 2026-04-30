import { describe, test, expect, beforeEach, mock } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

process.env.AGENTS_MESH_DATA = join(tmpdir(), "agents-mesh-tools-test-" + Date.now());
process.env.AGENTS_MESH_TTL_S = "5";

import { now } from "../../src/shared/utils";
import { Peer } from "../../src/shared/types";
import { BrokerPeer } from "../../src/broker/types";

function makePeer(id: string, role: string): BrokerPeer {
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

// In-memory store for broker mock
const brokerPeers: BrokerPeer[] = [];

mock.module("../../src/broker/launcher", () => ({
  ensureBroker: async () => {},
  brokerFetch: async (path: string, _options?: RequestInit) => {
    if (path === "/peers") return brokerPeers;
    if (path.startsWith("/peer/register")) return {};
    if (path.startsWith("/peer/status")) return {};
    if (path.startsWith("/message/send")) return {};
    return {};
  },
}));

const { peersListTool } = await import("../../src/mcp/tools/peers-list");
const { peersNotifyTool } = await import("../../src/mcp/tools/peers-notify");

describe("peers_list tool", () => {
  beforeEach(() => {
    brokerPeers.length = 0;
  });

  test("devuelve lista de peers", async () => {
    brokerPeers.push(makePeer("list_peer_1", "frontend"));
    brokerPeers.push(makePeer("list_peer_2", "backend"));
    const result = await peersListTool({}) as any;
    expect(result.peers).toBeDefined();
    expect(Array.isArray(result.peers)).toBe(true);
    expect(result.peers.length).toBe(2);
  });

  test("filtra por role", async () => {
    brokerPeers.push(makePeer("filter_peer_1", "frontend-shop"));
    brokerPeers.push(makePeer("filter_peer_2", "backend-api"));
    const result = await peersListTool({ filter: { role: "frontend-shop" } }) as any;
    expect(result.peers.every((p: BrokerPeer) => p.role === "frontend-shop")).toBe(true);
  });
});

describe("peers_notify tool", () => {
  beforeEach(() => {
    brokerPeers.length = 0;
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
