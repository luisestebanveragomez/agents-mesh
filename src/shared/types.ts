export type AgentName =
  | "claude-code"
  | "gemini-cli"
  | "opencode"
  | "copilot"
  | "codex"
  | "unknown";

export type PeerStatus = "working" | "idle" | "waiting";

export type MessageType = "ask" | "notify" | "reply" | "search";

export type MessageCategory = "info" | "warning" | "change";

export type RelevanceLevel = "high" | "medium" | "low";

export interface Peer {
  id: string;
  role: string;
  path: string;
  pid: number;
  agent: AgentName;
  agent_version: string;
  started_at: string;       // ISO timestamp
  last_heartbeat: string;   // ISO timestamp
  status: PeerStatus;
  current_task?: string;
  git_branch?: string;
  metadata?: Record<string, string>;
}

export interface Message {
  id: string;
  from: string;             // peer id
  from_role: string;
  from_agent: AgentName;
  to: string;               // peer id
  to_role: string;
  type: MessageType;
  content: string;
  metadata: {
    search_if_unknown?: boolean;
    search_scope?: string;
    timeout_seconds?: number;
    reply_to?: string | null;
    category?: MessageCategory;
  };
  created_at: string;       // ISO timestamp
  expires_at: string;       // ISO timestamp
  read_at?: string | null;
  responded_at?: string | null;
}

export interface PeerFilter {
  role?: string;
  path?: string;
  agent?: AgentName;
  active_within?: number;   // seconds
  exclude_self?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SearchMatch {
  peer_id: string;
  peer_role: string;
  peer_agent: AgentName;
  relevance: RelevanceLevel;
  summary: string;
}

export interface AskResult {
  answered: boolean;
  answer?: string;
  answered_by?: string;
  answered_by_agent?: AgentName;
  timeout?: boolean;
  error?: string;
  async?: boolean;       // true when sent with wait:false — reply arrives as a pending message
  message_id?: string;   // id of the sent message (async mode)
}

export interface ActivityEvent {
  timestamp: string;
  type:
    | "peer_join"
    | "peer_leave"
    | "peer_timeout"
    | "peer_status"
    | "message"
    | "security_warning";
  data: string[];           // campos específicos por tipo de evento
}
