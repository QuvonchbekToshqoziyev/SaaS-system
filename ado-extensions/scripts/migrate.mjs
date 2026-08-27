import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const connectionString = process.env.ADO_EXT_DATABASE_URL;
if (!connectionString) throw new Error('ADO_EXT_DATABASE_URL is required; the sealed base DATABASE_URL is never used.');

const migrationDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationFiles = (await readdir(migrationDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
const pool = new Pool({ connectionString });
try {
  await pool.query('CREATE TABLE IF NOT EXISTS ado_extension_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of migrationFiles) {
    const applied = await pool.query('SELECT 1 FROM ado_extension_migrations WHERE name = $1', [file]);
    if (applied.rowCount) continue;
    await pool.query('BEGIN');
    try {
      await pool.query(await readFile(`${migrationDir}/${file}`, 'utf8'));
      await pool.query('INSERT INTO ado_extension_migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
  console.log(`ADO extension migrations applied: ${migrationFiles.length}.`);
} finally {
  await pool.end();
}
