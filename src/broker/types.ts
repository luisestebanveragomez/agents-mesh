export interface BrokerPeer {
  id: string;
  role: string;
  path: string;
  pid: number;
  agent: string;
  agent_version: string;
  started_at: string;
  last_heartbeat: string;
  status: string;
  current_task?: string;
  git_branch?: string;
}

export interface BrokerMessage {
  id: string;
  from_id: string;
  from_role: string;
  from_agent: string;
  to_id: string;
  to_role: string;
  type: string;          // "ask" | "notify" | "reply" | "search"
  content: string;
  metadata: string;      // JSON stringificado
  created_at: string;
  expires_at: string;
  delivered: number;     // 0 = pendiente, 1 = entregado
}

export interface BrokerActivity {
  id?: number;
  timestamp: string;
  type: string;
  data: string;          // pipe-delimited fields
}
