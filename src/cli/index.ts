#!/usr/bin/env bun

import { listCommand } from "./commands/list";
import { askCommand } from "./commands/ask";
import { replyCommand } from "./commands/reply";
import { notifyCommand } from "./commands/notify";
import { checkCommand } from "./commands/check";
import { statusCommand } from "./commands/status";
import { doctorCommand } from "./commands/doctor";
import { updateCommand, checkForUpdateSilent, currentVersion } from "./commands/update";

const [,, command, ...rest] = process.argv;

async function main() {
  // Silent update check on every CLI run (non-blocking)
  const skipUpdateCheck = ["mcp", "broker", "update"].includes(command);
  if (!skipUpdateCheck) checkForUpdateSilent();

  switch (command) {
    case "list": {
      await listCommand();
      break;
    }

    case "ask": {
      const [target, ...questionParts] = rest;
      if (!target || questionParts.length === 0) {
        console.error("Usage: agents-mesh ask <target> <question>");
        process.exit(1);
      }
      await askCommand(target, questionParts.join(" "));
      break;
    }

    case "reply": {
      const [msgId, ...contentParts] = rest;
      if (!msgId || contentParts.length === 0) {
        console.error("Usage: agents-mesh reply <msg_id> <response>");
        process.exit(1);
      }
      await replyCommand(msgId, contentParts.join(" "));
      break;
    }

    case "notify": {
      if (rest.length === 0) {
        console.error("Usage: agents-mesh notify <message>");
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

    case "dashboard": {
      const { dashboardCommand } = await import("./commands/dashboard");
      await dashboardCommand();
      break;
    }

    case "mcp": {
      const { main: mcpMain } = await import("../mcp/server");
      await mcpMain();
      break;
    }

    case "broker": {
      await import("../broker/server");
      break;
    }

    case "install": {
      const { installCommand } = await import("./commands/install");
      const [agent, ...installRest] = rest;
      const opts = { global: installRest.includes("--global"), local: installRest.includes("--local") };
      await installCommand(agent, opts);
      break;
    }

    case "uninstall": {
      const { uninstallCommand } = await import("./commands/install");
      const allFlag = rest.includes("--all");
      const agent = allFlag ? "--all" : rest[0];
      const opts = { global: rest.includes("--global"), local: rest.includes("--local"), all: allFlag };
      await uninstallCommand(agent, opts);
      break;
    }

    case "installed": {
      const { installStatusCommand } = await import("./commands/install");
      await installStatusCommand(rest[0]);
      break;
    }

    case "update": {
      await updateCommand();
      break;
    }

    case "--version":
    case "-v": {
      console.log(`agents-mesh v${currentVersion()}`);
      break;
    }

    default: {
      console.log(`agents-mesh v${currentVersion()}

Usage: agents-mesh <command> [options]

Commands:
  list                               List active peers
  ask <target> <question>            Ask another peer a question
  reply <msg_id> <response>          Reply to a message
  notify <message>                   Notify all peers
  check                              Check pending messages
  status [--task <t>] [--status <s>] Update your status
  doctor                             Diagnose the setup
  dashboard                          Open the web dashboard
  install <agent> [--global|--local] Add to an AI agent
  uninstall <agent> [--global|--local] Remove from an AI agent
  uninstall --all                    Remove from all agents
  installed [agent]                  Show installation status
  update                             Update to the latest version
  mcp                                Start the MCP server (stdio)
  broker                             Start the HTTP broker

Agents: claude-code, gemini-cli, opencode, copilot, codex
`);
    }
  }
}

main().catch(console.error);
