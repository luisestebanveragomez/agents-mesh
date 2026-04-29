import { getCurrentPeerId } from "../lifecycle";
import { writeResponse, markMessageRead } from "../storage/message-queue";
import { logActivity } from "../storage/activity-log";

export async function peersReplyTool(args: {
  message_id: string;
  content: string;
}): Promise<object> {
  const selfId = getCurrentPeerId();
  if (!selfId) return { error: "No peer registrado" };

  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  const { MESSAGES_DIR } = await import("../../shared/constants");

  try {
    const msgPath = join(MESSAGES_DIR, selfId, `${args.message_id}.msg`);
    const raw = await readFile(msgPath, "utf-8");
    const msg = JSON.parse(raw);

    await markMessageRead(selfId, args.message_id);
    await writeResponse(msg.from, args.message_id, args.content);
    await logActivity("message", `${selfId}→${msg.from}`, "reply", args.content.slice(0, 100));

    return { sent: true, to: msg.from };
  } catch {
    return { error: "Mensaje no encontrado", message_id: args.message_id };
  }
}
