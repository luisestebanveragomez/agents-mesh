import { brokerFetch } from "../../broker/launcher";
import { BrokerPeer } from "../../broker/types";

export async function peersListTool(args: { filter?: Record<string, unknown> }): Promise<object> {
  const peers = await brokerFetch<BrokerPeer[]>("/peers");
  let filtered = peers;

  if (args.filter) {
    const f = args.filter;
    if (f.role)   filtered = filtered.filter(p => p.role === f.role);
    if (f.agent)  filtered = filtered.filter(p => p.agent === f.agent);
    if (f.exclude_self) {
      const { getCurrentPeerId } = await import("../lifecycle");
      const selfId = getCurrentPeerId();
      if (selfId) filtered = filtered.filter(p => p.id !== selfId);
    }
    if (f.active_within) {
      const threshold = new Date(Date.now() - Number(f.active_within) * 1000).toISOString();
      filtered = filtered.filter(p => p.last_heartbeat > threshold);
    }
  }

  return { peers: filtered };
}
