# Clientorders — Agency Order Aggregator

## Project Overview

Clientorders is a web application that connects to 20+ e-commerce sites (WooCommerce, GoMag, Shopify) via their APIs, pulls order data, maps columns per site through a visual UI, and pushes normalized data into BigQuery — one table per site.

Built for a digital agency managing multiple client stores across different e-commerce platforms.

## Tech Stack

- **Frontend**: React 19 + TypeScript (strict mode)
- **Build**: Vite
- **Styling**: Tailwind CSS
- **Backend**: Node.js + Express (API proxy + cron scheduler)
- **Database**: BigQuery (one table per site, existing GCP project)
- **Config Storage**: Local JSON files (site credentials, column mappings)
- **Deployment**: Local first → Firebase Hosting later
- **Cron**: node-cron or similar (daily automatic sync)

## Architecture

### Data Flow

```
[Site Config JSON] → defines: platform, API credentials, column mapping
           ↓
[API Connector] → fetches orders from WooCommerce / GoMag / Shopify APIs
           ↓
[Column Mapper] → applies per-site mapping to normalize fields
           ↓
[BigQuery Writer] → inserts rows into site-specific table
           ↓
[Dashboard UI] → shows sync status, last sync time, row counts
```

### File Structure

```
clientorders/
├── CLAUDE.md                         ← This file
├── PROJECT.md                        ← Detailed specification
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.local                        ← BigQuery credentials path, ports
├── config/
│   ├── sites.json                    ← All site definitions (name, platform, credentials, mapping)
│   └── bigquery-service-account.json ← GCP service account key (NEVER commit)
├── src/
│   ├── server/
│   │   ├── index.ts                  ← Express server entry
│   │   ├── routes/
│   │   │   ├── sites.routes.ts       ← CRUD for site configs
│   │   │   ├── sync.routes.ts        ← Manual sync triggers
│   │   │   ├── mapping.routes.ts     ← Column mapping endpoints
│   │   │   └── status.routes.ts      ← Sync status & logs
│   │   ├── connectors/
│   │   │   ├── connector.interface.ts ← Common interface for all platforms
│   │   │   ├── woocommerce.connector.ts
│   │   │   ├── gomag.connector.ts
│   │   │   └── shopify.connector.ts
│   │   ├── services/
│   │   │   ├── sync.service.ts       ← Orchestrates fetch → map → write
│   │   │   ├── mapping.service.ts    ← Applies column mapping transforms
│   │   │   ├── bigquery.service.ts   ← BigQuery client (create table, insert rows)
│   │   │   └── scheduler.service.ts  ← Daily cron job
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── config-loader.ts      ← Reads sites.json safely
│   ├── client/
│   │   ├── index.html
│   │   ├── App.tsx                   ← React root
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx     ← Overview: all sites, sync status, last sync
│   │   │   ├── SiteConfigPage.tsx    ← Add/edit site: platform, credentials
│   │   │   └── ColumnMappingPage.tsx ← Visual column mapping UI (like screenshot)
│   │   ├── components/
│   │   │   ├── SiteCard.tsx          ← Site status card (name, platform, last sync, status)
│   │   │   ├── MappingTable.tsx      ← Column mapping table (YOUR COLUMN ↔ STANDARD COLUMN)
│   │   │   ├── CredentialForm.tsx    ← Dynamic form: API key, or API key + secret
│   │   │   ├── SyncButton.tsx        ← Manual sync trigger with progress
│   │   │   └── StatusBadge.tsx       ← Sync status indicator
│   │   └── services/
│   │       └── api.service.ts        ← Frontend API client
│   └── shared/
│       ├── types.ts                  ← Shared types (ISiteConfig, IOrderRow, IColumnMapping, etc.)
│       └── constants.ts              ← Standard column names, platform list
└── .gitignore
```

## Core Concepts

### Site Configuration (sites.json)

```typescript
interface ISiteConfig {
  id: string;                    // unique slug: "arlight-ro"
  name: string;                  // display name: "Arlight.ro"
  platform: 'woocommerce' | 'gomag' | 'shopify';
  credentials: {
    apiUrl: string;              // base URL: "https://arlight.ro/wp-json/wc/v3"
    apiKey: string;              // consumer key or API key
    apiSecret?: string;          // consumer secret (WooCommerce needs both, some don't)
  };
  bigqueryTable: string;         // BQ table name: "orders_arlight_ro"
  columnMapping: IColumnMapping[];  // per-site column mapping
  syncSchedule: string;          // cron expression: "0 6 * * *" (daily at 6am)
  lastSyncAt?: string;           // ISO timestamp
  lastSyncStatus?: 'success' | 'error' | 'running';
  lastSyncRowCount?: number;
  enabled: boolean;
}
```

