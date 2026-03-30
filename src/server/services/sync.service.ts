import type { ISiteConfig, IOrderRow, ISyncResult, IStatusMapping, SyncType } from '../../shared/types.js';
import type { IConnector } from '../connectors/connector.interface.js';
import { GomagConnector } from '../connectors/gomag.connector.js';
import { WooCommerceConnector } from '../connectors/woocommerce.connector.js';
import { MerchantProConnector } from '../connectors/merchantpro.connector.js';
import { ensureTable, mergeRows, mergeStatusOnly } from './bigquery.service.js';
import { readSites, writeSites } from '../utils/config-loader.js';
import { recordSync } from './sync-history.service.js';

export function mapStatus(raw: string, mappings: IStatusMapping[]): string {
  const lower = raw.toLowerCase();
  const match = mappings.find((m) => m.sourceStatus.toLowerCase() === lower);
  return match ? match.targetStatus : `[UNMAPPED] ${raw}`;
}

const connectors: Record<string, IConnector> = {
  gomag: new GomagConnector(),
  woocommerce: new WooCommerceConnector(),
  merchantpro: new MerchantProConnector(),
};

function getConnector(platform: string): IConnector {
  const connector = connectors[platform];
  if (!connector) throw new Error(`No connector for platform: ${platform}`);
  return connector;
}

/** Helper to record sync result in history */
async function logSyncResult(
  siteId: string,
  startedAt: string,
  status: 'success' | 'error',
  rowCount: number,
  syncType: SyncType,
  error?: string,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const durationSeconds = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );
  await recordSync({
    siteId,
    startedAt,
    completedAt,
    durationSeconds,
    status,
    rowCount,
    syncType,
    error,
  });
}

