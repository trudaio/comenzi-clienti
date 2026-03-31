import { BigQuery } from '@google-cloud/bigquery';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IOrderRow } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BQ_PROJECT_ID = process.env['BQ_PROJECT_ID'] || 'bq-all-project';
const BQ_DATASET_ID = process.env['BQ_DATASET_ID'] || 'comenzi_clienti_limitless';
const BQ_SA_PATH = process.env['BQ_SERVICE_ACCOUNT_PATH'] || './config/bigquery-service-account.json';

// Resolve key file path — if the file doesn't exist, use ADC (Application Default Credentials)
const resolvedKeyPath = path.isAbsolute(BQ_SA_PATH)
  ? BQ_SA_PATH
  : path.resolve(__dirname, '../../../', BQ_SA_PATH);
const useKeyFile = fs.existsSync(resolvedKeyPath);

let bqClient: BigQuery | null = null;

function getClient(): BigQuery {
  if (!bqClient) {
    if (useKeyFile) {
      bqClient = new BigQuery({ projectId: BQ_PROJECT_ID, keyFilename: resolvedKeyPath });
    } else {
      // On Cloud Run / GCE, use Application Default Credentials automatically
      bqClient = new BigQuery({ projectId: BQ_PROJECT_ID });
    }
  }
  return bqClient;
}

const TABLE_SCHEMA = [
  { name: 'order_id', type: 'STRING' },
  { name: 'order_date', type: 'TIMESTAMP' },
  { name: 'order_status', type: 'STRING' },
  { name: 'order_total', type: 'FLOAT' },
  { name: 'currency', type: 'STRING' },
  { name: 'product_id', type: 'STRING' },
  { name: 'product_sku', type: 'STRING' },
  { name: 'product_name', type: 'STRING' },
  { name: 'product_price', type: 'FLOAT' },
  { name: 'product_quantity', type: 'INTEGER' },
  { name: 'product_total', type: 'FLOAT' },
  { name: 'source_site', type: 'STRING' },
  { name: 'synced_at', type: 'TIMESTAMP' },
];

export async function ensureTable(tableName: string): Promise<void> {
  const bq = getClient();
  const dataset = bq.dataset(BQ_DATASET_ID);
  const table = dataset.table(tableName);

  const [exists] = await table.exists();
  if (!exists) {
    await dataset.createTable(tableName, { schema: TABLE_SCHEMA });
    console.log(`BigQuery table ${BQ_DATASET_ID}.${tableName} created.`);
  }
}

export async function truncateTable(tableName: string): Promise<void> {
  const bq = getClient();
  const query = `TRUNCATE TABLE \`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${tableName}\``;
  await bq.query(query);
  console.log(`BigQuery table ${BQ_DATASET_ID}.${tableName} truncated.`);
}

export async function insertRows(tableName: string, rows: IOrderRow[]): Promise<void> {
  if (rows.length === 0) return;

  const bq = getClient();
  const table = bq.dataset(BQ_DATASET_ID).table(tableName);

  // Insert in batches of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await table.insert(batch);
  }
}

/** Drop a BigQuery table */
async function dropTable(tableName: string): Promise<void> {
  const bq = getClient();
  const query = `DROP TABLE IF EXISTS \`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${tableName}\``;
  await bq.query(query);
}

/**
 * Upsert rows via MERGE: staging table → merge into main → drop staging.
 * Match on order_id + product_id + source_site.
 * Existing rows get updated, new rows get inserted.
 */
export async function mergeRows(tableName: string, rows: IOrderRow[]): Promise<void> {
  if (rows.length === 0) return;

  const stagingTable = `${tableName}_staging_${Date.now()}`;
  const fqMain = `\`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${tableName}\``;
  const fqStaging = `\`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${stagingTable}\``;

  try {
    // 1. Create staging table & insert rows
    await ensureTable(stagingTable);
    await insertRows(stagingTable, rows);

    // 2. Wait for streaming buffer to be readable (BQ streaming inserts have a short delay)
    await new Promise((r) => setTimeout(r, 30_000));

    // 3. Run MERGE (deduplicate staging to avoid "must match at most one source row" error)
    const mergeQuery = `
      MERGE ${fqMain} AS target
      USING (
        SELECT * FROM ${fqStaging}
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY order_id, product_id, product_sku, source_site
          ORDER BY synced_at DESC
        ) = 1
      ) AS source
      ON target.order_id = source.order_id
         AND target.product_id = source.product_id
         AND target.product_sku = source.product_sku
         AND target.source_site = source.source_site
      WHEN MATCHED THEN UPDATE SET
        target.order_date = source.order_date,
        target.order_status = source.order_status,
        target.order_total = source.order_total,
        target.currency = source.currency,
        target.product_sku = source.product_sku,
        target.product_name = source.product_name,
        target.product_price = source.product_price,
        target.product_quantity = source.product_quantity,
        target.product_total = source.product_total,
        target.synced_at = source.synced_at
      WHEN NOT MATCHED THEN INSERT (
        order_id, order_date, order_status, order_total, currency,
        product_id, product_sku, product_name, product_price,
        product_quantity, product_total, source_site, synced_at
      ) VALUES (
        source.order_id, source.order_date, source.order_status,
        source.order_total, source.currency, source.product_id,
        source.product_sku, source.product_name, source.product_price,
        source.product_quantity, source.product_total, source.source_site,
        source.synced_at
      )
    `;

    const bq = getClient();
    await bq.query(mergeQuery);
    console.log(`MERGE completed: ${rows.length} rows into ${tableName}`);
  } finally {
    // 4. Always drop staging table
    await dropTable(stagingTable).catch((err) =>
      console.error(`Failed to drop staging table ${stagingTable}:`, err),
    );
  }
}

/**
 * Status-only MERGE: only updates order_status and synced_at for existing rows.
 * Does NOT insert new rows (no WHEN NOT MATCHED clause).
 */
export async function mergeStatusOnly(tableName: string, rows: IOrderRow[]): Promise<void> {
  if (rows.length === 0) return;

  const stagingTable = `${tableName}_status_${Date.now()}`;
  const fqMain = `\`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${tableName}\``;
  const fqStaging = `\`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.${stagingTable}\``;

  try {
    await ensureTable(stagingTable);
    await insertRows(stagingTable, rows);

    // Wait for streaming buffer
    await new Promise((r) => setTimeout(r, 30_000));

    const mergeQuery = `
      MERGE ${fqMain} AS target
      USING (
        SELECT * FROM ${fqStaging}
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY order_id, product_id, product_sku, source_site
          ORDER BY synced_at DESC
        ) = 1
      ) AS source
      ON target.order_id = source.order_id
         AND target.product_id = source.product_id
         AND target.product_sku = source.product_sku
         AND target.source_site = source.source_site
      WHEN MATCHED THEN UPDATE SET
        target.order_status = source.order_status,
        target.synced_at = source.synced_at
    `;

    const bq = getClient();
    await bq.query(mergeQuery);
    console.log(`Status-only MERGE completed: ${rows.length} rows in ${tableName}`);
  } finally {
    await dropTable(stagingTable).catch((err) =>
      console.error(`Failed to drop staging table ${stagingTable}:`, err),
    );
  }
}
