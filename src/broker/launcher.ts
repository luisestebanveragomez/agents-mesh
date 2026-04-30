import { spawn } from "bun";
import { join } from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";

const BROKER_PORT = Number(process.env.AGENTS_MESH_BROKER_PORT) || 7899;
const BROKER_URL = `http://localhost:${BROKER_PORT}`;

// C3: per-peer auth token, set after successful register
let _peerToken: string | null = null;
export function setPeerToken(token: string): void { _peerToken = token; }
export function getPeerToken(): string | null { return _peerToken; }

function getBrokerCommand(): string[] {
  // 1. If running from compiled binary, use the same binary with "broker" subcommand
  if (!process.argv[0]?.endsWith("bun") && !process.argv[0]?.includes("/bun")) {
    return [process.execPath, "broker"];
  }
  // 2. If agents-mesh is in PATH, use it
  try {
    const binPath = execSync("which agents-mesh", { encoding: "utf-8" }).trim();
    if (binPath) return [binPath, "broker"];
  } catch {}
  // 3. Fallback: bun + broker source file (dev mode)
  const brokerPath = join(import.meta.dir, "server.ts");
  if (existsSync(brokerPath)) return ["bun", brokerPath];
  throw new Error("Cannot find agents-mesh binary or broker source");
}

export async function ensureBroker(): Promise<void> {
  try {
    const res = await fetch(`${BROKER_URL}/health`, { signal: AbortSignal.timeout(500) });
    if (res.ok) return;
  } catch {}

  const cmd = getBrokerCommand();
  const proc = spawn(cmd, {
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
  });
  proc.unref();

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
  const authHeader = _peerToken ? { "Authorization": `Bearer ${_peerToken}` } : {};
  const res = await fetch(`${BROKER_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeader, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`Broker error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
