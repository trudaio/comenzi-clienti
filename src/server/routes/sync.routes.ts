import { Router } from 'express';
import type { Request, Response } from 'express';
import { syncAll, syncSite } from '../services/sync.service.js';
import { truncateTable } from '../services/bigquery.service.js';
import { readSites } from '../utils/config-loader.js';
import { getHistory, getAllHistory } from '../services/sync-history.service.js';

export const syncRouter = Router();

// POST /api/sync/all — trigger full sync
syncRouter.post('/all', async (_req: Request, res: Response) => {
  try {
    const results = await syncAll();
    res.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/sync/truncate-all — empty all BigQuery tables
syncRouter.post('/truncate-all', async (_req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const results: { siteId: string; table: string; status: string }[] = [];
    for (const site of sites) {
      try {
        await truncateTable(site.bigqueryTable);
        results.push({ siteId: site.id, table: site.bigqueryTable, status: 'truncated' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ siteId: site.id, table: site.bigqueryTable, status: `error: ${msg}` });
      }
    }
    res.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/sync/history — get sync history for all sites
syncRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const history = await getAllHistory(limit);
    res.json({ history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/sync/history/:siteId — get sync history for one site
syncRouter.get('/history/:siteId', async (req: Request, res: Response) => {
  try {
    const siteId = req.params.siteId as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const history = await getHistory(siteId, limit);
    res.json({ history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/sync/:siteId — trigger sync for one site
syncRouter.post('/:siteId', async (req: Request, res: Response) => {
  try {
    const siteId = req.params.siteId as string;
    const result = await syncSite(siteId);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
