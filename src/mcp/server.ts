import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { startPeer, getCurrentPeerId, getPendingCount, setToolListChangedNotifier } from "./lifecycle";
import { brokerFetch } from "../broker/launcher";
import { peersListTool } from "./tools/peers-list";
import { peersStatusTool } from "./tools/peers-status";
import { peersAskTool } from "./tools/peers-ask";
import { peersReplyTool } from "./tools/peers-reply";
import { peersNotifyTool } from "./tools/peers-notify";
import { peersSearchTool } from "./tools/peers-search";
import { peersCheckTool } from "./tools/peers-check";

async function main() {
  await startPeer();

  const server = new Server(
    { name: "claude-peers", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Wire up poll loop → sendToolListChanged so agents re-fetch descriptions on new messages
  setToolListChangedNotifier(() => {
    server.sendToolListChanged().catch(() => {});
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const pending = getPendingCount();
    const checkDesc = pending > 0
      ? `Check for pending messages — ⚠️ ${pending} UNREAD MESSAGE${pending > 1 ? "S" : ""} RIGHT NOW`
      : "Check for pending messages from other agents";

    return { tools: [
      {
        name: "peers_list",
        description: "Lista todas las instancias de agentes IA activos en el sistema",
        inputSchema: {
          type: "object",
          properties: {
            filter: {
              type: "object",
              description: "Filtros opcionales",
              properties: {
                role:          { type: "string", description: "Filtrar por role (ej: backend, frontend)" },
                agent:         { type: "string", description: "Filtrar por tipo de agente (ej: claude-code)" },
                active_within: { type: "number", description: "Solo peers activos en los últimos N segundos" },
                exclude_self:  { type: "boolean", description: "Excluir este peer de los resultados" },
              },
            },
          },
        },
      },
      {
        name: "peers_status",
        description: "Actualiza el estado del peer actual (visible en el dashboard y para otros peers)",
        inputSchema: {
          type: "object",
          properties: {
            role:         { type: "string", description: "Nuevo role para este peer" },
            current_task: { type: "string", description: "Descripción de la tarea actual" },
            status:       { type: "string", enum: ["working", "idle", "waiting"], description: "Estado actual" },
          },
        },
      },
      {
        name: "peers_ask",
        description: "Hace una pregunta a otro peer y espera respuesta. Acepta ID directo o role como target.",
        inputSchema: {
          type: "object",
          required: ["target", "question"],
          properties: {
            target:            { type: "string", description: "ID del peer o su role (ej: 'backend', 'peer_abc123')" },
            question:          { type: "string", description: "La pregunta a hacer" },
            search_if_unknown: { type: "boolean", description: "¿Debe investigar si no lo sabe?" },
            search_scope:      { type: "string", description: "Ruta donde buscar (ej: src/auth/)" },
            timeout_seconds:   { type: "number", description: "Timeout en segundos (default: 30)" },
          },
        },
      },
      {
        name: "peers_reply",
        description: "Responde a un mensaje recibido de otro peer",
        inputSchema: {
          type: "object",
          required: ["message_id", "content"],
          properties: {
            message_id: { type: "string", description: "ID del mensaje a responder" },
            content:    { type: "string", description: "El contenido de la respuesta" },
          },
        },
      },
      {
        name: "peers_notify",
        description: "Envía una notificación a uno o varios peers sin esperar respuesta",
        inputSchema: {
          type: "object",
          required: ["target", "message"],
          properties: {
            target:   { type: "string", description: "ID del peer, role, array de ids/roles, o 'all'" },
            message:  { type: "string", description: "El mensaje a enviar" },
            category: { type: "string", enum: ["info", "warning", "change"], description: "Categoría del mensaje" },
          },
        },
      },
      {
        name: "peers_search",
        description: "Pregunta a todos los peers quién tiene contexto sobre un tema",
        inputSchema: {
          type: "object",
          required: ["topic"],
          properties: {
            topic:           { type: "string", description: "El tema sobre el que buscar" },
            timeout_seconds: { type: "number", description: "Timeout en segundos (default: 30)" },
          },
        },
      },
      {
        name: "peers_check",
        description: checkDesc,
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ]};
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Auto-status: marcar como "working" o "waiting" antes de ejecutar
    const selfId = getCurrentPeerId();
    if (selfId) {
      const statusDuringTool = (name === "peers_ask" || name === "peers_search") ? "waiting" : "working";
      brokerFetch("/peer/heartbeat", {
        method: "POST",
        body: JSON.stringify({ id: selfId, status: statusDuringTool }),
      }).catch(() => {});
    }

    try {
      let result: unknown;

      switch (name) {
        case "peers_list":   result = await peersListTool(args as any);   break;
        case "peers_status": result = await peersStatusTool(args as any); break;
        case "peers_ask":    result = await peersAskTool(args as any);    break;
        case "peers_reply":  result = await peersReplyTool(args as any);  break;
        case "peers_notify": result = await peersNotifyTool(args as any); break;
        case "peers_search": result = await peersSearchTool(args as any); break;
        case "peers_check":  result = await peersCheckTool();             break;
        default:
          return { content: [{ type: "text", text: `Tool desconocida: ${name}` }], isError: true };
      }

      // Auto-status: volver a "idle" después de ejecutar
      if (selfId) {
        brokerFetch("/peer/heartbeat", {
          method: "POST",
          body: JSON.stringify({ id: selfId, status: "idle" }),
        }).catch(() => {});
      }


      // Middleware: incluir mensajes pendientes en cada respuesta
      const { getPendingMessages, clearPendingMessages } = await import("./lifecycle");
      const pending = getPendingMessages();
      if (pending.length > 0 && name !== "peers_check" && name !== "peers_reply") {
        const { formatForAgent } = await import("./security");
        const formatted = pending.map(msg => formatForAgent({
          id: msg.id, from: msg.from_id, from_role: msg.from_role, from_agent: msg.from_agent as any,
          to: msg.to_id, to_role: msg.to_role, type: msg.type as any, content: msg.content,
          metadata: {}, created_at: msg.created_at, expires_at: msg.expires_at,
          read_at: null, responded_at: null,
        })).join("\n\n---\n\n");
        clearPendingMessages();

        return {
          content: [
            {
              type: "text",
              text: `⚠️ MENSAJES PENDIENTES DE OTROS PEERS:\n\n${formatted}\n\n---\n\nRESULTADO DE ${name}:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Auto-status: volver a "idle" en error también
      if (selfId) {
        brokerFetch("/peer/heartbeat", {
          method: "POST",
          body: JSON.stringify({ id: selfId, status: "idle" }),
        }).catch(() => {});
      }
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
