#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

// C4: use ~/.agents-mesh/ instead of /tmp/ to avoid world-writable symlink attacks
const PEER_MAP_DIR = path.join(os.homedir(), ".agents-mesh", "peers");
const BROKER_PORT = process.env.AGENTS_MESH_BROKER_PORT || 7899;
// L6: move log out of /tmp/ to avoid symlink attacks on the log file
const LOG_DIR = path.join(os.homedir(), ".agents-mesh", "logs");
const LOG = path.join(LOG_DIR, "hook.log");

function ensureLogDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 }); } catch {}
}

function log(msg) {
  ensureLogDir();
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
}

function findPeerId() {
  let pid = process.ppid;
  log(`hook started — pid=${process.pid} ppid=${pid}`);
  for (let i = 0; i < 8; i++) {
    const file = path.join(PEER_MAP_DIR, String(pid));
    const exists = fs.existsSync(file);
    log(`  check ${file} → ${exists ? fs.readFileSync(file,"utf-8").trim() : "not found"}`);
    if (exists) {
      try { return fs.readFileSync(file, "utf-8").trim(); } catch {}
    }
    try {
      const ppid = execSync(`ps -o ppid= -p ${pid}`, { encoding: "utf-8" }).trim();
      const next = Number(ppid);
      if (!next || next === pid || next === 1) break;
      pid = next;
    } catch { break; }
  }
  return null;
}

function checkCount(peerId) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${BROKER_PORT}/message/count/${peerId}`,
      { timeout: 1500 },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const count = JSON.parse(data).count ?? 0;
            log(`  count for ${peerId} = ${count}`);
            resolve(count);
          } catch { resolve(0); }
        });
      }
    );
    req.on("error", (e) => { log(`  broker error: ${e.message}`); resolve(0); });
    req.on("timeout", () => { req.destroy(); resolve(0); });
  });
}

async function main() {
  const peerId = findPeerId();
  if (!peerId) { log("  no peer found, exiting"); return; }

  const count = await checkCount(peerId);
  if (count === 0) return;

  const noun = count === 1 ? "message" : "messages";
  const output = JSON.stringify({
    inject: `\n\n📨 **[Agent Mesh] You have ${count} pending ${noun} from other agents.** Call \`peers_check\` to read ${count === 1 ? "it" : "them"} before responding.\n`,
  });
  log(`  injecting: ${output}`);
  process.stdout.write(output);
}

main().catch((e) => log(`error: ${e.message}`));
