import type { ISiteConfig, IStatusMapping, ISyncHistoryEntry } from '@shared/types.js';

// In dev, Vite proxies /api to localhost:3200. In production, call Cloud Run directly.
export const API_BASE = import.meta.env.PROD
  ? 'https://clientorders-api-451660797133.europe-west1.run.app'
  : '';

// ─── Site CRUD ────────────────────────────────────────────────────────────────

export async function fetchSites(): Promise<ISiteConfig[]> {
  const res = await fetch(`${API_BASE}/api/sites`);
  if (!res.ok) throw new Error(`GET /api/sites failed: ${res.status}`);
  const data = (await res.json()) as { sites: ISiteConfig[] };
  return data.sites;
}

export async function fetchSite(id: string): Promise<ISiteConfig> {
  const res = await fetch(`${API_BASE}/api/sites/${id}`);
  if (!res.ok) throw new Error(`GET /api/sites/${id} failed: ${res.status}`);
  const data = (await res.json()) as { site: ISiteConfig };
  return data.site;
}

export async function createSite(
  payload: Omit<ISiteConfig, 'id'>,
): Promise<ISiteConfig> {
  const res = await fetch(`${API_BASE}/api/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /api/sites failed: ${res.status}`);
  const data = (await res.json()) as { site: ISiteConfig };
  return data.site;
}

export async function updateSite(
  id: string,
  payload: Partial<ISiteConfig>,
): Promise<ISiteConfig> {
  const res = await fetch(`${API_BASE}/api/sites/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PUT /api/sites/${id} failed: ${res.status}`);
  const data = (await res.json()) as { site: ISiteConfig };
  return data.site;
}

export async function deleteSite(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sites/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /api/sites/${id} failed: ${res.status}`);
}

// ─── Status Mapping ──────────────────────────────────────────────────────────

export async function fetchStatusMapping(siteId: string): Promise<IStatusMapping[]> {
  const res = await fetch(`${API_BASE}/api/mapping/status/${siteId}`);
  if (!res.ok) throw new Error(`GET /api/mapping/status/${siteId} failed: ${res.status}`);
  const data = (await res.json()) as { statusMapping: IStatusMapping[] };
  return data.statusMapping;
}

export async function saveStatusMapping(siteId: string, statusMapping: IStatusMapping[]): Promise<IStatusMapping[]> {
  const res = await fetch(`${API_BASE}/api/mapping/status/${siteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusMapping }),
  });
  if (!res.ok) throw new Error(`PUT /api/mapping/status/${siteId} failed: ${res.status}`);
  const data = (await res.json()) as { statusMapping: IStatusMapping[] };
  return data.statusMapping;
}

export async function detectStatusMapping(siteId: string): Promise<IStatusMapping[]> {
  const res = await fetch(`${API_BASE}/api/mapping/status/${siteId}/detect`, { method: 'POST' });
  if (!res.ok) throw new Error(`POST /api/mapping/status/${siteId}/detect failed: ${res.status}`);
  const data = (await res.json()) as { detectedStatuses: IStatusMapping[] };
  return data.detectedStatuses;
}

// ─── Sync History ───────────────────────────────────────────────────────────

export async function fetchSyncHistory(
  siteId: string,
  limit = 10,
): Promise<ISyncHistoryEntry[]> {
  const res = await fetch(`${API_BASE}/api/sync/history/${siteId}?limit=${limit}`);
  if (!res.ok) throw new Error(`GET sync history failed: ${res.status}`);
  const data = (await res.json()) as { history: ISyncHistoryEntry[] };
  return data.history;
}
