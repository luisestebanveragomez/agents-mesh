import { mkdir, writeFile, readFile, unlink, readdir } from "fs/promises";
import { join } from "path";
import { MESSAGES_DIR, RESPONSES_DIR } from "../../shared/constants";
import { Message } from "../../shared/types";
import { now } from "../../shared/utils";

export async function enqueueMessage(msg: Message): Promise<void> {
  const dir = join(MESSAGES_DIR, msg.to);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${msg.id}.msg`), JSON.stringify(msg, null, 2), "utf-8");
}

export async function readPendingMessages(peerId: string): Promise<Message[]> {
  const dir = join(MESSAGES_DIR, peerId);
  try {
    const files = await readdir(dir);
    const messages: Message[] = [];
    const currentNow = now();

    for (const file of files.filter((f) => f.endsWith(".msg"))) {
      try {
        const raw = await readFile(join(dir, file), "utf-8");
        const msg = JSON.parse(raw) as Message;

        // Skip already read messages
        if (msg.read_at) continue;

        // Delete and skip expired messages
        if (msg.expires_at < currentNow) {
          await unlink(join(dir, file)).catch(() => {});
          continue;
        }

        messages.push(msg);
      } catch {
        // skip
      }
    }

    return messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch {
    return [];
  }
}

export async function markMessageRead(peerId: string, msgId: string): Promise<void> {
  const path = join(MESSAGES_DIR, peerId, `${msgId}.msg`);
  try {
    const raw = await readFile(path, "utf-8");
    const msg = JSON.parse(raw) as Message;
    msg.read_at = now();
    await writeFile(path, JSON.stringify(msg, null, 2), "utf-8");
  } catch {
    // ignore if not found
  }
}

export async function writeResponse(targetPeerId: string, msgId: string, content: string): Promise<void> {
  const dir = join(RESPONSES_DIR, targetPeerId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${msgId}.res`),
    JSON.stringify({ msgId, content, created_at: now() }, null, 2),
    "utf-8"
  );
}

export async function readResponse(peerId: string, msgId: string): Promise<string | null> {
  try {
    const raw = await readFile(join(RESPONSES_DIR, peerId, `${msgId}.res`), "utf-8");
    const data = JSON.parse(raw);
    return data.content ?? null;
  } catch {
    return null;
  }
}

export async function deleteResponse(peerId: string, msgId: string): Promise<void> {
  try {
    await unlink(join(RESPONSES_DIR, peerId, `${msgId}.res`));
  } catch {
    // ignore
  }
}

export async function deleteMessage(peerId: string, msgId: string): Promise<void> {
  try {
    await unlink(join(MESSAGES_DIR, peerId, `${msgId}.msg`));
  } catch {
    // ignore
  }
}
