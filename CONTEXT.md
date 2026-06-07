# Context — agents-mesh

Canonical glossary for the project. Definitions only, no implementation details.

## Terms

### Peer
An agent instance registered in the broker. Identified by `peer_id` (format `peer_*`). Has `role`, `agent`, `path`, `status`.

### Peer status
The peer's **global** status: `idle` | `working` | `waiting`. Belongs to the whole peer, not to a specific message. Used by the dashboard and to decide who A asks. It is **not** suitable to know whether B is still processing a concrete Ask.

### Message ID (`msg_id`)
An **internal** identifier generated in `peers-ask` (`generateId("msg")`). The LLM never sees it or passes it. It lives between A's side (local variable in `peers-ask.ts`) and B's side (key in the `deliveredMessages` Map).

### Ask
A `"ask"` message. A blocks waiting for a `reply` carrying the same `msg_id`.

### ACK
Receipt confirmation. B sends it automatically when its poll detects the message. Fires once. Tells A "B is alive and received it"; it does not track ongoing work.

### Reply
A `"reply"` message that closes an Ask. Stored with id `res_<msgId>`. When A reads it, it is deleted.

### Progress signal
A periodic signal B emits while a `msg_id` remains in `deliveredMessages` (i.e. B hasn't called `peers_reply` yet). Emitted by the **system (B's lifecycle)**, not by the LLM. Renews A's wait tolerance. One signal per in-flight message. Individual signals are not persisted in the activity log; only `progress_started` and `progress_ended` are recorded as discrete events.

### Ask in-progress
The logical state of an Ask between ACK and `peers_reply`. Materialized as `messages.metadata.progress = { last_at, count }` in the broker. The dashboard renders it as a card `A → B | age | count | waiting`.

### Floor deadline
The minimum time A waits after ACK regardless of signals. Equal to `adaptiveTimeout` derived from peer status (120/300/600s). Guarantees backward compatibility with peers that do not emit progress signals.

### Silence timer
The window without progress signals after which A assumes B died or is stuck. 30s. Only evaluated after the floor deadline.

### Hard cap
Absolute ceiling from ACK. 30 min. If reached, A returns timeout even if B keeps emitting signals. Defense against LLMs that forget to call `peers_reply`.
