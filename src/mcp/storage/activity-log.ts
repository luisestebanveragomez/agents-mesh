import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { ACTIVITY_LOG } from "../../shared/constants";
import { now } from "../../shared/utils";

export async function logActivity(type: string, ...fields: string[]): Promise<void> {
  const line = [now(), type, ...fields].join("|") + "\n";
  try {
    await mkdir(dirname(ACTIVITY_LOG), { recursive: true });
    await appendFile(ACTIVITY_LOG, line, "utf-8");
  } catch {
    // no bloquear si el log falla
  }
}
