import type { Platform, IStatusMapping, StandardOrderStatus } from './types.js';

// ─── Platforms ───────────────────────────────────────────────────────────────

export const PLATFORMS: Platform[] = ['woocommerce', 'gomag', 'shopify', 'merchantpro'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  woocommerce: 'WooCommerce',
  gomag: 'GoMag',
  shopify: 'Shopify',
  merchantpro: 'MerchantPro',
};

// ─── Standard BigQuery Target Columns ────────────────────────────────────────

export const STANDARD_COLUMNS = [
  'order_id',
  'order_date',
  'order_status',
  'order_total',
  'currency',
  'product_id',
  'product_sku',
  'product_name',
  'product_price',
  'product_quantity',
  'product_total',
  'source_site',
  'synced_at',
] as const;

export type StandardColumn = (typeof STANDARD_COLUMNS)[number];

// ─── Column Transform Options ─────────────────────────────────────────────────

export const TRANSFORMS = [
  'toString',
  'toNumber',
  'toDate',
  "split(',')",
] as const;

export type Transform = (typeof TRANSFORMS)[number];

// ─── Standard Order Statuses ──────────────────────────────────────────────────

export const STANDARD_ORDER_STATUSES: StandardOrderStatus[] = [
  'order_processed',
  'order_cancelled',
];

// ─── Default Status Mappings per Platform ─────────────────────────────────────

export const DEFAULT_STATUS_MAPPINGS: Record<Platform, IStatusMapping[]> = {
  woocommerce: [
    { sourceStatus: 'pending', targetStatus: 'order_processed' },
    { sourceStatus: 'processing', targetStatus: 'order_processed' },
    { sourceStatus: 'on-hold', targetStatus: 'order_processed' },
    { sourceStatus: 'completed', targetStatus: 'order_processed' },
    { sourceStatus: 'cancelled', targetStatus: 'order_cancelled' },
    { sourceStatus: 'refunded', targetStatus: 'order_cancelled' },
    { sourceStatus: 'failed', targetStatus: 'order_cancelled' },
  ],
  gomag: [
    { sourceStatus: 'Noua', targetStatus: 'order_processed' },
    { sourceStatus: 'In curs de livrare', targetStatus: 'order_processed' },
    { sourceStatus: 'Livrata', targetStatus: 'order_processed' },
    { sourceStatus: 'Finalizata', targetStatus: 'order_processed' },
    { sourceStatus: 'Anulata', targetStatus: 'order_cancelled' },
    { sourceStatus: 'Retur', targetStatus: 'order_cancelled' },
  ],
  shopify: [
    { sourceStatus: 'fulfilled', targetStatus: 'order_processed' },
    { sourceStatus: 'unfulfilled', targetStatus: 'order_processed' },
    { sourceStatus: 'partially_fulfilled', targetStatus: 'order_processed' },
    { sourceStatus: 'cancelled', targetStatus: 'order_cancelled' },
  ],
  merchantpro: [
    { sourceStatus: 'awaiting', targetStatus: 'order_processed' },
    { sourceStatus: 'in_process', targetStatus: 'order_processed' },
    { sourceStatus: 'shipped', targetStatus: 'order_processed' },
    { sourceStatus: 'delivered', targetStatus: 'order_processed' },
    { sourceStatus: 'returned', targetStatus: 'order_cancelled' },
    { sourceStatus: 'cancelled', targetStatus: 'order_cancelled' },
  ],
};

// ─── Default Sync Schedule ────────────────────────────────────────────────────

export const DEFAULT_SYNC_SCHEDULE = '0 6 * * *'; // daily at 6am

// ─── Lookback Days Options ───────────────────────────────────────────────────

export const LOOKBACK_OPTIONS = [30, 90, 120, 365] as const;
export const DEFAULT_LOOKBACK_DAYS = 30;

// ─── Server Config ────────────────────────────────────────────────────────────

export const SERVER_PORT = 3200;
