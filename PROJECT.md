# Clientorders — Full Project Specification

## Problem

A digital agency manages 20+ e-commerce sites across WooCommerce, GoMag, and Shopify. They need to:
1. Pull order data from all sites into one place
2. Normalize different field names across platforms (each platform names things differently)
3. Push normalized data into BigQuery for reporting and analysis
4. Do this automatically every day

## Solution

A web application with:
- **Site management** — add/remove sites, configure API credentials (flexible: some need just API key, some need key + secret)
- **Visual column mapping** — per-site mapping UI where you match source columns to standard target columns
- **Automated sync** — daily cron that pulls new orders and pushes to BigQuery
- **Dashboard** — overview of all sites, sync status, errors, row counts

## Platform API Details

### WooCommerce REST API v3

**Authentication**: Consumer Key + Consumer Secret (Basic Auth over HTTPS)

**Base URL**: `https://{store-url}/wp-json/wc/v3`

**Fetch orders**: `GET /orders?per_page=100&page=1&after=2024-01-01T00:00:00`

**Sample response structure**:
```json
{
  "id": 12345,
  "status": "completed",
  "date_created": "2024-03-15T10:30:00",
  "total": "299.90",
  "currency": "RON",
  "billing": {
    "email": "client@example.com"
  },
  "line_items": [
    {
      "id": 67890,
      "product_id": 1234,
      "sku": "PROD-001",
      "name": "Produs Test",
      "price": 149.95,
      "quantity": 2,
      "total": "299.90"
    }
  ]
}
```

**Source columns available**: id, status, date_created, total, currency, billing.email, line_items[].product_id, line_items[].sku, line_items[].name, line_items[].price, line_items[].quantity, line_items[].total

### GoMag API

**Authentication**: API Key (varies per store — some use header, some use query param)

**Base URL**: `https://{store-url}/api/v2` (varies by GoMag version)

**Fetch orders**: `GET /orders?limit=100&page=1`

**Source columns**: Varies per store — this is why per-site mapping is essential. Common fields: order_id, status, created_at, total, products[].id, products[].sku, products[].name, products[].price, products[].qty

### Shopify Admin REST API

**Authentication**: Access Token in header `X-Shopify-Access-Token: {token}`

**Base URL**: `https://{store}.myshopify.com/admin/api/2024-01`

**Fetch orders**: `GET /orders.json?limit=250&status=any&created_at_min=2024-01-01`

**Pagination**: Cursor-based using `Link` header (rel="next")

**Rate limits**: 2 requests/second (40 requests burst, then leak bucket at 2/sec)

**Sample response structure**:
```json
{
  "orders": [{
    "id": 5678,
    "name": "#1001",
    "created_at": "2024-03-15T10:30:00+02:00",
    "financial_status": "paid",
    "fulfillment_status": "fulfilled",
    "total_price": "299.90",
    "currency": "RON",
    "email": "client@example.com",
    "line_items": [{
      "id": 9012,
      "product_id": 3456,
      "sku": "PROD-001",
      "title": "Produs Test",
      "price": "149.95",
      "quantity": 2
    }]
  }]
}
```

**Source columns**: id, name, created_at, financial_status, fulfillment_status, total_price, currency, email, line_items[].product_id, line_items[].sku, line_items[].title, line_items[].price, line_items[].quantity

## Column Mapping UI — Detailed Design

