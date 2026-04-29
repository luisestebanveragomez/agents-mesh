import { spawn } from "bun";
import { join } from "path";

const BROKER_PORT = Number(process.env.CLAUDE_PEERS_BROKER_PORT) || 7899;
const BROKER_URL = `http://localhost:${BROKER_PORT}`;

export async function ensureBroker(): Promise<void> {
  // Verificar si ya está corriendo
  try {
    const res = await fetch(`${BROKER_URL}/health`, { signal: AbortSignal.timeout(500) });
    if (res.ok) return; // ya está corriendo
  } catch {
    // no está corriendo, arrancar
  }

  // Arrancar el broker como proceso independiente
  const brokerPath = join(import.meta.dir, "server.ts");
  const proc = spawn(["bun", brokerPath], {
    stdout: "ignore",
    stderr: "ignore",
    detached: true,   // independiente del proceso padre
  });
  proc.unref();       // no bloquea el proceso padre

  // Esperar hasta que el broker esté listo (max 5s)
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await sleep(100);
    try {
      const res = await fetch(`${BROKER_URL}/health`, { signal: AbortSignal.timeout(300) });
      if (res.ok) return;
    } catch {}
  }

  throw new Error(`No se pudo iniciar el broker en puerto ${BROKER_PORT}`);
}

export async function brokerFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BROKER_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`Broker error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
