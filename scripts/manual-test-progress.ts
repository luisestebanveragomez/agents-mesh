/**
 * Manual test: A asks B a question, B emits progress signals for ~20s, then replies.
 * Run while dashboard is open at http://localhost:7900
 *
 * Usage: bun scripts/manual-test-progress.ts
 */

const BASE = "http://localhost:7899";

async function post(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Register two peers directly via broker
const TOKEN_A = "manual-token-a";
const TOKEN_B = "manual-token-b";
const PEER_A  = "manual_peer_a";
const PEER_B  = "manual_peer_b";
const MSG_ID  = `msg_manual_${Date.now()}`;
const NOW     = new Date().toISOString();
const EXPIRES = new Date(Date.now() + 30 * 60 * 1000).toISOString();

// Broker doesn't expose a /peers/register — seed directly via heartbeat endpoint
async function heartbeat(peerId: string, token: string, role: string, status: string) {
  await fetch(`${BASE}/peers/heartbeat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: peerId, role, path: "/tmp", pid: process.pid,
                           agent: "test", agent_version: "1.0", status }),
  });
}

console.log("=== Manual Progress Signal Test ===\n");
console.log("Watch http://localhost:7900 — Asks in Progress section\n");

// Register both peers
await heartbeat(PEER_A, TOKEN_A, "frontend", "idle");
await heartbeat(PEER_B, TOKEN_B, "backend", "working");
console.log("✓ Peers registered");

// A sends ask
await fetch(`${BASE}/message/send`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN_A}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    id: MSG_ID, from_id: PEER_A, from_role: "frontend", from_agent: "test",
    to_id: PEER_B, to_role: "backend", type: "ask",
    content: "Can you do something that takes a long time?",
    metadata: "{}", created_at: NOW, expires_at: EXPIRES,
  }),
});
console.log(`✓ Ask sent (id: ${MSG_ID})`);

// B ACKs
await fetch(`${BASE}/message/ack/${MSG_ID}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN_B}` },
});
console.log("✓ B ACKed — ask should appear in dashboard\n");

// B emits progress signal every 5s for 20s
const signals = 4;
for (let i = 1; i <= signals; i++) {
  await sleep(5000);
  await fetch(`${BASE}/message/progress/${MSG_ID}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN_B}` },
  });
  console.log(`  signal ${i}/${signals} sent`);
}

console.log("\n✓ B done thinking — sending reply");

// B replies
await fetch(`${BASE}/message/response/${PEER_A}/${MSG_ID}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN_B}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    content: "42 — took a while but worth it.",
    from_id: PEER_B, from_role: "backend", from_agent: "test",
  }),
});

// A polls and receives answer
const result = await get(`/message/response/${PEER_A}/${MSG_ID}`) as any;
console.log(`✓ A received answer: "${result.content}"`);
console.log("\nCard should have disappeared from dashboard.");
