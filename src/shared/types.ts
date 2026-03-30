// ─── Platform Types ───────────────────────────────────────────────────────────

export type Platform = 'woocommerce' | 'gomag' | 'shopify' | 'merchantpro';

export type MappingStatus = 'confirmed' | 'unmapped' | 'ignored';

export type SyncStatus = 'success' | 'error' | 'running' | 'idle';

export type StandardOrderStatus =
  | 'order_processed'
  | 'order_cancelled';

export interface IStatusMapping {
  sourceStatus: string;
  targetStatus: StandardOrderStatus;
}

// ─── Site Configuration ───────────────────────────────────────────────────────

export interface ICredentials {
  apiUrl: string;
  apiKey: string;
  apiSecret?: string;
}

export interface IColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  status: MappingStatus;
  transform?: string;
}

export interface ISiteConfig {
  id: string;
  name: string;
  platform: Platform;
  credentials: ICredentials;
  bigqueryTable: string;
  columnMapping: IColumnMapping[];
  statusMapping: IStatusMapping[];
  syncSchedule: string;
  lookbackDays: number;
  hourlySyncEnabled?: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: SyncStatus;
  lastSyncRowCount?: number;
  enabled: boolean;
}

// ─── Order Row (BigQuery target schema) ─────────────────────────────────────

export interface IOrderRow {
  order_id: string;
  order_date: string;
  order_status: string;
  order_total: number;
  currency: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  product_price: number;
  product_quantity: number;
  product_total: number;
  source_site: string;
  synced_at: string;
}

// ─── Sync Result ─────────────────────────────────────────────────────────────

export interface ISyncResult {
  siteId: string;
  status: SyncStatus;
  rowCount: number;
  error?: string;
  startedAt: string;
  completedAt: string;
}

// ─── Sync History ────────────────────────────────────────────────────────────

export type SyncType = 'full' | 'hourly' | 'status_only';

export interface ISyncHistoryEntry {
  siteId: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  status: 'success' | 'error';
  rowCount: number;
  syncType: SyncType;
  error?: string;
}

// ─── API Response Shapes ─────────────────────────────────────────────────────

export interface IApiResponse<T> {
  data: T;
  error?: string;
}

export interface ISitesResponse {
  sites: ISiteConfig[];
}

export interface ISyncStatusResponse {
  siteId: string;
  status: SyncStatus;
  lastSyncAt?: string;
  lastSyncRowCount?: number;
  error?: string;
}
