import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IColumnMapping, IStatusMapping } from '../../shared/types.js';
import { DEFAULT_STATUS_MAPPINGS } from '../../shared/constants.js';
import { readSites, writeSites } from '../utils/config-loader.js';
import { fetchSample } from '../services/sync.service.js';
import { GomagConnector } from '../connectors/gomag.connector.js';

export const mappingRouter = Router();

// GET /api/mapping/:siteId — get column mapping for a site
mappingRouter.get('/:siteId', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }
    res.json({ siteId: site.id, columnMapping: site.columnMapping });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// PUT /api/mapping/:siteId — save column mapping for a site
mappingRouter.put('/:siteId', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    site.columnMapping = req.body.columnMapping as IColumnMapping[];
    await writeSites(sites);
    res.json({ siteId: site.id, columnMapping: site.columnMapping });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/mapping/:siteId/detect — auto-detect columns from sample API response
mappingRouter.post('/:siteId/detect', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    const sample = await fetchSample(site, 1);
    let rawSample = sample[0] as Record<string, unknown> | undefined;

    // Clean samples — remove noisy fields per platform
    if (site.platform === 'gomag' && rawSample) {
      rawSample = cleanGomagSample(rawSample);
    } else if (site.platform === 'woocommerce' && rawSample) {
      rawSample = cleanWooCommerceSample(rawSample);
    }

    const detectedColumns = rawSample ? flattenKeys(rawSample) : [];
    res.json({ siteId: site.id, detectedColumns, sample: rawSample || null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/mapping/:siteId/preview — preview mapping with sample orders
mappingRouter.post('/:siteId/preview', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    const sample = await fetchSample(site, 5);
    const connector = new GomagConnector();
    const rows = sample.flatMap((o) => connector.flattenOrder(o, site.id));
    res.json({ siteId: site.id, rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Status Mapping Routes ────────────────────────────────────────────────────

// GET /api/status-mapping/:siteId
mappingRouter.get('/status/:siteId', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }
    res.json({ siteId: site.id, statusMapping: site.statusMapping ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// PUT /api/status-mapping/:siteId
mappingRouter.put('/status/:siteId', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    site.statusMapping = req.body.statusMapping as IStatusMapping[];
    await writeSites(sites);
    res.json({ siteId: site.id, statusMapping: site.statusMapping });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/status-mapping/:siteId/detect — pull sample orders, extract unique statuses, auto-map from defaults
mappingRouter.post('/status/:siteId/detect', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    const sample = await fetchSample(site, 5);
    const rawStatuses = new Set<string>();
    for (const order of sample) {
      const s = (order as Record<string, unknown>)['status'] ?? (order as Record<string, unknown>)['order_status'];
      if (typeof s === 'string' && s) rawStatuses.add(s);
    }

    const defaults = DEFAULT_STATUS_MAPPINGS[site.platform] ?? [];
    const detected: IStatusMapping[] = [...rawStatuses].map((src) => {
      const def = defaults.find((d) => d.sourceStatus.toLowerCase() === src.toLowerCase());
      return def ?? { sourceStatus: src, targetStatus: 'order_processed' };
    });

    res.json({ siteId: site.id, detectedStatuses: detected });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── GoMag field filter ──────────────────────────────────────────────────────
// Remove noisy fields from GoMag API sample before detection.
// Keep: id, date, total, status, source, sales_channel, sales_channel_marketplace,
//       sales_agent, currency, observation, delivery.total, items.*, discounts, updated

// ─── WooCommerce field filter ────────────────────────────────────────────────
// Remove: billing.*, shipping.*, customer_*, created_via, cart_hash, date_completed, date_paid

const WOO_IGNORED_TOP_KEYS = new Set([
  'billing', 'shipping',
  'customer_id', 'customer_ip_address', 'customer_user_agent', 'customer_note',
  'created_via', 'cart_hash', 'date_completed', 'date_paid',
]);

function cleanWooCommerceSample(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (WOO_IGNORED_TOP_KEYS.has(key)) continue;
    cleaned[key] = val;
  }
  return cleaned;
}

// ─── GoMag field filter ──────────────────────────────────────────────────────

const GOMAG_IGNORED_TOP_KEYS = new Set([
  'number', 'invoice', 'statusId', 'payment', 'shipping', 'billing',
]);

function cleanGomagSample(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (GOMAG_IGNORED_TOP_KEYS.has(key)) continue;

    // delivery → keep only delivery.total
    if (key === 'delivery' && val && typeof val === 'object' && !Array.isArray(val)) {
      const d = val as Record<string, unknown>;
      cleaned['delivery.total'] = d.total ?? 0;
      continue;
    }

    cleaned[key] = val;
  }
  return cleaned;
}

/** Recursively extract all keys from an object, flattened with dot notation */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      keys.push(...flattenKeys(val as Record<string, unknown>, fullKey));
    }
  }
  return keys;
}
