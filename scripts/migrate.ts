/** SQL-first migrations. Files run in filename order, once, inside a transaction. */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, query, close } from '../src/lib/db/client.ts';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migration (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now())`);

  const applied = new Set(
    (await query<{ filename: string }>('SELECT filename FROM schema_migration')).map((r) => r.filename),
  );
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS, file), 'utf8');
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
      ran++;
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.log(ran === 0 ? 'up to date' : `${ran} migration(s) applied`);
  await close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
