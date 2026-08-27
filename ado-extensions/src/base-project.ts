import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type BaseProjectSnapshot = Readonly<{
  root: string;
  version: string;
  clientVersion: string | null;
  serverVersion: string | null;
  versionConsistent: boolean;
  routes: readonly string[];
  models: readonly string[];
}>;

async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

function packageVersion(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export async function readBaseProject(baseRoot = process.env.ADO_BASE_PROJECT_PATH || '../airline-b2b'): Promise<BaseProjectSnapshot> {
  const root = resolve(process.cwd(), baseRoot);
  const [version, clientPackage, serverPackage, indexSource, schema] = await Promise.all([
    readText(join(root, 'VERSION')).catch(() => readText(join(root, '..', 'VERSION'))),
    readText(join(root, 'client', 'package.json')),
    readText(join(root, 'server', 'package.json')),
    readText(join(root, 'server', 'src', 'index.ts')),
    readText(join(root, 'server', 'prisma', 'schema.prisma')),
  ]);

  const routes = [...indexSource.matchAll(/app\.use\(['"](\/[^'"]*)['"]/g)].map((match) => match[1]);
  const models = [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);

  const normalizedVersion = version.trim();
  const clientVersion = packageVersion(clientPackage);
  const serverVersion = packageVersion(serverPackage);
  return Object.freeze({
    root,
    version: normalizedVersion,
    clientVersion,
    serverVersion,
    versionConsistent: Boolean(normalizedVersion && clientVersion === normalizedVersion && serverVersion === normalizedVersion),
    routes: Object.freeze(uniqueSorted(routes)),
    models: Object.freeze(uniqueSorted(models)),
  });
}
