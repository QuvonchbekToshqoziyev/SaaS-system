import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lockJson = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
if (packageJson.private !== true) throw new Error('Extension package must remain private until an explicit publish decision.');
if (packageJson.engines?.node !== '>=20') throw new Error('Node 20 runtime contract is missing.');
if (lockJson.packages?.['']?.version !== packageJson.version) throw new Error('package-lock.json version is out of sync.');

const migrationFiles = (await readdir(join(root, 'migrations'))).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
const expected = migrationFiles.map((file, index) => `${String(index + 1).padStart(3, '0')}_${file.split('_').slice(1).join('_')}`);
if (migrationFiles.length === 0 || migrationFiles.some((file, index) => file !== expected[index])) throw new Error('Migrations must be contiguous and zero-padded from 001.');

const sourceFiles = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !['dist', 'node_modules'].includes(entry.name)) await collect(path);
    else if (entry.isFile() && /\.(ts|mjs)$/.test(entry.name)) sourceFiles.push(path);
  }
}
await collect(join(root, 'src'));
await collect(join(root, 'scripts'));
for (const path of sourceFiles) {
  const source = await readFile(path, 'utf8');
  if (/process\.env\.DATABASE_URL\b/.test(source)) throw new Error(`Sealed base DATABASE_URL access found in ${path}`);
  if (/from ['"][^'"]*airline-b2b[^'"]*['"]/.test(source)) throw new Error(`Runtime base import found in ${path}`);
}
console.log(`Release check passed: ${migrationFiles.length} migrations, ${sourceFiles.length} source files, private package, base write boundary clean.`);
