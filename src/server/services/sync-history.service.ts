import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ISyncHistoryEntry } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.resolve(__dirname, '../../../config/sync-history.json');
const MAX_ENTRIES_PER_SITE = 100;

type HistoryStore = Record<string, ISyncHistoryEntry[]>;

let writeLock = false;

async function readHistory(): Promise<HistoryStore> {
  try {
    const data = await fs.readFile(HISTORY_PATH, 'utf-8');
    return JSON.parse(data) as HistoryStore;
  } catch {
    return {};
  }
}

async function writeHistory(store: HistoryStore): Promise<void> {
  // Simple lock to prevent concurrent writes
  while (writeLock) {
    await new Promise((r) => setTimeout(r, 50));
  }
  writeLock = true;
  try {
    await fs.writeFile(HISTORY_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } finally {
    writeLock = false;
  }
}

/** Record a sync execution in history */
export async function recordSync(entry: ISyncHistoryEntry): Promise<void> {
  const store = await readHistory();
  if (!store[entry.siteId]) {
    store[entry.siteId] = [];
  }

  store[entry.siteId].unshift(entry); // newest first

  // Trim to max entries
  if (store[entry.siteId].length > MAX_ENTRIES_PER_SITE) {
    store[entry.siteId] = store[entry.siteId].slice(0, MAX_ENTRIES_PER_SITE);
  }

  await writeHistory(store);
}

/** Get history for a specific site */
export async function getHistory(siteId: string, limit = 20): Promise<ISyncHistoryEntry[]> {
  const store = await readHistory();
  const entries = store[siteId] || [];
  return entries.slice(0, limit);
}

/** Get history for all sites */
export async function getAllHistory(
  limit = 5,
): Promise<Record<string, ISyncHistoryEntry[]>> {
  const store = await readHistory();
  const result: Record<string, ISyncHistoryEntry[]> = {};
  for (const [siteId, entries] of Object.entries(store)) {
    result[siteId] = entries.slice(0, limit);
  }
  return result;
}
