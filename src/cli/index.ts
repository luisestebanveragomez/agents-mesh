#!/usr/bin/env bun

import { listCommand } from "./commands/list";
import { askCommand } from "./commands/ask";
import { replyCommand } from "./commands/reply";
import { notifyCommand } from "./commands/notify";
import { checkCommand } from "./commands/check";
import { statusCommand } from "./commands/status";
import { doctorCommand } from "./commands/doctor";
import { register } from "./register";

const [,, command, ...rest] = process.argv;

async function main() {
  switch (command) {
    case "list": {
      await listCommand();
      break;
    }

    case "ask": {
      const [target, ...questionParts] = rest;
      if (!target || questionParts.length === 0) {
        console.error("Uso: claude-peers ask <target> <pregunta>");
        process.exit(1);
      }
      await askCommand(target, questionParts.join(" "));
      break;
    }

    case "reply": {
      const [msgId, ...contentParts] = rest;
      if (!msgId || contentParts.length === 0) {
        console.error("Uso: claude-peers reply <msg_id> <respuesta>");
        process.exit(1);
      }
      await replyCommand(msgId, contentParts.join(" "));
      break;
    }

    case "notify": {
      if (rest.length === 0) {
        console.error("Uso: claude-peers notify <mensaje>");
        process.exit(1);
      }
      await notifyCommand(rest.join(" "));
      break;
    }

    case "check": {
      await checkCommand();
      break;
    }

    case "status": {
      // claude-peers status --task "trabajando en X" --status working
      const opts: Record<string, string> = {};
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--task" && rest[i + 1]) opts.task = rest[++i];
        else if (rest[i] === "--status" && rest[i + 1]) opts.status = rest[++i];
        else if (rest[i] === "--role" && rest[i + 1]) opts.role = rest[++i];
      }
      await statusCommand(opts as any);
      break;
    }

    case "doctor": {
      await doctorCommand();
      break;
    }

    case "register": {
      // claude-peers register [--agent gemini-cli] [--role backend] [--detach]
      const opts: Record<string, string | boolean> = {};
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--agent" && rest[i + 1]) opts.agent = rest[++i];
        else if (rest[i] === "--role" && rest[i + 1]) opts.role = rest[++i];
        else if (rest[i] === "--detach") opts.detach = true;
      }
      await register(opts as any);
      break;
    }

    case "dashboard": {
      const { dashboardCommand } = await import("./commands/dashboard");
      await dashboardCommand();
      break;
    }

    default: {
      console.log(`claude-peers v0.1.0

Uso: claude-peers <comando> [opciones]

Comandos:
  list                              Lista peers activos
  ask <target> <pregunta>           Pregunta a un peer
  reply <msg_id> <respuesta>        Responde un mensaje
  notify <mensaje>                  Notifica a todos los peers
  check                             Revisa mensajes pendientes
  register [--agent <n>] [--role <r>] [--detach]  Registra este agente
  status [--task <t>] [--status <s>]  Actualiza estado
  doctor                            Diagnóstico del sistema
  dashboard                         Abre el dashboard
`);
    }
  }
}

main().catch(console.error);
