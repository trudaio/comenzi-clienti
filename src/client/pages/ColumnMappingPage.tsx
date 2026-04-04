import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { IColumnMapping, IStatusMapping, MappingStatus } from '@shared/types.js';
import { STANDARD_COLUMNS, STANDARD_ORDER_STATUSES } from '@shared/constants.js';
import { API_BASE } from '../services/api.service.js';

const STATUS_LABELS: Record<MappingStatus, string> = {
  confirmed: '✓ mapped',
  unmapped: '⚠ unmapped',
  ignored: '○ ignored',
};

const STATUS_CLASSES: Record<MappingStatus, string> = {
  confirmed: 'text-green-400',
  unmapped: 'text-yellow-400',
  ignored: 'text-gray-500',
};

/** Resolve a dot-notation path like "items.sku" from a nested object.
 *  When a path segment hits an array, take the first element and continue. */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    if (Array.isArray(acc)) {
      // Take first element, then resolve key from it
      const first = acc[0];
      if (first && typeof first === 'object') {
        return (first as Record<string, unknown>)[key];
      }
      return undefined;
    }
    if (typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Format a sample value for display — truncate long strings, stringify objects */
function formatSampleValue(val: unknown): string {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'object') {
    const str = JSON.stringify(val);
    return str.length > 60 ? str.slice(0, 57) + '…' : str;
  }
  const str = String(val);
  return str.length > 60 ? str.slice(0, 57) + '…' : str;
}

// ─── Toast Component ────────────────────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
            t.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {t.type === 'success' ? '✓' : '✗'} {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ColumnMappingPage() {
  const { id } = useParams<{ id: string }>();
  const [mapping, setMapping] = useState<IColumnMapping[]>([]);
  const [statusMapping, setStatusMapping] = useState<IStatusMapping[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [detectingStatus, setDetectingStatus] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  let toastId = 0;
  function showToast(message: string, type: 'success' | 'error') {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`${API_BASE}/api/mapping/${id}`).then((r) => r.json()) as Promise<{ columnMapping: IColumnMapping[] }>,
      fetch(`${API_BASE}/api/mapping/status/${id}`).then((r) => r.json()) as Promise<{ statusMapping: IStatusMapping[] }>,
    ])
      .then(([colData, statusData]) => {
        setMapping(colData.columnMapping);
        setStatusMapping(statusData.statusMapping);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  function updateRow(index: number, field: keyof IColumnMapping, value: string) {
    setMapping((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/mapping/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnMapping: mapping }),
      });
      if (res.ok) {
        showToast(`Column mapping saved (${mapping.length} columns)`, 'success');
      } else {
        showToast('Failed to save column mapping', 'error');
      }
    } catch {
      showToast('Network error — could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStatus() {
    if (!id) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`${API_BASE}/api/mapping/status/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusMapping }),
      });
      if (res.ok) {
        showToast(`Status mapping saved (${statusMapping.length} statuses)`, 'success');
      } else {
        showToast('Failed to save status mapping', 'error');
      }
    } catch {
      showToast('Network error — could not save', 'error');
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleDetectStatus() {
    if (!id) return;
    setDetectingStatus(true);
    try {
      const res = await fetch(`${API_BASE}/api/mapping/status/${id}/detect`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { detectedStatuses: IStatusMapping[] };
        setStatusMapping(data.detectedStatuses);
        showToast(`Detected ${data.detectedStatuses.length} statuses`, 'success');
      } else {
        showToast('Failed to detect statuses', 'error');
      }
    } catch {
      showToast('Network error — could not detect statuses', 'error');
    } finally {
      setDetectingStatus(false);
    }
  }

  function updateStatusRow(index: number, targetStatus: string) {
    setStatusMapping((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, targetStatus: targetStatus as IStatusMapping['targetStatus'] } : row,
      ),
    );
  }

  async function handleDetect() {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/mapping/${id}/detect`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { detectedColumns: string[]; sample: Record<string, unknown> | null };
        const autoMapped: IColumnMapping[] = data.detectedColumns.map((col) => ({
          sourceColumn: col,
          targetColumn: STANDARD_COLUMNS.find((s) => s === col) ?? '',
          status: STANDARD_COLUMNS.find((s) => s === col) ? 'confirmed' : 'unmapped',
        }));
        setMapping(autoMapped);
        setSampleData(data.sample ?? null);
        showToast(`Detected ${data.detectedColumns.length} columns`, 'success');
      } else {
        showToast('Failed to detect columns', 'error');
      }
    } catch {
      showToast('Network error — could not detect columns', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <ToastContainer toasts={toasts} />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Column Mapping</h1>
        <div className="flex gap-3">
          <button
            onClick={() => { void handleDetect(); }}
            className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-4 py-2 rounded text-sm"
          >
            Auto-detect columns
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
          >
            {saving ? 'Saving…' : 'Save Mapping'}
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="pb-2 pr-4 w-8">#</th>
                <th className="pb-2 pr-4">SOURCE COLUMN</th>
                <th className="pb-2 pr-4">EXAMPLE</th>
                <th className="pb-2 pr-4">TARGET COLUMN</th>
                <th className="pb-2 pr-4">STATUS</th>
                <th className="pb-2">TRANSFORM</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((row, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.sourceColumn}</td>
                  <td className="py-2 pr-4 text-xs text-gray-400 max-w-[200px] truncate" title={sampleData ? String(getNestedValue(sampleData, row.sourceColumn) ?? '') : ''}>
                    {sampleData ? formatSampleValue(getNestedValue(sampleData, row.sourceColumn)) : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={row.targetColumn}
                      onChange={(e) => {
                        updateRow(i, 'targetColumn', e.target.value);
                        updateRow(i, 'status', e.target.value ? 'confirmed' : 'unmapped');
                      }}
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="">— ignore —</option>
                      {STANDARD_COLUMNS.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`py-2 pr-4 text-xs ${STATUS_CLASSES[row.status]}`}>
                    {STATUS_LABELS[row.status]}
                  </td>
                  <td className="py-2">
                    <input
                      type="text"
                      value={row.transform ?? ''}
                      onChange={(e) => updateRow(i, 'transform', e.target.value)}
                      placeholder="e.g. toNumber"
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {mapping.length === 0 && (
            <p className="text-center py-10 text-gray-500">
              No columns detected yet. Click &quot;Auto-detect columns&quot; to start.
            </p>
          )}
        </div>
      )}

      {/* Status Mapping Section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Status Mapping</h2>
          <div className="flex gap-3">
            <button
              onClick={() => { void handleDetectStatus(); }}
              disabled={detectingStatus}
              className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              {detectingStatus ? 'Detecting…' : 'Auto-detect statuses'}
            </button>
            <button
              onClick={() => { void handleSaveStatus(); }}
              disabled={savingStatus}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
            >
              {savingStatus ? 'Saving…' : 'Save Status Mapping'}
            </button>
          </div>
        </div>

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="pb-2 pr-4 w-8">#</th>
                  <th className="pb-2 pr-4">SOURCE STATUS</th>
                  <th className="pb-2">STANDARD STATUS</th>
                </tr>
              </thead>
              <tbody>
                {statusMapping.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{row.sourceStatus}</td>
                    <td className="py-2">
                      <select
                        value={row.targetStatus}
                        onChange={(e) => updateStatusRow(i, e.target.value)}
                        className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                      >
                        {STANDARD_ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {statusMapping.length === 0 && (
              <p className="text-center py-10 text-gray-500">
                No statuses yet. Click &quot;Auto-detect statuses&quot; to load from sample orders.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
