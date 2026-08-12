// Claude Code Stop hook: when the agent finishes a turn, check whether it has
// pending peer messages. If it does, block the stop so the agent checks them.
// Installed automatically by `agents-mesh install claude-code` (global scope).

const BROKER = `http://localhost:${Number(process.env.AGENTS_MESH_BROKER_PORT) || 7899}`;

interface HookInput {
  cwd?: string;
  stop_hook_active?: boolean;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

export async function stopHookCommand(): Promise<void> {
  let input: HookInput = {};
  try { input = JSON.parse(await readStdin()); } catch {}

  // Prevent infinite loops: if this continuation was already forced by us, let it stop
  if (input.stop_hook_active) return;

  try {
    const peers = await fetch(`${BROKER}/peers`, { signal: AbortSignal.timeout(2000) }).then(r => r.json()) as { id: string; path: string }[];
    // Match this session's peer by working directory
    const me = peers.find(p => p.path === input.cwd);
    if (!me) return;

    const { count } = await fetch(`${BROKER}/message/count/${me.id}`, { signal: AbortSignal.timeout(2000) }).then(r => r.json()) as { count: number };
    if (count > 0) {
      console.log(JSON.stringify({
        decision: "block",
        reason: `agents-mesh: tienes ${count} mensaje(s) pendiente(s) de otros agentes. Usa peers_check para leerlos y peers_reply para responder.`,
      }));
    }
  } catch {
    // Broker down or unreachable — never block the agent's stop
  }
}
