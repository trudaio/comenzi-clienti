import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ISiteConfig, ISyncHistoryEntry } from '@shared/types.js';
import { deleteSite, fetchSyncHistory } from '../services/api.service.js';

function formatSyncTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s`;
}

export default function DashboardPage() {
  const [sites, setSites] = useState<ISiteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<ISyncHistoryEntry[]>([]);
  const navigate = useNavigate();

  const loadSites = () => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((data: { sites: ISiteConfig[] }) => {
        setSites(data.sites);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadSites();
  }, []);

  const handleSync = async (siteId: string) => {
    setSyncing((prev) => ({ ...prev, [siteId]: true }));
    try {
      await fetch(`/api/sync/${siteId}`, { method: 'POST' });
      loadSites();
    } finally {
      setSyncing((prev) => ({ ...prev, [siteId]: false }));
    }
  };

  const handleDelete = async (site: ISiteConfig) => {
    if (!confirm(`Delete "${site.name}"? This cannot be undone.`)) return;
    await deleteSite(site.id);
    setSites((prev) => prev.filter((s) => s.id !== site.id));
  };

  const toggleHistory = async (siteId: string) => {
    if (expandedHistory === siteId) {
      setExpandedHistory(null);
      return;
    }
    setExpandedHistory(siteId);
    try {
      const entries = await fetchSyncHistory(siteId, 10);
      setHistory(entries);
    } catch {
      setHistory([]);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setSyncingAll(true);
              try {
                await fetch('/api/sync/all', { method: 'POST' });
                loadSites();
              } finally {
                setSyncingAll(false);
              }
            }}
            disabled={syncingAll || sites.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
          >
            {syncingAll ? 'Syncing All…' : 'Sync All'}
          </button>
          <button
            onClick={() => navigate('/sites/new')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
          >
            + Add Site
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && sites.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No sites configured yet.</p>
          <p className="text-sm mt-1">Add your first site to get started.</p>
        </div>
      )}

      <div className="grid gap-3">
        {sites.map((site) => (
          <div key={site.id} className="bg-gray-900 border border-gray-800 rounded-lg">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <span className="font-medium">{site.name}</span>
                <span className="ml-3 text-xs text-gray-400 uppercase">{site.platform}</span>
                {site.lastSyncAt && (
                  <span className="ml-3 text-xs text-gray-500" title={site.lastSyncAt}>
                    Last sync: {formatSyncTime(site.lastSyncAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                {site.lastSyncStatus === 'success' && (
                  <span className="text-green-400">
                    ✓ {site.lastSyncRowCount ?? 0} rows
                  </span>
                )}
                {site.lastSyncStatus === 'error' && (
                  <span className="text-red-400">✗ Error</span>
                )}
                {site.lastSyncStatus === 'running' && (
                  <span className="text-yellow-400">Running…</span>
                )}
                {!site.lastSyncStatus && (
                  <span className="text-gray-500">Never synced</span>
                )}
                <button
                  onClick={() => toggleHistory(site.id)}
                  className="text-gray-400 hover:text-white"
                  title="Sync history"
                >
                  History
                </button>
                <button
                  onClick={() => handleSync(site.id)}
                  disabled={syncing[site.id]}
                  className="text-blue-400 hover:text-blue-300 disabled:text-gray-600"
                >
                  {syncing[site.id] ? 'Syncing…' : 'Sync'}
                </button>
                <button
                  onClick={() => navigate(`/sites/${site.id}/edit`)}
                  className="text-gray-400 hover:text-white"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(site)}
                  className="text-red-500 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Sync History Panel */}
            {expandedHistory === site.id && (
              <div className="border-t border-gray-800 px-5 py-3">
                {history.length === 0 ? (
                  <p className="text-xs text-gray-500">No sync history yet.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 text-left">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">Type</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Rows</th>
                        <th className="pb-2 pr-4">Duration</th>
                        <th className="pb-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i} className="border-t border-gray-800/50">
                          <td className="py-1.5 pr-4 text-gray-400">
                            {new Date(h.startedAt).toLocaleString('ro-RO', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-1.5 pr-4 text-gray-400">{h.syncType}</td>
                          <td className="py-1.5 pr-4">
                            <span
                              className={
                                h.status === 'success' ? 'text-green-400' : 'text-red-400'
                              }
                            >
                              {h.status === 'success' ? '✓' : '✗'} {h.status}
                            </span>
                          </td>
                          <td className="py-1.5 pr-4 text-gray-400">{h.rowCount}</td>
                          <td className="py-1.5 pr-4 text-gray-400">
                            {formatDuration(h.durationSeconds)}
                          </td>
                          <td className="py-1.5 text-red-400 truncate max-w-[200px]">
                            {h.error || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
