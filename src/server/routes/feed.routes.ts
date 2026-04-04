import { Router } from 'express';
import type { Request, Response } from 'express';
import { readSites } from '../utils/config-loader.js';
import { loadFeed, reloadFeed, checkProductId, getFeedInfo } from '../services/feed.service.js';

export const feedRouter = Router();

// GET /api/feed/:siteId — get feed info (loaded status, product count)
feedRouter.get('/:siteId', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    if (!site.productFeedUrl) {
      res.json({ siteId: site.id, loaded: false, productCount: 0, hasFeed: false });
      return;
    }

    // Load feed if not cached yet
    await loadFeed(site.id, site.productFeedUrl);
    const info = getFeedInfo(site.id);
    res.json({ siteId: site.id, ...info, hasFeed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/feed/:siteId/check/:productId — check if product ID exists in feed
feedRouter.get('/:siteId/check/:productId', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    if (!site.productFeedUrl) {
      res.json({ exists: null, reason: 'no feed configured' });
      return;
    }

    // Ensure feed is loaded
    await loadFeed(site.id, site.productFeedUrl);
    const productId = String(req.params.productId);
    const exists = checkProductId(site.id, productId);
    res.json({ productId, exists });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/feed/:siteId/reload — force reload feed from URL
feedRouter.post('/:siteId/reload', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params.siteId);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    if (!site.productFeedUrl) {
      res.status(400).json({ error: 'No product feed URL configured for this site' });
      return;
    }

    const ids = await reloadFeed(site.id, site.productFeedUrl);
    res.json({ siteId: site.id, productCount: ids.size, reloaded: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
