import { getCurrentPeerId } from "../lifecycle";
import { brokerFetch } from "../../broker/launcher";

export async function peersStatusTool(args: {
  role?: string;
  current_task?: string;
  status?: string;
}): Promise<object> {
  const id = getCurrentPeerId();
  if (!id) return { error: "No peer registrado en esta sesión" };

  await brokerFetch("/peer/status", {
    method: "POST",
    body: JSON.stringify({ id, ...args }),
  });

  return { updated: true, id };
}
