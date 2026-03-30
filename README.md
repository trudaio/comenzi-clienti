# Clientorders

Multi-platform e-commerce order aggregator. Pulls orders from WooCommerce, GoMag, MerchantPro (and soon Shopify) stores, normalizes the data, and pushes it into BigQuery — one table per site.

Built for agencies managing 20+ client stores across different platforms.

## Features

- **Multi-platform connectors**: WooCommerce, GoMag, MerchantPro (Shopify planned)
- **Visual column mapping**: Auto-detect API fields, map to standard BigQuery schema, preview with sample data
- **BigQuery MERGE/upsert**: No duplicates — uses staging table + MERGE pattern
- **Status normalization**: Maps platform-specific statuses to `order_processed` / `order_cancelled`
- **Automated sync**: Daily full sync (6AM), daily status update (6PM), optional hourly sync per site
- **Sync history**: Duration, row count, status tracking for every execution
- **Dashboard**: Overview of all sites, Sync All button, expandable history per site

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS + Vite
- **Backend**: Node.js + Express
- **Database**: Google BigQuery
- **Scheduling**: node-cron

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local
# Edit .env.local with your BigQuery project/dataset IDs

# Add your BigQuery service account key
cp your-key.json config/bigquery-service-account.json

# Create sites config (see config format below)
cp config/sites.example.json config/sites.json

# Start dev server
npm run dev
```

The app runs on `http://localhost:5173` (frontend) and `http://localhost:3200` (API).

## Configuration

### Environment (.env.local)

```
BQ_PROJECT_ID=your-gcp-project-id
BQ_DATASET_ID=comenzi_clienti_limitless
BQ_SERVICE_ACCOUNT_PATH=./config/bigquery-service-account.json
PORT=3200
```

### Site Config (config/sites.json)

Each site needs: platform, API credentials, BigQuery table name, and status mapping. Sites are managed through the UI (Dashboard > Add Site) or directly in `sites.json`.

## Cron Schedule

| Schedule | Job | Description |
|----------|-----|-------------|
| Every hour | Hourly sync | Today's orders only (sites with hourly enabled) |
| 06:00 daily | Full sync | Last 30 days, MERGE into BigQuery |
| 18:00 daily | Status update | Only updates order_status for existing rows |

## BigQuery Schema

Every site table has 13 standard columns:

| Column | Type |
|--------|------|
| order_id | STRING |
| order_date | TIMESTAMP |
| order_status | STRING |
| order_total | FLOAT |
| currency | STRING |
| product_id | STRING |
| product_sku | STRING |
| product_name | STRING |
| product_price | FLOAT |
| product_quantity | INTEGER |
| product_total | FLOAT |
| source_site | STRING |
| synced_at | TIMESTAMP |

One order with multiple products = multiple rows (one per line item).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/sites | List all sites |
| POST | /api/sites | Add new site |
| POST | /api/sync/all | Sync all enabled sites |
| POST | /api/sync/:siteId | Sync single site |
| GET | /api/sync/history/:siteId | Get sync history |
| POST | /api/mapping/:siteId/detect | Auto-detect columns from API |

## Commands

```bash
npm run dev          # Dev server (Vite + Express)
npm run build        # Production build
npx tsc --noEmit     # Type check
```
