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

export async function main() {
  await startPeer();

  const server = new Server(
    { name: "agents-mesh", version: "0.1.0" },
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
        description: "List all active AI agent instances in the mesh",
        inputSchema: {
          type: "object",
          properties: {
            filter: {
              type: "object",
              description: "Optional filters",
              properties: {
                role:          { type: "string", description: "Filter by role (e.g. backend, frontend)" },
                agent:         { type: "string", description: "Filter by agent type (e.g. claude-code)" },
                active_within: { type: "number", description: "Only peers active in the last N seconds" },
                exclude_self:  { type: "boolean", description: "Exclude this peer from results" },
              },
            },
          },
        },
      },
      {
        name: "peers_status",
        description: "Update the current peer's status (visible in the dashboard and to other peers)",
        inputSchema: {
          type: "object",
          properties: {
            role:         { type: "string", description: "New role for this peer" },
            current_task: { type: "string", description: "Description of the current task" },
            status:       { type: "string", enum: ["working", "idle", "waiting"], description: "Current status" },
          },
        },
      },
      {
        name: "peers_ask",
        description: "Ask another peer a question and wait for the reply. Accepts peer ID or role as target.",
        inputSchema: {
          type: "object",
          required: ["target", "question"],
          properties: {
            target:            { type: "string", description: "Peer ID or role (e.g. 'backend', 'peer_abc123')" },
            question:          { type: "string", description: "The question to ask" },
            search_if_unknown: { type: "boolean", description: "Should the peer investigate if it doesn't know?" },
            search_scope:      { type: "string", description: "Path to search in (e.g. src/auth/)" },
            timeout_seconds:   { type: "number", description: "Override floor timeout in seconds. Omit to use adaptive default (idle=120s, working=600s, waiting=300s)." },
          },
        },
      },
      {
        name: "peers_reply",
        description: "Reply to a message received from another peer",
        inputSchema: {
          type: "object",
          required: ["message_id", "content"],
          properties: {
            message_id: { type: "string", description: "ID of the message to reply to" },
            content:    { type: "string", description: "The reply content" },
          },
        },
      },
      {
        name: "peers_notify",
        description: "Send a notification to one or more peers without waiting for a reply",
        inputSchema: {
          type: "object",
          required: ["target", "message"],
          properties: {
            target:   { type: "string", description: "Peer ID, role, array of ids/roles, or 'all'" },
            message:  { type: "string", description: "The message to send" },
            category: { type: "string", enum: ["info", "warning", "change"], description: "Message category" },
          },
        },
      },
      {
        name: "peers_search",
        description: "Ask all peers who has context on a given topic",
        inputSchema: {
          type: "object",
          required: ["topic"],
          properties: {
            topic:           { type: "string", description: "The topic to search for" },
            timeout_seconds: { type: "number", description: "Override floor timeout in seconds. Omit to use adaptive default (idle=120s, working=600s, waiting=300s)." },
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

if (import.meta.main) {
  main().catch(console.error);
}
