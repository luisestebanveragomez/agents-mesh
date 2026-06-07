import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

// Must be set before any project module is imported
process.env.AGENTS_MESH_DB = join(tmpdir(), `agents-mesh-death-${Date.now()}.db`);
process.env.AGENTS_MESH_BROKER_PORT = "17960";
process.env.AGENTS_MESH_PROGRESS_SILENCE_MS = "800";

// Intercept brokerFetch so peersAskTool uses handleRequest directly (no HTTP port dependency)
const TOKEN_A = "token-death-a";
const TOKEN_B = "token-death-b";
const PEER_A  = "peer_death_a";
const PEER_B  = "peer_death_b";

import type { BrokerPeer } from "../../src/broker/types";

function makePeer(id: string, role: string, status: string): BrokerPeer {
  return { id, role, path: "/tmp", pid: 1, agent: "test-agent", agent_version: "1.0",
           started_at: new Date().toISOString(), last_heartbeat: new Date().toISOString(), status };
}

// State shared between mock and test
let progressCount = 0;
let bSentSignal = false;

mock.module("../../src/broker/launcher", () => ({
  ensureBroker: async () => {},
  setPeerToken: () => {},
  getPeerToken: () => TOKEN_A,
  brokerFetch: async (path: string, options?: RequestInit) => {
    const { handleRequest } = await import("../../src/broker/server");

    if (path === "/peers") return [makePeer(PEER_A, "frontend", "idle"), makePeer(PEER_B, "backend", "working")];
    if (path.startsWith("/message/send")) return { ok: true };
    if (path.startsWith("/message/ack/")) {
      // Simulate B delivering an ACK immediately
      const msgId = path.split("/")[3];
      await handleRequest(new Request(`http://localhost/message/ack/${msgId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN_B}`, "Content-Type": "application/json" },
      }));
      return { acked: true };
    }
    if (path.startsWith("/message/response/")) {
      const parts = path.split("/");
      const targetId = parts[3];
      const msgId    = parts[4];

      // B emits one progress signal, then goes silent
      if (!bSentSignal) {
        bSentSignal = true;
        const { handleRequest } = await import("../../src/broker/server");
        await handleRequest(new Request(`http://localhost/message/progress/${msgId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${TOKEN_B}`, "Content-Type": "application/json" },
        }));
        progressCount++;
      }

      // Delegate actual response lookup to handleRequest
      const res = await handleRequest(new Request(`http://localhost/message/response/${targetId}/${msgId}`));
      return res.json();
    }
    return {};
  },
}));

const { peersAskTool } = await import("../../src/mcp/tools/peers-ask");
const { _setCurrentPeerIdForTesting } = await import("../../src/mcp/lifecycle");
const { getDb, closeDb } = await import("../../src/broker/db");

const DB_PATH = process.env.AGENTS_MESH_DB!;

beforeAll(() => {
  const db = getDb();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 60_000).toISOString();
  db.run(
    `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
     VALUES (?, 'frontend', '/tmp', 1, 'test-agent', '1.0', ?, ?, 'idle', ?)`,
    [PEER_A, now, now, TOKEN_A]
  );
  db.run(
    `INSERT OR REPLACE INTO peers (id, role, path, pid, agent, agent_version, started_at, last_heartbeat, status, token)
     VALUES (?, 'backend', '/tmp', 2, 'test-agent', '1.0', ?, ?, 'working', ?)`,
    [PEER_B, now, now, TOKEN_B]
  );
  _setCurrentPeerIdForTesting(PEER_A);
});

afterAll(() => {
  closeDb();
  try { require("fs").unlinkSync(DB_PATH); } catch {}
});

describe("peers_ask death case: A bails with 'no progress' when B goes silent", () => {
  test("peersAskTool returns error 'no progress' after B emits one signal then stops", async () => {
    const result = await peersAskTool({
      target: PEER_B,
      question: "deep question?",
      timeout_seconds: 0,   // floor = 0ms so silence timer drives the bail
    });

    const r = result as { answered: boolean; timeout?: boolean; error?: string };
    expect(r.answered).toBe(false);
    expect(r.timeout).toBe(true);
    expect(r.error).toBe("no progress");
    expect(progressCount).toBeGreaterThanOrEqual(1);
  }, 10_000);
});
