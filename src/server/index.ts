import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { sitesRouter } from './routes/sites.routes.js';
import { syncRouter } from './routes/sync.routes.js';
import { mappingRouter } from './routes/mapping.routes.js';
import { statusRouter } from './routes/status.routes.js';
import { feedRouter } from './routes/feed.routes.js';
import { SERVER_PORT } from '../shared/constants.js';
import { readSites } from './utils/config-loader.js';
import { syncSite, syncSiteHourly, syncSiteStatusOnly } from './services/sync.service.js';
import { sendDailyReport } from './services/email.service.js';

const app = express();
const port = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : SERVER_PORT;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://comenzi-clienti-limitless.web.app',
    'https://comenzi-clienti-limitless.firebaseapp.com',
  ],
}));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/sites', sitesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/mapping', mappingRouter);
app.use('/api/status', statusRouter);
app.use('/api/feed', feedRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Cron Scheduler ──────────────────────────────────────────────────────────

// Hourly sync: fetch today's orders for sites with hourlySyncEnabled
cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Hourly sync starting…');
  try {
    const sites = await readSites();
    const hourly = sites.filter((s) => s.enabled && s.hourlySyncEnabled);
    for (const site of hourly) {
      try {
        await syncSiteHourly(site.id);
      } catch (err) {
        console.error(`[CRON] Hourly sync error for ${site.id}:`, err);
      }
    }
    console.log(`[CRON] Hourly sync done (${hourly.length} sites)`);
  } catch (err) {
    console.error('[CRON] Hourly sync failed:', err);
  }
});

// Daily full sync at 6:00 AM: pull last 30 days for all enabled sites (MERGE into BigQuery)
cron.schedule('0 6 * * *', async () => {
  console.log('[CRON] Daily full sync starting…');
  try {
    const sites = await readSites();
    const enabled = sites.filter((s) => s.enabled);
    for (const site of enabled) {
      try {
        const result = await syncSite(site.id);
        console.log(`[CRON] ${site.id}: ${result.status} (${result.rowCount} rows)`);
      } catch (err) {
        console.error(`[CRON] Full sync error for ${site.id}:`, err);
      }
    }
    console.log(`[CRON] Daily full sync done (${enabled.length} sites)`);
  } catch (err) {
    console.error('[CRON] Daily full sync failed:', err);
  }
});

// Daily status update at 18:00 (6 PM): refresh order_status for existing rows
cron.schedule('0 18 * * *', async () => {
  console.log('[CRON] Daily status update starting…');
  try {
    const sites = await readSites();
    const enabled = sites.filter((s) => s.enabled);
    for (const site of enabled) {
      try {
        await syncSiteStatusOnly(site.id);
      } catch (err) {
        console.error(`[CRON] Status update error for ${site.id}:`, err);
      }
    }
    console.log(`[CRON] Daily status update done (${enabled.length} sites)`);
  } catch (err) {
    console.error('[CRON] Daily status update failed:', err);
  }
});

// Daily email report at 13:30 Romania time (10:30 UTC)
cron.schedule('30 10 * * *', async () => {
  console.log('[CRON] Sending daily email report…');
  try {
    await sendDailyReport();
  } catch (err) {
    console.error('[CRON] Email report failed:', err);
  }
});

// Manual trigger: POST /api/report/email
app.post('/api/report/email', async (_req, res) => {
  try {
    await sendDailyReport();
    res.json({ status: 'sent' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Clientorders server running on http://localhost:${port}`);
  console.log('[CRON] Hourly sync scheduled (every hour at :00)');
  console.log('[CRON] Daily full sync scheduled (daily at 06:00)');
  console.log('[CRON] Daily status update scheduled (daily at 18:00)');
  console.log('[CRON] Daily email report scheduled (daily at 13:30 Romania)');
});

export default app;
