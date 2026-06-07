import { describe, test, expect, mock, beforeEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

process.env.AGENTS_MESH_DATA = join(tmpdir(), "agents-mesh-ask-test-" + Date.now());
process.env.AGENTS_MESH_BROKER_PORT = "17902";
process.env.AGENTS_MESH_PROGRESS_SILENCE_MS = "500"; // fast silence timer for tests

import { now } from "../../src/shared/utils";
import { BrokerPeer } from "../../src/broker/types";

function makePeer(id: string, role: string, status = "working"): BrokerPeer {
  return { id, role, path: "/tmp", pid: 1, agent: "claude-code", agent_version: "1.0", started_at: now(), last_heartbeat: now(), status };
}

// Controls what brokerFetch returns per call
let fetchResponses: Array<() => unknown> = [];
let fetchCallIndex = 0;

mock.module("../../src/broker/launcher", () => ({
  ensureBroker: async () => {},
  setPeerToken: () => {},
  getPeerToken: () => "test-token",
  brokerFetch: async (path: string) => {
    if (path === "/peers") {
      return [makePeer("peer_self", "frontend", "idle"), makePeer("peer_target", "backend", "working")];
    }
    if (path.startsWith("/message/send")) return { ok: true };
    if (path.startsWith("/message/ack/")) return { acked: true };
    // Response polling: consume from fetchResponses queue
    if (path.startsWith("/message/response/")) {
      const fn = fetchResponses[fetchCallIndex++];
      return fn ? fn() : { found: false };
    }
    return {};
  },
}));

const { peersAskTool } = await import("../../src/mcp/tools/peers-ask");
const { _setCurrentPeerIdForTesting } = await import("../../src/mcp/lifecycle");
_setCurrentPeerIdForTesting("peer_self");

describe("peers_ask wait loop", () => {
  beforeEach(() => {
    fetchResponses = [];
    fetchCallIndex = 0;
  });

  test("returns answer when reply arrives", async () => {
    // First few polls: no answer, then reply
    fetchResponses = [
      () => ({ found: false }),
      () => ({ found: false }),
      () => ({ found: true, content: "the answer" }),
    ];
    const result = await peersAskTool({ target: "peer_target", question: "what is X?" }) as any;
    expect(result.answered).toBe(true);
    expect(result.answer).toBe("the answer");
  });

  test("bails with 'no progress' when silence exceeds 30s after floor", async () => {
    // No reply, no progress signals — should bail after floor + 30s silence
    // We mock time by providing infinite { found: false } without last_progress_at
    // Since we can't wait real 120s, we test the logic by using a short timeout override
    fetchResponses = Array(10).fill(() => ({ found: false }));
    const result = await peersAskTool({
      target: "peer_target",
      question: "deep question",
      timeout_seconds: 1, // floor = 1s
    }) as any;
    expect(result.answered).toBe(false);
    expect(result.timeout).toBe(true);
  });

  test("extends wait while fresh progress signals arrive", async () => {
    const progressAt = new Date(Date.now() - 5_000).toISOString(); // 5s ago — still fresh
    // Many polls with fresh progress, then a reply
    const withProgress = () => ({ found: false, last_progress_at: new Date().toISOString(), progress_count: 1 });
    fetchResponses = [
      withProgress,
      withProgress,
      withProgress,
      () => ({ found: true, content: "deep answer" }),
    ];
    const result = await peersAskTool({
      target: "peer_target",
      question: "deep question",
      timeout_seconds: 1,
    }) as any;
    expect(result.answered).toBe(true);
    expect(result.answer).toBe("deep answer");
  });

  test("backward compat: no progress signals → bails near adaptiveTimeout", async () => {
    // No progress signals, short timeout
    fetchResponses = Array(20).fill(() => ({ found: false }));
    const result = await peersAskTool({
      target: "peer_target",
      question: "old peer question",
      timeout_seconds: 1,
    }) as any;
    expect(result.answered).toBe(false);
    expect(result.timeout).toBe(true);
  });
});
