import { serve } from "bun";
import { join, resolve } from "path";
import { readFile } from "fs/promises";
import { DASHBOARD_PORT, BROKER_URL } from "../shared/constants";
import { ensureBroker } from "../broker/launcher";

const PUBLIC_DIR = join(import.meta.dir, "public");

async function brokerGet(path: string): Promise<unknown> {
  const res = await fetch(`${BROKER_URL}${path}`);
  if (!res.ok) throw new Error(`Broker error ${res.status}`);
  return res.json();
}

function createSSEStream(): ReadableStream {
  let interval: ReturnType<typeof setInterval>;
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = async () => {
        try {
          const stats = await brokerGet("/stats");
          controller.enqueue(enc.encode(`data: ${JSON.stringify(stats)}\n\n`));
        } catch {}
      };
      send();
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
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" };

  // Proxy al broker
  if (path === "/api/peers") {
    const data = await brokerGet("/peers").catch(() => []);
    return Response.json(data, { headers });
  }

  if (path === "/api/stats") {
    const data = await brokerGet("/stats").catch(() => ({ total: 0, working: 0, waiting: 0, idle: 0, peers: [] }));
    return Response.json(data, { headers });
  }

  if (path === "/api/activity") {
    const limit = url.searchParams.get("limit") || "50";
    const data = await brokerGet(`/activity?limit=${limit}`).catch(() => []);
    return Response.json(data, { headers });
  }

  if (path === "/api/stream") {
    const stream = createSSEStream();
    return new Response(stream, {
      headers: { ...headers, "Content-Type": "text/event-stream", "Connection": "keep-alive" },
    });
  }

  // Servir archivos estáticos con sanitización de path traversal
  if (path === "/" || path === "/index.html") {
    try {
      const html = await readFile(join(PUBLIC_DIR, "index.html"), "utf-8");
      return new Response(html, { headers: { ...headers, "Content-Type": "text/html" } });
    } catch {
      return new Response("Dashboard not found", { status: 404 });
    }
  }

  if (path.endsWith(".css") || path.endsWith(".js")) {
    try {
      const safePath = resolve(PUBLIC_DIR, path.slice(1));
      if (!safePath.startsWith(PUBLIC_DIR)) return new Response("Forbidden", { status: 403 });
      const content = await readFile(safePath, "utf-8");
      const type = path.endsWith(".css") ? "text/css" : "application/javascript";
      return new Response(content, { headers: { ...headers, "Content-Type": type } });
    } catch {
      return new Response("", { status: 404 });
    }
  }

  return new Response("Not found", { status: 404 });
}

export async function startDashboard(port = DASHBOARD_PORT): Promise<void> {
  // Asegurar que el broker está corriendo
  await ensureBroker();

  let server;
  let actualPort = port;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      server = serve({ port: actualPort, fetch: handler });
      break;
    } catch (e) {
      if (String(e).includes("already in use") || String(e).includes("in use")) {
        actualPort++;
      } else {
        throw e;
      }
    }
  }

  console.log(`\n🟢 Dashboard en http://localhost:${actualPort}`);
  console.log(`   Broker en localhost:${BROKER_URL.split(":")[2]}`);
  console.log(`   Ctrl+C para cerrar\n`);

  process.on("SIGINT",  () => { server?.stop(); process.exit(0); });
  process.on("SIGTERM", () => { server?.stop(); process.exit(0); });

  await new Promise(() => {});
}

if (import.meta.main) {
  await startDashboard();
}
