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

**CLI**
- `agents-mesh list` — lista peers
- `agents-mesh ask <target> <msg>` — pregunta
- `agents-mesh reply <id> <msg>` — responde
- `agents-mesh notify <msg>` — broadcast
- `agents-mesh check` — mensajes pendientes
- `agents-mesh register` — registra agente sin MCP
- `agents-mesh status` — actualiza estado
- `agents-mesh doctor` — diagnóstico
- `agents-mesh dashboard` — dashboard web
- `agents-mesh install <agent>` — instala en un agente
- `agents-mesh uninstall [--all]` — desinstala

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
- Claude Code, Gemini CLI, OpenCode, Copilot, Codex (MCP nativo)
- Cualquier agente compatible con MCP (Cursor, Windsurf, Cline/Roo, etc.)
