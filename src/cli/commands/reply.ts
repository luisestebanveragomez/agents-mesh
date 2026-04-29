import { writeResponse, markMessageRead } from "../../mcp/storage/message-queue";
import { logActivity } from "../../mcp/storage/activity-log";
import { readFile } from "fs/promises";
import { join } from "path";
import { MESSAGES_DIR } from "../../shared/constants";

export async function replyCommand(messageId: string, content: string): Promise<void> {
  const { getSessionPeer } = await import("../session");
  const self = await getSessionPeer();

  if (!self) {
    console.error("❌ No estás registrado como peer. Ejecuta: claude-peers register");
    process.exit(1);
  }

  try {
    const msgPath = join(MESSAGES_DIR, self.id, `${messageId}.msg`);
    const raw = await readFile(msgPath, "utf-8");
    const msg = JSON.parse(raw);

    await markMessageRead(self.id, messageId);
    await writeResponse(msg.from, messageId, content);
    await logActivity("message", `${self.id}→${msg.from}`, "reply", content.slice(0, 100));

    console.log(`✅ Respuesta enviada a ${msg.from_role}`);
  } catch {
    console.error(`❌ Mensaje no encontrado: ${messageId}`);
    process.exit(1);
  }
}
