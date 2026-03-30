import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ISiteConfig } from '../../shared/types.js';
import { DEFAULT_STATUS_MAPPINGS } from '../../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../../config/sites.json');
const CONFIG_DIR = path.dirname(CONFIG_PATH);

// Simple async mutex to prevent concurrent write corruption
let writeLock: Promise<void> = Promise.resolve();

async function ensureConfigExists(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_PATH)) {
    await writeFile(CONFIG_PATH, JSON.stringify([], null, 2), 'utf-8');
  }
}

export async function readSites(): Promise<ISiteConfig[]> {
  await ensureConfigExists();
  const raw = await readFile(CONFIG_PATH, 'utf-8');
  const sites = JSON.parse(raw) as ISiteConfig[];
  // Auto-populate missing statusMapping from platform defaults
  for (const site of sites) {
    if (!site.statusMapping || site.statusMapping.length === 0) {
      site.statusMapping = DEFAULT_STATUS_MAPPINGS[site.platform] ?? [];
    }
  }
  return sites;
}

export async function writeSites(sites: ISiteConfig[]): Promise<void> {
  await ensureConfigExists();
  // Chain onto the existing lock so concurrent writes are serialized
  writeLock = writeLock.then(() =>
    writeFile(CONFIG_PATH, JSON.stringify(sites, null, 2), 'utf-8'),
  );
  await writeLock;
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function ensureUniqueId(slug: string, existing: ISiteConfig[]): string {
  const ids = new Set(existing.map((s) => s.id));
  if (!ids.has(slug)) return slug;
  let i = 2;
  while (ids.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}
