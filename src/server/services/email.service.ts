import nodemailer from 'nodemailer';
import type { ISiteConfig } from '../../shared/types.js';
import { readSites } from '../utils/config-loader.js';

const SMTP_USER = process.env['SMTP_USER'] || 'catalin@limitless.ro';
const SMTP_PASS = process.env['SMTP_PASS'] || '';
const REPORT_TO = process.env['REPORT_TO'] || 'catalin@limitless.ro';

function createTransport() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function formatStatus(site: ISiteConfig): { emoji: string; label: string } {
  switch (site.lastSyncStatus) {
    case 'success': return { emoji: '✅', label: 'Success' };
    case 'error': return { emoji: '❌', label: 'Error' };
    case 'running': return { emoji: '🔄', label: 'Running' };
    default: return { emoji: '⚪', label: 'Never synced' };
  }
}

function buildHtmlReport(sites: ISiteConfig[]): string {
  const rows = sites.map((s) => {
    const { emoji, label } = formatStatus(s);
    const rows = s.lastSyncRowCount ?? 0;
    const lastSync = s.lastSyncAt
      ? new Date(s.lastSyncAt).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })
      : 'Never';
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${s.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${s.platform}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${emoji} ${label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${rows.toLocaleString()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666">${lastSync}</td>
      </tr>`;
  }).join('');

  const totalRows = sites.reduce((sum, s) => sum + (s.lastSyncRowCount ?? 0), 0);
  const successCount = sites.filter((s) => s.lastSyncStatus === 'success').length;
  const errorCount = sites.filter((s) => s.lastSyncStatus === 'error').length;

  return `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">
      <h2 style="color:#333">Status sincronizare proiecte Limitless</h2>
      <p style="color:#666">
        ${successCount} success | ${errorCount} errors | ${sites.length} total | ${totalRows.toLocaleString()} rows
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Proiect</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Platform</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Status</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Rows</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Last Sync</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#999;font-size:12px;margin-top:20px">
        Generated at ${new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}
      </p>
    </div>
  `;
}

export async function sendDailyReport(): Promise<void> {
  if (!SMTP_PASS) {
    console.error('[EMAIL] SMTP_PASS not set, skipping email');
    return;
  }

  const sites = await readSites();
  const html = buildHtmlReport(sites);
  const transport = createTransport();

  await transport.sendMail({
    from: `"Clientorders" <${SMTP_USER}>`,
    to: REPORT_TO,
    subject: 'Status sincronizare proiecte Limitless',
    html,
  });

  console.log(`[EMAIL] Daily report sent to ${REPORT_TO}`);
}
