import { readFile, access } from "fs/promises";
import { join, basename } from "path";

export async function inferRole(cwd: string): Promise<string> {
  try {
    const pkgPath = join(cwd, "package.json");
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps["next"] || deps["react"])        return buildRole(cwd, "frontend");
    if (deps["react-native"] || deps["expo"]) return buildRole(cwd, "mobile");
    if (deps["express"] || deps["fastify"] || deps["hono"]) return buildRole(cwd, "backend");
  } catch {
    // package.json no existe o no parseable
  }

  // Checks por archivos especiales
  if (await fileExists(join(cwd, "Dockerfile")) || await fileExists(join(cwd, "docker-compose.yml"))) {
    return buildRole(cwd, "devops");
  }
  if (await fileExists(join(cwd, "schema.prisma")) || await fileExists(join(cwd, "migrations"))) {
    return buildRole(cwd, "database");
  }

  return basename(cwd);
}

function buildRole(cwd: string, base: string): string {
  return `${base}-${basename(cwd)}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
