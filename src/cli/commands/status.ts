import { ensureBroker, brokerFetch } from "../../broker/launcher";
import { getSessionPeer } from "../session";

export async function statusCommand(options: {
  status?: string;
  task?: string;
  role?: string;
}): Promise<void> {
  await ensureBroker();
  const self = await getSessionPeer();
  if (!self) {
    console.error("❌ No estás registrado");
    process.exit(1);
  }

  await brokerFetch("/peer/status", {
    method: "POST",
    body: JSON.stringify({ id: self.id, status: options.status, current_task: options.task, role: options.role }),
  });

  console.log("✅ Estado actualizado");
}
