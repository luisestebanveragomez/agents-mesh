import { homedir } from "os";
import { join } from "path";

export const DATA_DIR = process.env.CLAUDE_PEERS_DATA ?? join(homedir(), ".claude-peers-data");

export const PEERS_DIR      = join(DATA_DIR, "peers");
export const MESSAGES_DIR   = join(DATA_DIR, "messages");
export const RESPONSES_DIR  = join(DATA_DIR, "responses");
export const LOCKS_DIR      = join(DATA_DIR, "locks");
export const ACTIVITY_LOG   = join(DATA_DIR, "activity.log");

export const POLL_MS        = Number(process.env.CLAUDE_PEERS_POLL_MS)        || 2_000;
export const HEARTBEAT_MS   = Number(process.env.CLAUDE_PEERS_HEARTBEAT_MS)   || 15_000;
export const TTL_S          = Number(process.env.CLAUDE_PEERS_TTL_S)          || 30;
export const DASHBOARD_PORT = Number(process.env.CLAUDE_PEERS_DASHBOARD_PORT) || 5723;

export const DEAD_PEER_THRESHOLD_S = 60;
export const MAX_MESSAGE_BYTES     = 10_000;
export const RATE_LIMIT_PER_MIN    = 30;

export const BROKER_PORT   = Number(process.env.CLAUDE_PEERS_BROKER_PORT) || 7899;
export const BROKER_URL    = `http://localhost:${BROKER_PORT}`;
export const BROKER_POLL_MS = 1_000;