### Column Mapping

```typescript
interface IColumnMapping {
  sourceColumn: string;          // column name from the platform API: "order_id"
  targetColumn: string;          // standard column name: "order_id"
  status: 'confirmed' | 'unmapped' | 'ignored';
  transform?: string;            // optional transform: "toNumber", "toDate", "split(',')"
}
```

### Standard Target Columns (BigQuery Schema)

Every site table in BigQuery has these standard columns:

| Column | Type | Description |
|--------|------|-------------|
| `order_id` | STRING | Order ID from the platform |
| `order_date` | TIMESTAMP | Date/time the order was placed |
| `order_status` | STRING | Status: delivered, placed, pending, cancelled, etc. |
| `order_total` | FLOAT | Total order value |
| `currency` | STRING | Currency code (RON, EUR, USD) |
| `product_id` | STRING | Product ID |
| `product_sku` | STRING | Product SKU |
| `product_name` | STRING | Product name |
| `product_price` | FLOAT | Individual product price |
| `product_quantity` | INTEGER | Quantity ordered |
| `product_total` | FLOAT | product_price × product_quantity |
| `source_site` | STRING | Site slug (e.g. "arlight-ro") |
| `synced_at` | TIMESTAMP | When the row was synced |

**Note**: One order with multiple products = multiple rows (one per product line item).

## Platform Connectors

### WooCommerce
- **Auth**: Consumer Key + Consumer Secret (Basic Auth)
- **API**: REST API v3 (`/wp-json/wc/v3/orders`)
- **Pagination**: `page` + `per_page` params
- **Order items**: Nested `line_items[]` array in order response
- **Docs**: https://woocommerce.github.io/woocommerce-rest-api-docs/

### GoMag
- **Auth**: API Key (header or query param)
- **API**: GoMag REST API (`/api/v2/orders`)
- **Pagination**: `page` + `limit` params
- **Docs**: GoMag API documentation (varies per store version)

### Shopify
- **Auth**: API Key + Access Token (header: `X-Shopify-Access-Token`)
- **API**: REST Admin API (`/admin/api/2024-01/orders.json`)
- **Pagination**: Cursor-based (Link header)
- **Rate limits**: 2 requests/second (bucket with leak)
- **Docs**: https://shopify.dev/docs/api/admin-rest

## Column Mapping UI

The mapping page (per site) shows:
1. **Auto-detected columns** from a sample API response
2. **Standard target columns** (the BigQuery schema above)
3. **Status**: confirmed (green), unmapped (yellow), ignored (gray)
4. **Edit button** to change the mapping or apply a transform
5. **Test button** to pull 5 sample orders and preview the mapped output
6. **Save** persists to sites.json

## Sync Process

1. Read site config from `sites.json`
2. Connect to platform API using credentials
3. Fetch orders (incremental: since `lastSyncAt`, or full resync)
4. For each order, flatten line items into rows
5. Apply column mapping to transform source → target columns
6. Write rows to BigQuery table (create table if not exists)
7. Update `lastSyncAt`, `lastSyncStatus`, `lastSyncRowCount` in config

## BigQuery Setup

- **Project**: Existing GCP project (ID in `.env.local`)
- **Dataset**: One dataset for all site tables
- **Tables**: One table per site (e.g. `orders_arlight_ro`, `orders_brandoffice_ro`)
- **Auth**: Service account JSON key in `config/bigquery-service-account.json`
- **Schema**: Auto-created on first sync based on standard columns

## Development Rules

- **ALWAYS maintain zero TypeScript errors.** Run `npx tsc --noEmit` before declaring changes complete.
- Use feature branches, never commit directly to main.
- **NEVER commit credentials** — `sites.json` and `bigquery-service-account.json` are in `.gitignore`
- Tailwind CSS for all styling
- All API connectors must implement `IConnector` interface
- Handle rate limits gracefully (especially Shopify: 2 req/sec)

## Commands

```bash
npm install           # Install dependencies
npm run dev           # Start dev server (Vite frontend + Express backend)
npm run build         # Production build
npm run tsc           # Type check only
npm run sync          # Manual sync all enabled sites (CLI)
npm run sync:site     # Manual sync single site: npm run sync:site -- --site=arlight-ro
```

## Environment Variables (.env.local)

```bash
BQ_PROJECT_ID=your-gcp-project-id
BQ_DATASET_ID=client_orders
BQ_SERVICE_ACCOUNT_PATH=./config/bigquery-service-account.json
PORT=3200
```