### Layout (referencing screenshot)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Clientorders > Arlight.ro > Column Mapping                                  │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Platform: WooCommerce    Last synced: 2024-03-15 06:00    Status: ✓ OK     │
│                                                                              │
│  ┌─────┬──────────────────┬──────────────────┬───────────┬────────┬────────┐ │
│  │  #  │  SOURCE COLUMN   │  TARGET COLUMN   │  STATUS   │ ACTION │PREVIEW │ │
│  ├─────┼──────────────────┼──────────────────┼───────────┼────────┼────────┤ │
│  │  1  │  id              │  order_id        │ ✓ mapped  │ [Edit] │ 12345  │ │
│  │  2  │  date_created    │  order_date      │ ✓ mapped  │ [Edit] │ 2024.. │ │
│  │  3  │  status          │  order_status    │ ✓ mapped  │ [Edit] │ compl..│ │
│  │  4  │  total           │  order_total     │ ✓ mapped  │ [Edit] │ 299.90 │ │
│  │  5  │  currency        │  currency        │ ✓ mapped  │ [Edit] │ RON    │ │
│  │  6  │  line_items.id   │  product_id      │ ✓ mapped  │ [Edit] │ 1234   │ │
│  │  7  │  line_items.sku  │  product_sku     │ ✓ mapped  │ [Edit] │ PRD-01 │ │
│  │  8  │  line_items.name │  product_name    │ ✓ mapped  │ [Edit] │ Produs │ │
│  │  9  │  line_items.price│  product_price   │ ✓ mapped  │ [Edit] │ 149.95 │ │
│  │ 10  │  line_items.qty  │  product_quantity│ ✓ mapped  │ [Edit] │ 2      │ │
│  │ 11  │  line_items.total│  product_total   │ ✓ mapped  │ [Edit] │ 299.90 │ │
│  │ 12  │  billing.email   │  customer_email  │ ✓ mapped  │ [Edit] │ cli@.. │ │
│  │ 13  │  discount_total  │  —               │ ⚠ unmapped│ [Map]  │ 0.00   │ │
│  │ 14  │  shipping_total  │  —               │ ○ ignored │ [Map]  │ 15.00  │ │
│  └─────┴──────────────────┴──────────────────┴───────────┴────────┴────────┘ │
│                                                                              │
│  [Test with 5 orders]  [Save Mapping]  [Sync Now]                           │
│                                                                              │
│  ── Preview (5 sample orders mapped) ──────────────────────────────────────  │
│  │ order_id │ order_date │ status    │ total  │ product_id │ product_name │  │
│  │ 12345    │ 2024-03-15 │ completed │ 299.90 │ 1234       │ Produs Test  │  │
│  │ 12345    │ 2024-03-15 │ completed │ 299.90 │ 5678       │ Alt Produs   │  │
│  │ 12346    │ 2024-03-14 │ pending   │ 89.00  │ 9012       │ Produs 3     │  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mapping Flow

1. **Auto-detect**: When adding a new site, pull 1 sample order from API
2. **Flatten**: Expand nested fields (`line_items.price`, `billing.email`)
3. **Auto-map**: Try to match source → target by name similarity
4. **Manual review**: User confirms/edits each mapping
5. **Preview**: Show 5 real orders with the mapping applied
6. **Save**: Persist mapping to `sites.json`

### Edit Mapping Dialog

When clicking "Edit" on a row:
- Dropdown of available target columns (standard schema)
- Optional transform: `toString`, `toNumber`, `toDate`, `split(',')`, custom regex
- "Ignore this column" option
- Preview of the transform on sample data

## Dashboard Page

```
┌──────────────────────────────────────────────────────────────────────┐
│  Clientorders Dashboard                          [+ Add Site]       │
│  ────────────────────────────────────────────────────────────────── │
│                                                                      │
│  Summary: 22 sites | 18 active | 4 errors | Last run: 06:00 today  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 🟢 Arlight.ro           WooCommerce    Last: 06:00  1,234 rows │ │
│  │ 🟢 BrandOffice.ro       WooCommerce    Last: 06:01    892 rows │ │
│  │ 🟢 DualStore.ro         GoMag          Last: 06:02    456 rows │ │
│  │ 🔴 Viata-la-tara.ro     GoMag          ERROR: 401 Unauthorized │ │
│  │ 🟢 FarmanatPoieni.ro    GoMag          Last: 06:03    234 rows │ │
│  │ 🟡 King64.hu            Shopify        Running...               │ │
│  │ 🟢 NewStore.ro          WooCommerce    Last: 06:04    567 rows │ │
│  │ ...                                                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Sync All Now]  [View Logs]                                        │
└──────────────────────────────────────────────────────────────────────┘
```

