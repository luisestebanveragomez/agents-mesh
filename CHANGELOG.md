# Changelog

## v0.1.0 — 2026-04-29

### Inicial

**MCP Server (7 tools)**
- `peers_list` — lista peers activos con filtros
- `peers_status` — actualiza estado del peer actual
- `peers_ask` — pregunta a otro peer y espera respuesta
- `peers_reply` — responde un mensaje recibido
- `peers_notify` — broadcast a uno o varios peers
- `peers_search` — descubre qué peer sabe sobre un tema
- `peers_check` — revisa mensajes pendientes

**CLI Wrapper**
- `claude-peers list` — lista peers
- `claude-peers ask <target> <msg>` — pregunta
- `claude-peers reply <id> <msg>` — responde
- `claude-peers notify <msg>` — broadcast
- `claude-peers check` — mensajes pendientes
- `claude-peers register` — registra agente sin MCP
- `claude-peers status` — actualiza estado
- `claude-peers doctor` — diagnóstico
- `claude-peers dashboard` — dashboard web

**Dashboard**
- Grafo de peers en tiempo real (Cytoscape.js)
- Activity feed con SSE (actualización cada 2s)
- Peer cards con estado y ID copiable
- Dark mode

**Seguridad**
- Anti-injection patterns
- Rate limiting (30 msgs/min por peer)
- TTL en mensajes
- Mensajes marcados como información, no instrucciones

**Agentes soportados**
- Claude Code (MCP nativo)
- OpenCode (MCP nativo)
- Gemini CLI, Copilot, Codex (via CLI wrapper)
