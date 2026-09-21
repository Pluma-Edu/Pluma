/**
 * Where rendered PDFs live.
 *
 * Two stores on purpose:
 *
 *   PUBLIC   free worksheets. Written under public/ so the static handler
 *            serves them with no application code in the request path. An
 *            SEO-indexed PDF endpoint that renders on request is an unmetered
 *            bill with a crawler attached; these are rendered once, at batch
 *            time, and content-addressed so they can be cached forever.
 *
 *   PRIVATE  answer keys. Written OUTSIDE public/, so the only way to get one
 *            is through the authenticated route. A gate that lives in the URL
 *            is not a gate.
 *
 * On Railway both become object storage buckets; this is the same interface
 * with a filesystem behind it.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const PUBLIC_ROOT = join(process.cwd(), 'public', 'library');
const PRIVATE_ROOT = join(process.cwd(), '.library-private');

export type Visibility = 'public' | 'private';

function rootFor(visibility: Visibility): string {
  return visibility === 'public' ? PUBLIC_ROOT : PRIVATE_ROOT;
}

export function publicUrlFor(key: string): string {
  return `/library/${key}`;
}

export async function put(visibility: Visibility, key: string, body: Buffer): Promise<void> {
  const path = join(rootFor(visibility), key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function get(visibility: Visibility, key: string): Promise<Buffer> {
  return readFile(join(rootFor(visibility), key));
}

export async function exists(visibility: Visibility, key: string): Promise<boolean> {
  try {
    await access(join(rootFor(visibility), key));
    return true;
  } catch {
    return false;
  }
}
