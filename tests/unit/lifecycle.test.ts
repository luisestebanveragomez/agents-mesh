import { describe, test, expect, beforeEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

process.env.AGENTS_MESH_DATA = join(tmpdir(), "agents-mesh-lifecycle-test-" + Date.now());
process.env.AGENTS_MESH_BROKER_PORT = "17901";

const { deliveredMessages, emitProgressSignals } = await import("../../src/mcp/lifecycle");

describe("lifecycle progress signal emission", () => {
  beforeEach(() => {
    deliveredMessages.clear();
  });

  test("does not emit progress when deliveredMessages is empty", async () => {
    const calls: string[] = [];
    await emitProgressSignals(async (path) => { calls.push(path as string); return {}; });
    expect(calls.length).toBe(0);
  });

  test("emits one progress signal per delivered message", async () => {
    const calls: string[] = [];
    deliveredMessages.set("msg_a", {} as any);
    deliveredMessages.set("msg_b", {} as any);

    await emitProgressSignals(async (path) => { calls.push(path as string); return {}; });

    expect(calls).toContain("/message/progress/msg_a");
    expect(calls).toContain("/message/progress/msg_b");
    expect(calls.length).toBe(2);
  });

  test("stops emitting after message is removed from deliveredMessages", async () => {
    const calls: string[] = [];
    const fakeFetch = async (path: string) => { calls.push(path); return {}; };

    deliveredMessages.set("msg_c", {} as any);
    await emitProgressSignals(fakeFetch);
    expect(calls.filter(p => p.includes("msg_c")).length).toBe(1);

    deliveredMessages.delete("msg_c");
    calls.length = 0;

    await emitProgressSignals(fakeFetch);
    expect(calls.filter(p => p.includes("msg_c")).length).toBe(0);
  });
});
