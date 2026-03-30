import { Router } from 'express';
import type { Request, Response } from 'express';
import { readSites } from '../utils/config-loader.js';

export const statusRouter = Router();

// GET /api/status — sync status for all sites
statusRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const statuses = sites.map((s) => ({
      siteId: s.id,
      name: s.name,
      platform: s.platform,
      status: s.lastSyncStatus || 'idle',
      lastSyncAt: s.lastSyncAt || null,
      lastSyncRowCount: s.lastSyncRowCount || 0,
      enabled: s.enabled,
    }));
    res.json({ sites: statuses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/status/:siteId — sync status for one site
statusRouter.get('/:siteId', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    res.json({
      siteId: site.id,
      name: site.name,
      platform: site.platform,
      status: site.lastSyncStatus || 'idle',
      lastSyncAt: site.lastSyncAt || null,
      lastSyncRowCount: site.lastSyncRowCount || 0,
      enabled: site.enabled,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