## Site Config Page

### Add New Site

1. **Name**: Display name (e.g. "Arlight.ro")
2. **Platform**: Dropdown — WooCommerce, GoMag, Shopify
3. **Credentials** (dynamic based on platform):
   - WooCommerce: API URL + Consumer Key + Consumer Secret
   - GoMag: API URL + API Key
   - Shopify: Store URL + Access Token
4. **Test Connection**: Verify credentials work
5. **BigQuery Table Name**: Auto-generated from site name, editable
6. **Sync Schedule**: Cron expression (default: `0 6 * * *` = daily at 6am)
7. **Save** → redirects to Column Mapping page

## BigQuery Integration

### Setup
- Service account JSON key in `config/bigquery-service-account.json`
- Project ID and Dataset ID in `.env.local`
- Tables are auto-created on first sync

### Table Schema (per site)
```sql
CREATE TABLE IF NOT EXISTS `{project}.{dataset}.{table_name}` (
  order_id STRING,
  order_date TIMESTAMP,
  order_status STRING,
  order_total FLOAT64,
  currency STRING,
  product_id STRING,
  product_sku STRING,
  product_name STRING,
  product_price FLOAT64,
  product_quantity INT64,
  product_total FLOAT64,
  customer_email STRING,
  source_site STRING,
  synced_at TIMESTAMP
)
```

### Insert Strategy
- **Incremental**: Only fetch orders newer than `lastSyncAt`
- **Dedup**: Before insert, check if `order_id + product_id` combination already exists
- **Batch insert**: Use BigQuery streaming inserts (or load jobs for large batches)

## Sync Scheduler

- Uses `node-cron` for scheduling
- Each site has its own cron expression (default: daily at 6am)
- Syncs run sequentially to avoid rate limit issues
- Logs stored in memory + optional file
- Dashboard shows real-time sync progress

## Error Handling

- **Auth errors (401/403)**: Mark site as error, show in dashboard, don't retry
- **Rate limits (429)**: Exponential backoff, retry up to 3 times
- **Network errors**: Retry with backoff, mark as error after 3 failures
- **Partial failures**: If BigQuery insert fails, log which rows failed, don't mark as success
- **Invalid mapping**: If a mapped column doesn't exist in API response, log warning, skip column

## Security Considerations

- API credentials stored in `sites.json` — NEVER committed to git
- BigQuery service account key in `config/` — NEVER committed
- `.gitignore` must include: `config/sites.json`, `config/bigquery-service-account.json`, `.env.local`
- Server runs locally first (localhost only) — no auth needed initially
- When deployed to Firebase: add Firebase Auth

## Implementation Phases

### Phase 1 — Foundation
- Project setup: React + Vite + Express + TypeScript
- Site config CRUD (add/edit/delete sites in `sites.json`)
- Dynamic credential form based on platform

### Phase 2 — Connectors
- WooCommerce connector (most common)
- GoMag connector
- Shopify connector (with rate limiting)
- Common `IConnector` interface

### Phase 3 — Column Mapping UI
- Auto-detect columns from sample API response
- Visual mapping table (like screenshot)
- Auto-mapping by name similarity
- Preview with real data
- Save to `sites.json`

### Phase 4 — BigQuery Integration
- BigQuery client setup with service account
- Auto-create tables
- Insert rows with dedup
- Incremental sync (since lastSyncAt)

### Phase 5 — Scheduler + Dashboard
- node-cron daily sync
- Dashboard with site status cards
- Manual sync button
- Error display and logs

### Phase 6 — Export & Polish
- CSV export from dashboard
- Sync history/logs page
- Firebase deployment
