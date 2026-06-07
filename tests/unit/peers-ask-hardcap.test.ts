import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

process.env.AGENTS_MESH_DATA = join(tmpdir(), "agents-mesh-hardcap-test-" + Date.now());
process.env.AGENTS_MESH_BROKER_PORT = "17903";

import { now } from "../../src/shared/utils";
import { BrokerPeer } from "../../src/broker/types";

function makePeer(id: string, role: string, status = "working"): BrokerPeer {
  return { id, role, path: "/tmp", pid: 1, agent: "claude-code", agent_version: "1.0", started_at: now(), last_heartbeat: now(), status };
}

let fetchCallIndex = 0;

mock.module("../../src/broker/launcher", () => ({
  ensureBroker: async () => {},
  setPeerToken: () => {},
  getPeerToken: () => "test-token",
  brokerFetch: async (path: string) => {
    if (path === "/peers") {
      return [makePeer("peer_self_hc", "frontend", "idle"), makePeer("peer_target_hc", "backend", "working")];
    }
    if (path.startsWith("/message/send")) return { ok: true };
    if (path.startsWith("/message/ack/")) return { acked: true };
    if (path.startsWith("/message/response/")) {
      fetchCallIndex++;
      // Always return fresh progress — silence timer never fires
      return { found: false, last_progress_at: new Date().toISOString(), progress_count: fetchCallIndex };
    }
    return {};
  },
}));

const { peersAskTool } = await import("../../src/mcp/tools/peers-ask");
const { _setCurrentPeerIdForTesting } = await import("../../src/mcp/lifecycle");
_setCurrentPeerIdForTesting("peer_self_hc");

describe("peers_ask hard cap", () => {
  beforeEach(() => {
    fetchCallIndex = 0;
    process.env.AGENTS_MESH_PROGRESS_SILENCE_MS = "60000"; // won't fire before hard cap
    process.env.AGENTS_MESH_PROGRESS_HARD_CAP_MS = "200";  // 200ms hard cap
  });
  afterEach(() => {
    delete process.env.AGENTS_MESH_PROGRESS_SILENCE_MS;
    delete process.env.AGENTS_MESH_PROGRESS_HARD_CAP_MS;
  });

  test("bails with 'hard cap' when signals keep arriving past the cap", async () => {
    const result = await peersAskTool({
      target: "peer_target_hc",
      question: "infinite question",
      timeout_seconds: 1,
    }) as { answered: boolean; timeout?: boolean; error?: string };
    expect(result.answered).toBe(false);
    expect(result.timeout).toBe(true);
    expect(result.error).toBe("hard cap");
  });
});