/** Full sync — fetch all orders in lookback window, MERGE into BigQuery */
export async function syncSite(siteId: string): Promise<ISyncResult> {
  const sites = await readSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) throw new Error(`Site not found: ${siteId}`);
  if (!site.enabled) throw new Error(`Site is disabled: ${siteId}`);

  const startedAt = new Date().toISOString();

  // Mark as running
  site.lastSyncStatus = 'running';
  await writeSites(sites);

  try {
    const connector = getConnector(site.platform);

    // Compute sinceDate from lookbackDays (falls back to 30 days if not set)
    const lookbackMs = (site.lookbackDays ?? 30) * 24 * 60 * 60 * 1000;
    const sinceDate = new Date(Date.now() - lookbackMs).toISOString();

    // Fetch orders within the lookback window
    const { orders, totalAvailable } = await connector.fetchOrders(
      site.credentials,
      sinceDate,
    );

    console.log(
      `[${site.id}] Fetched ${orders.length} orders (${totalAvailable} total available)`,
    );

    // Flatten into rows
    const rows: IOrderRow[] = [];
    for (const raw of orders) {
      rows.push(...connector.flattenOrder(raw, site.id));
    }

    // Normalize order statuses using per-site mapping
    for (const row of rows) {
      row.order_status = mapStatus(row.order_status, site.statusMapping ?? []);
    }

    console.log(`[${site.id}] Flattened into ${rows.length} rows`);

    // Write to BigQuery (MERGE — upsert, no duplicates)
    await ensureTable(site.bigqueryTable);
    await mergeRows(site.bigqueryTable, rows);

    console.log(`[${site.id}] Merged ${rows.length} rows into BigQuery`);

    // Update site config
    site.lastSyncAt = startedAt;
    site.lastSyncStatus = 'success';
    site.lastSyncRowCount = rows.length;
    await writeSites(sites);

    // Record in history
    await logSyncResult(site.id, startedAt, 'success', rows.length, 'full');

    return {
      siteId: site.id,
      status: 'success',
      rowCount: rows.length,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${site.id}] Sync error: ${errorMsg}`);

    site.lastSyncStatus = 'error';
    await writeSites(sites);

    // Record error in history
    await logSyncResult(site.id, startedAt, 'error', 0, 'full', errorMsg);

    return {
      siteId: site.id,
      status: 'error',
      rowCount: 0,
      error: errorMsg,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

/** Hourly sync — only today's orders, full MERGE */
export async function syncSiteHourly(siteId: string): Promise<ISyncResult> {
  const sites = await readSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) throw new Error(`Site not found: ${siteId}`);
  if (!site.enabled) throw new Error(`Site is disabled: ${siteId}`);

  const startedAt = new Date().toISOString();

  try {
    const connector = getConnector(site.platform);

    // Since start of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sinceDate = today.toISOString();

    const { orders } = await connector.fetchOrders(site.credentials, sinceDate);
    console.log(`[${site.id}] Hourly: fetched ${orders.length} today's orders`);

    const rows: IOrderRow[] = [];
    for (const raw of orders) {
      rows.push(...connector.flattenOrder(raw, site.id));
    }
    for (const row of rows) {
      row.order_status = mapStatus(row.order_status, site.statusMapping ?? []);
    }

    await ensureTable(site.bigqueryTable);
    await mergeRows(site.bigqueryTable, rows);

    console.log(`[${site.id}] Hourly: merged ${rows.length} rows`);

    await logSyncResult(site.id, startedAt, 'success', rows.length, 'hourly');

    return {
      siteId: site.id,
      status: 'success',
      rowCount: rows.length,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${site.id}] Hourly sync error: ${errorMsg}`);
    await logSyncResult(site.id, startedAt, 'error', 0, 'hourly', errorMsg);
    return {
      siteId: site.id,
      status: 'error',
      rowCount: 0,
      error: errorMsg,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

/** Daily status update — fetch orders, only UPDATE status of existing rows (no new inserts) */
export async function syncSiteStatusOnly(siteId: string): Promise<ISyncResult> {
  const sites = await readSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) throw new Error(`Site not found: ${siteId}`);
  if (!site.enabled) throw new Error(`Site is disabled: ${siteId}`);

  const startedAt = new Date().toISOString();

  try {
    const connector = getConnector(site.platform);
    const lookbackMs = (site.lookbackDays ?? 30) * 24 * 60 * 60 * 1000;
    const sinceDate = new Date(Date.now() - lookbackMs).toISOString();

    const { orders } = await connector.fetchOrders(site.credentials, sinceDate);

    const rows: IOrderRow[] = [];
    for (const raw of orders) {
      rows.push(...connector.flattenOrder(raw, site.id));
    }
    for (const row of rows) {
      row.order_status = mapStatus(row.order_status, site.statusMapping ?? []);
    }

    await ensureTable(site.bigqueryTable);
    await mergeStatusOnly(site.bigqueryTable, rows);

    console.log(`[${site.id}] Status-only: updated ${rows.length} rows`);

    await logSyncResult(site.id, startedAt, 'success', rows.length, 'status_only');

    return {
      siteId: site.id,
      status: 'success',
      rowCount: rows.length,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${site.id}] Status sync error: ${errorMsg}`);
    await logSyncResult(site.id, startedAt, 'error', 0, 'status_only', errorMsg);
    return {
      siteId: site.id,
      status: 'error',
      rowCount: 0,
      error: errorMsg,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

export async function syncAll(): Promise<ISyncResult[]> {
  const sites = await readSites();
  const enabledSites = sites.filter((s) => s.enabled);
  const results: ISyncResult[] = [];

  for (const site of enabledSites) {
    const result = await syncSite(site.id);
    results.push(result);
  }

  return results;
}

/** Fetch a sample of orders without writing to BigQuery — for column detection and preview */
export async function fetchSample(
  site: ISiteConfig,
  limit = 2,
): Promise<Record<string, unknown>[]> {
  const connector = getConnector(site.platform);
  return connector.fetchSample(site.credentials, limit);
}
