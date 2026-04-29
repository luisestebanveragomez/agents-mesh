import { serve } from "bun";
import { join } from "path";
import { readFile } from "fs/promises";
import { DASHBOARD_PORT } from "../shared/constants";
import { listPeers } from "../mcp/storage/peer-registry";
import { ACTIVITY_LOG } from "../shared/constants";

const PUBLIC_DIR = join(import.meta.dir, "public");

async function getStats() {
  const peers = await listPeers();
  const working = peers.filter(p => p.status === "working").length;
  const waiting = peers.filter(p => p.status === "waiting").length;
  const idle = peers.filter(p => p.status === "idle").length;

  return {
    total: peers.length,
    working,
    waiting,
    idle,
    peers,
  };
}

async function getActivity(limit = 50): Promise<string[]> {
  try {
    const raw = await readFile(ACTIVITY_LOG, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).reverse();
  } catch {
    return [];
  }
}

function createSSEStream(): ReadableStream {
  let interval: ReturnType<typeof setInterval>;
  return new ReadableStream({
    start(controller) {
      const send = async () => {
        try {
          const stats = await getStats();
          const data = JSON.stringify(stats);
          controller.enqueue(`data: ${data}\n\n`);
        } catch {
          // ignorar errores de lectura
        }
      };

      send(); // inmediato
      interval = setInterval(send, 2000);
    },
    cancel() {
      clearInterval(interval);
    },
  });
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache",
  };

  // API endpoints
  if (path === "/api/peers") {
    const peers = await listPeers();
    return Response.json(peers, { headers });
  }

  if (path === "/api/activity") {
    const limit = Number(url.searchParams.get("limit")) || 50;
    const lines = await getActivity(limit);
    return Response.json(lines, { headers });
  }

  if (path === "/api/stats") {
    const stats = await getStats();
    return Response.json(stats, { headers });
  }

  if (path === "/api/stream") {
    const stream = createSSEStream();
    return new Response(stream, {
      headers: {
        ...headers,
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
      },
    });
  }

  if (path === "/api/conversation") {
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");
    // Lee el activity.log y filtra mensajes entre a y b
    const lines = await getActivity(500);
    const conversation = lines.filter(line => {
      return line.includes(`${a}→${b}`) || line.includes(`${b}→${a}`);
    });
    return Response.json(conversation, { headers });
  }

  // Servir archivos estáticos
  if (path === "/" || path === "/index.html") {
    try {
      const html = await readFile(join(PUBLIC_DIR, "index.html"), "utf-8");
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    } catch {
      return new Response("Dashboard not found", { status: 404 });
    }
  }

  if (path.endsWith(".css")) {
    try {
      const css = await readFile(join(PUBLIC_DIR, path.slice(1)), "utf-8");
      return new Response(css, {
        headers: { ...headers, "Content-Type": "text/css" },
      });
    } catch {
      return new Response("", { status: 404 });
    }
  }

  if (path.endsWith(".js")) {
    try {
      const js = await readFile(join(PUBLIC_DIR, path.slice(1)), "utf-8");
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    } catch {
      return new Response("", { status: 404 });
    }
  }

  return new Response("Not found", { status: 404 });
}

export async function startDashboard(port = DASHBOARD_PORT): Promise<void> {
  let actualPort = port;
  let server;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      server = serve({ port: actualPort, fetch: handler });
      break;
    } catch (e) {
      if (String(e).includes("address already in use")) {
        actualPort++;
      } else {
        throw e;
      }
    }
  }

  if (!server) {
    throw new Error(`No se pudo iniciar el dashboard en los puertos ${port}-${port + 9}`);
  }

  console.log(`\n🟢 Dashboard en http://localhost:${actualPort}`);
  console.log(`   Ctrl+C para cerrar\n`);

  // Cleanup en SIGINT
  process.on("SIGINT", () => {
    server!.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server!.stop();
    process.exit(0);
  });

  // Mantener vivo
  await new Promise(() => {});
}

// Si se ejecuta directamente
if (import.meta.main) {
  await startDashboard();
}
