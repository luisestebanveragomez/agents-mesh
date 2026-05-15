import { execSync } from "child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir, platform, arch } from "os";

const REPO = "luisestebanveragomez/agents-mesh";
const CACHE_DIR = join(homedir(), ".agents-mesh");
const VERSION_CACHE = join(CACHE_DIR, "latest-version.json");
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ── Platform detection ─────────────────────────────────────────────────────────

function getPlatformTarget(): string {
  const os = platform();
  const cpu = arch();

  if (os === "darwin" && cpu === "arm64") return "darwin-arm64";
  if (os === "darwin") return "x64";
  if (os === "linux" && cpu === "arm64") return "linux-arm64";
  if (os === "linux") return "linux-x64";

  throw new Error(`Unsupported platform: ${os} ${cpu}`);
}

// ── GitHub API ─────────────────────────────────────────────────────────────────

async function fetchLatestVersion(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { "User-Agent": "agents-mesh-cli" },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = (await res.json()) as { tag_name: string };
  return data.tag_name; // e.g. "v0.1.1"
}

// ── Version cache (for update notifications) ───────────────────────────────────

interface VersionCache {
  latest: string;
  checkedAt: number;
}

function readVersionCache(): VersionCache | null {
  try {
    if (!existsSync(VERSION_CACHE)) return null;
    const data = JSON.parse(readFileSync(VERSION_CACHE, "utf-8")) as VersionCache;
    return data;
  } catch {
    return null;
  }
}

function writeVersionCache(latest: string): void {
  mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(VERSION_CACHE, JSON.stringify({ latest, checkedAt: Date.now() }, null, 2), { encoding: "utf-8", mode: 0o600 });
}

// ── Public: background check (used on every CLI run) ──────────────────────────

export function currentVersion(): string {
  try {
    // Works both in bun dev mode and compiled binary (bun embeds package.json)
    const pkg = require("../../../package.json");
    return pkg.version as string;
  } catch {
    return "0.0.0";
  }
}

export async function checkForUpdateSilent(): Promise<void> {
  // Only run if installed as a compiled binary (not bun dev mode)
  const isBinary = !process.argv[0]?.includes("bun");
  if (!isBinary) return;

  try {
    const cache = readVersionCache();
    const now = Date.now();

    // Use cache if fresh
    if (cache && now - cache.checkedAt < VERSION_CACHE_TTL_MS) {
      printUpdateNotice(cache.latest);
      return;
    }

    // Fetch in background (don't await — fire and forget for next run)
    fetchLatestVersion()
      .then((latest) => {
        writeVersionCache(latest);
      })
      .catch(() => {}); // silently ignore network errors

    // If we have a stale cache, still show it
    if (cache) printUpdateNotice(cache.latest);
  } catch {
    // Never crash the CLI due to update check
  }
}

function printUpdateNotice(latest: string): void {
  const current = `v${currentVersion()}`;
  if (latest !== current) {
    console.error(`\n  💡 Update available: ${current} → ${latest}`);
    console.error(`     Run: agents-mesh update\n`);
  }
}

// ── Public: agents-mesh update command ────────────────────────────────────────

export async function updateCommand(): Promise<void> {
  const current = `v${currentVersion()}`;
  console.log(`Current version: ${current}`);
  console.log("Checking for updates...");

  let latest: string;
  try {
    latest = await fetchLatestVersion();
  } catch (e) {
    console.error("Could not reach GitHub. Check your connection.");
    process.exit(1);
  }

  if (latest === current) {
    console.log(`✓ Already up to date (${current})`);
    return;
  }

  console.log(`New version available: ${latest}`);

  // Find where the binary is installed
  let binaryPath: string;
  try {
    binaryPath = execSync("which agents-mesh", { encoding: "utf-8" }).trim();
  } catch {
    console.error("Could not find agents-mesh binary in PATH.");
    process.exit(1);
  }

  let target: string;
  try {
    target = getPlatformTarget();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const assetName = `agents-mesh-${target}.tar.gz`;
  const downloadUrl = `https://github.com/${REPO}/releases/download/${latest}/${assetName}`;

  console.log(`Downloading ${assetName}...`);

  try {
    const tmpTar = `${binaryPath}.tar.gz.tmp`;
    const tmpDir = `${binaryPath}.extract.tmp`;

    execSync(`curl -fsSL "${downloadUrl}" -o "${tmpTar}"`, { stdio: "inherit" });
    execSync(`mkdir -p "${tmpDir}"`);
    execSync(`tar -xzf "${tmpTar}" -C "${tmpDir}"`);

    // Binary inside tar is named agents-mesh-<target>
    const extractedBin = `${tmpDir}/agents-mesh-${target}`;
    execSync(`chmod +x "${extractedBin}"`);
    execSync(`mv "${extractedBin}" "${binaryPath}"`);

    // Cleanup
    execSync(`rm -rf "${tmpTar}" "${tmpDir}"`);

    writeVersionCache(latest);
    console.log(`\n✓ Updated to ${latest}. Restart your agents to activate.`);
  } catch (e) {
    console.error("Update failed. Try running with sudo or re-run the install script:");
    console.error(`  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | bash`);
    process.exit(1);
  }
}
