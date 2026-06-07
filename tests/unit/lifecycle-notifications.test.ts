import { describe, test, expect, mock, beforeEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

process.env.AGENTS_MESH_DATA = join(tmpdir(), "agents-mesh-notif-test-" + Date.now());
process.env.AGENTS_MESH_BROKER_PORT = "17905";

import { now } from "../../src/shared/utils";
import type { BrokerMessage } from "../../src/broker/types";

const notifyCalls: Array<{ title: string; message: string }> = [];

mock.module("../../src/mcp/notifier", () => ({
  notifyDesktop: (title: string, message: string) => {
    notifyCalls.push({ title, message });
  },
}));

mock.module("../../src/broker/launcher", () => ({
  ensureBroker: async () => {},
  setPeerToken: () => {},
  getPeerToken: () => "test-token",
  brokerFetch: async () => [],
}));

function makeAskMsg(id: string, fromAgent = "Copilot", fromRole = "backend-dev", content = "How should I structure the auth module?"): BrokerMessage {
  return {
    id,
    from_id: "peer_other",
    from_role: fromRole,
    from_agent: fromAgent,
    to_id: "peer_self",
    to_role: "frontend",
    type: "ask",
    content,
    metadata: "{}",
    created_at: now(),
    expires_at: now(),
    delivered: 1,
  };
}

const {
  _runPollTickForTesting,
  _clearNotifiedIdsForTesting,
  _setCurrentPeerIdForTesting,
} = await import("../../src/mcp/lifecycle");

_setCurrentPeerIdForTesting("peer_self");

beforeEach(() => {
  notifyCalls.length = 0;
  _clearNotifiedIdsForTesting();
});

describe("desktop notifications on Ask arrival", () => {
  test("fires notification with correct title and body when ask arrives", async () => {
    const msg = makeAskMsg("msg_1");
    await _runPollTickForTesting("peer_self", async () => [msg]);

    expect(notifyCalls.length).toBe(1);
    expect(notifyCalls[0].title).toBe("[agents-mesh] Copilot → claude-code");
    expect(notifyCalls[0].message).toBe('backend-dev asks: "How should I structure the auth module?"');
  });

  test("notify-type message does not trigger a notification", async () => {
    const msg: BrokerMessage = {
      id: "msg_notify_1",
      from_id: "peer_other",
      from_role: "backend-dev",
      from_agent: "Copilot",
      to_id: "peer_self",
      to_role: "frontend",
      type: "notify",
      content: "FYI: deployment done",
      metadata: "{}",
      created_at: now(),
      expires_at: now(),
      delivered: 1,
    };
    await _runPollTickForTesting("peer_self", async () => [msg]);

    expect(notifyCalls.length).toBe(0);
  });

  test("does not fire a second notification for the same msg_id", async () => {
    const msg = makeAskMsg("msg_2");
    await _runPollTickForTesting("peer_self", async () => [msg]);
    await _runPollTickForTesting("peer_self", async () => [msg]);

    expect(notifyCalls.length).toBe(1);
  });

  test("truncates content longer than 80 chars in notification body", async () => {
    const longContent = "A".repeat(100);
    const msg = makeAskMsg("msg_long", "Copilot", "backend-dev", longContent);
    await _runPollTickForTesting("peer_self", async () => [msg]);

    expect(notifyCalls.length).toBe(1);
    expect(notifyCalls[0].message).toBe(`backend-dev asks: "${"A".repeat(80)}"`);
  });

  test("notifier error does not propagate to the polling loop", async () => {
    const msg = makeAskMsg("msg_throw");
    notifyCalls.push = () => { throw new Error("notifier crashed"); };

    await expect(_runPollTickForTesting("peer_self", async () => [msg])).resolves.toBeUndefined();
  });
});
