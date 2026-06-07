# ADR 0001 — Progress signals for long-running Asks

**Status**: accepted
**Date**: 2026-06-06

## Context

When agent A asks agent B via `peers_ask`, A blocks waiting for the reply. The current timeout is derived from B's global `peer status` (`idle: 120s`, `waiting: 300s`, `working: 600s`). This fails in several scenarios:

1. B handles two Asks. Finishes one → its global status flips to `idle` → the final branch of `peers-ask.ts` trims the wait to 30s and A abandons the other Ask too early.
2. B momentarily flips to `idle` between tool calls. A samples right there → early bail.
3. B has status `working` because of an unrelated task (not msg_X). A waits 10 minutes for nothing.
4. The research required to answer exceeds the bucket ceiling (even `working` = 10 min may not be enough to traverse a whole codebase).

The root cause: **there is no correlation between "B is busy" and "B is busy answering this specific Ask"**.

## Decision

Introduce **per-message progress signals**, emitted automatically by B's lifecycle (without LLM involvement), which renew A's wait tolerance.

### Shape

- **Granularity**: per `msg_id`, not per peer.
- **Trigger**: automatic. While `msg_id` is in `deliveredMessages` (B lifecycle's local Map), the poll loop emits the signal. Calling `peers_reply` removes the entry → signals stop on their own.
- **Cadence**: every 5s from B (piggyback on the existing poll loop, `BROKER_POLL_MS=1s`, every 5th tick).
- **A tolerance (silence timer)**: 30s without a signal → A assumes death/stuck.
- **Hard cap**: 30 min from ACK. Override via the existing `timeout_seconds` arg in `peers_ask` for extreme cases.
- **Initial floor**: A waits at least `adaptiveTimeout` (status-derived) before applying the silence timer. Guarantees backward compatibility with peers that do not emit progress.

### Persistence

Broker:

```
messages.metadata.progress = { last_at: ISO, count: int }
```

Endpoints:

- `POST /message/progress/:msgId` — emitted by B. Updates `last_at`, increments `count`. Token auth (only the message recipient can emit).
- `GET /message/response/:peerId/:msgId` (existing) — extends its response:
  ```ts
  { found: boolean, content?: string, last_progress_at?: string, progress_count?: number }
  ```
  A single endpoint so A queries response and progress at once.

Activity log: two discrete events per in-flight Ask, `progress_started` (first signal) and `progress_ended` (on `peers_reply`). Individual signals **do not** go to the log to avoid spam (720/h per active msg).

### A's loop (sketch)

```ts
const ackAt = await waitForAck(...);
const floorDeadline    = ackAt + adaptiveTimeout * 1000;
const hardCapDeadline  = ackAt + 30 * 60 * 1000;
let lastProgressAt     = ackAt;

while (Date.now() < hardCapDeadline) {
  await sleep(500);
  const r = await brokerFetch(`/message/response/${selfId}/${msgId}`);
  if (r.found) return { answered: true, answer: r.content, ... };
  if (r.last_progress_at) lastProgressAt = parseISO(r.last_progress_at);

  const silenceDeadline = lastProgressAt + 30_000;
  if (Date.now() > floorDeadline && Date.now() > silenceDeadline) {
    return { answered: false, timeout: true, error: "no progress" };
  }
}
return { answered: false, timeout: true, error: "hard cap" };
```

### Dashboard

New "Asks in progress" card: `A → B | age since ACK | count | waiting`. New endpoint in the dashboard server: query the broker for messages with `delivered=1`, `type='ask'`, and no associated reply.

## Alternatives considered

### A) Per-peer keepalive (global status)
Cheaper (reuses peer status). Rejected: ambiguity when B handles N Asks, flips between tool calls, "working" because of another task.

### B) Explicit progress tool (`peers_progress(message_id, note)`)
The LLM calls it manually. Rejected: LLMs forget under cognitive load; one omission = false A timeout. Same empirical problem we see with `peers_reply` when LLMs reply in plain text. Auto is robust; explicit can be added later if we need ETA or notes.

### C) No hard cap, silence timer only
Rejected: an LLM that finishes but forgets `peers_reply` would keep the automatic signals alive indefinitely → A blocked forever.

### D) Activity log with every signal
Rejected: 720 events per hour per active Ask. Kills feed UX.

## Consequences

**Positive**

- Deep-research Asks (several minutes) are no longer cut off by peer-status race conditions.
- Fast death detection (30s) when B crashes or hangs.
- Backward compatible: older peers without progress keep working with the current `adaptiveTimeout` (via the floor deadline).
- Zero cognitive load on the LLM.

**Negative**

- Extra broker traffic: 1 UPDATE per active Ask every 5s. Trivial for local SQLite but grows with concurrent Asks.
- One `messages.metadata` read on each A poll. Mitigated by the combined endpoint.
- An LLM that forgets `peers_reply` now consumes up to 30 min before releasing A (vs the current `adaptiveTimeout`). Mitigated by the hard cap.

**Migration**

- Shape change in `GET /message/response/:peerId/:msgId`: adds optional fields. Doesn't break current consumers.
- B's lifecycle: extend the poll `setInterval` to emit progress for each entry in `deliveredMessages`.
- `peers-ask.ts`: replace the while-loop logic with the sketch above.
- Dashboard: new endpoint + new card. Non-blocking for the rest.
