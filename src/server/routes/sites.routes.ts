import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ISiteConfig } from '../../shared/types.js';
import {
  readSites,
  writeSites,
  nameToSlug,
  ensureUniqueId,
} from '../utils/config-loader.js';

export const sitesRouter = Router();

// GET /api/sites — list all sites
sitesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const sites = await readSites();
    res.json({ sites });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read sites config' });
  }
});

// GET /api/sites/:id — get single site
sitesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const sites = await readSites();
    const site = sites.find((s) => s.id === req.params['id']);
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
    res.json({ site });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read sites config' });
  }
});

// POST /api/sites — create new site
sitesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as Omit<ISiteConfig, 'id'>;
    if (!body.name || !body.platform || !body.credentials) {
      res.status(400).json({ error: 'name, platform, and credentials are required' });
      return;
    }
    const sites = await readSites();
    const slug = nameToSlug(body.name);
    const id = ensureUniqueId(slug, sites);
    const newSite: ISiteConfig = {
      id,
      name: body.name,
      platform: body.platform,
      credentials: body.credentials,
      bigqueryTable: body.bigqueryTable ?? `orders_${slug.replace(/-/g, '_')}`,
      columnMapping: body.columnMapping ?? [],
      statusMapping: body.statusMapping ?? [],
      syncSchedule: body.syncSchedule ?? '0 6 * * *',
      lookbackDays: body.lookbackDays ?? 30,
      enabled: body.enabled ?? true,
    };
    sites.push(newSite);
    await writeSites(sites);
    res.status(201).json({ site: newSite });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// PUT /api/sites/:id — update site
sitesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const sites = await readSites();
    const idx = sites.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
    const updated: ISiteConfig = {
      ...sites[idx]!,
      ...(req.body as Partial<ISiteConfig>),
      id, // id is immutable
    };
    sites[idx] = updated;
    await writeSites(sites);
    res.json({ site: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update site' });
  }
});

// DELETE /api/sites/:id — delete site
sitesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const sites = await readSites();
    const idx = sites.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
    sites.splice(idx, 1);
    await writeSites(sites);
    res.json({ deleted: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete site' });
  }
});
