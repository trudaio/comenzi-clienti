import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Platform, ICredentials } from '@shared/types.js';
import { PLATFORMS, PLATFORM_LABELS, DEFAULT_SYNC_SCHEDULE, LOOKBACK_OPTIONS, DEFAULT_LOOKBACK_DAYS } from '@shared/constants.js';
import CredentialForm from '../components/CredentialForm.js';
import { createSite, updateSite, fetchSite } from '../services/api.service.js';

/** Extract hour and minute from a cron expression like "30 14 * * *" */
function parseCronTime(cron: string): { hour: string; minute: string } {
  const parts = cron.split(/\s+/);
  const minute = (parts[0] ?? '0').padStart(2, '0');
  const hour = (parts[1] ?? '6').padStart(2, '0');
  return { hour, minute };
}

/** Build a daily cron expression from hour:minute */
function buildCron(hour: string, minute: string): string {
  return `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
}

interface FormState {
  name: string;
  platform: Platform;
  credentials: ICredentials;
  bigqueryTable: string;
  syncSchedule: string;
  syncHour: string;
  syncMinute: string;
  lookbackDays: number;
  hourlySyncEnabled: boolean;
  productFeedUrl: string;
}

const defaultTime = parseCronTime(DEFAULT_SYNC_SCHEDULE);

const initialForm: FormState = {
  name: '',
  platform: 'woocommerce',
  credentials: { apiUrl: '', apiKey: '', apiSecret: '' },
  bigqueryTable: '',
  syncSchedule: DEFAULT_SYNC_SCHEDULE,
  syncHour: defaultTime.hour,
  syncMinute: defaultTime.minute,
  lookbackDays: DEFAULT_LOOKBACK_DAYS,
  hourlySyncEnabled: false,
  productFeedUrl: '',
};

export default function SiteConfigPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load existing site when editing
  useEffect(() => {
    if (!id) return;
    fetchSite(id)
      .then((site) => {
        const time = parseCronTime(site.syncSchedule);
        setForm({
          name: site.name,
          platform: site.platform,
          credentials: site.credentials,
          bigqueryTable: site.bigqueryTable,
          syncSchedule: site.syncSchedule,
          syncHour: time.hour,
          syncMinute: time.minute,
          lookbackDays: site.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
          hourlySyncEnabled: site.hourlySyncEnabled ?? false,
          productFeedUrl: site.productFeedUrl ?? '',
        });
      })
      .catch(() => setLoadError('Failed to load site'));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        platform: form.platform,
        credentials: form.credentials,
        bigqueryTable: form.bigqueryTable,
        syncSchedule: buildCron(form.syncHour, form.syncMinute),
        lookbackDays: form.lookbackDays,
        hourlySyncEnabled: form.hourlySyncEnabled,
        productFeedUrl: form.productFeedUrl || undefined,
        columnMapping: [],
        statusMapping: [],
        enabled: true,
      };
      const site = isEdit && id
        ? await updateSite(id, payload)
        : await createSite(payload);
      navigate(`/sites/${site.id}/mapping`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="text-red-400">{loadError}</p>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Site' : 'Add New Site'}</h1>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
        {/* Name */}
        <label className="block">
          <span className="text-sm text-gray-400">Site Name</span>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Arlight.ro"
            className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </label>

        {/* Platform */}
        <label className="block">
          <span className="text-sm text-gray-400">Platform</span>
          <select
            value={form.platform}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                platform: e.target.value as Platform,
                credentials: { apiUrl: '', apiKey: '', apiSecret: '' },
              }))
            }
            className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </label>

        {/* Dynamic credential fields */}
        <CredentialForm
          platform={form.platform}
          value={form.credentials}
          onChange={(creds) => setForm((p) => ({ ...p, credentials: creds }))}
        />

        {/* BigQuery Table */}
        <label className="block">
          <span className="text-sm text-gray-400">BigQuery Table Name</span>
          <input
            type="text"
            required
            value={form.bigqueryTable}
            onChange={(e) => setForm((p) => ({ ...p, bigqueryTable: e.target.value }))}
            placeholder="orders_arlight_ro"
            className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </label>

        {/* Product Feed URL */}
        <label className="block">
          <span className="text-sm text-gray-400">Product Feed URL (optional)</span>
          <input
            type="url"
            value={form.productFeedUrl}
            onChange={(e) => setForm((p) => ({ ...p, productFeedUrl: e.target.value }))}
            placeholder="https://example.com/feed/googleShoppingAds.xml"
            className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </label>

        {/* Sync Schedule — time of day picker */}
        <div className="block">
          <span className="text-sm text-gray-400">Daily Sync Time</span>
          <div className="mt-1 flex items-center gap-2">
            <select
              value={form.syncHour}
              onChange={(e) => setForm((p) => ({ ...p, syncHour: e.target.value }))}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="text-gray-400">:</span>
            <select
              value={form.syncMinute}
              onChange={(e) => setForm((p) => ({ ...p, syncMinute: e.target.value }))}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Hourly Sync Toggle */}
        <label className="flex items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={form.hourlySyncEnabled}
            onChange={(e) => setForm((p) => ({ ...p, hourlySyncEnabled: e.target.checked }))}
            className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-300">Enable hourly sync</span>
            <span className="text-xs text-gray-500 block">
              Pulls today's orders every hour. Daily sync only updates statuses.
            </span>
          </div>
        </label>

        {/* Order Lookback Period */}
        <label className="block">
          <span className="text-sm text-gray-400">Order Lookback Period</span>
          <select
            value={form.lookbackDays}
            onChange={(e) => setForm((p) => ({ ...p, lookbackDays: Number(e.target.value) }))}
            className="mt-1 block w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            {LOOKBACK_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} zile</option>
            ))}
          </select>
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded text-sm"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save & Configure Mapping'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white text-sm px-3 py-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
