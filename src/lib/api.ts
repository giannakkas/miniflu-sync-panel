const API_BASE = '/api';

async function request(method: string, path: string, body?: any) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// Auth
export const api = {
  login: (username: string, password: string) =>
    request('POST', '/auth/login', { username, password }),

  // Dashboard
  getDashboard: () => request('GET', '/dashboard'),

  // Settings
  getSettings: () => request('GET', '/settings'),
  saveSettings: (settings: Record<string, any>) =>
    request('PUT', '/settings', settings),

  // Test connections
  testFlussonic: () => request('POST', '/test/flussonic'),
  testMinistra: () => request('POST', '/test/ministra'),

  // Streams
  getStreams: () => request('GET', '/streams'),
  refreshStreams: () => request('POST', '/streams/refresh'),
  reorderStreams: (order: { streamKey: string; sortOrder: number }[]) =>
    request('PUT', '/streams/reorder', { order }),

  // Sync
  syncStreams: (streamKeys?: string[]) =>
    request('POST', '/sync', { streamKeys }),
  fullSync: () => request('POST', '/sync/full'),
  getSyncStatus: () => request('GET', '/sync/status'),

  // Channels
  getChannels: () => request('GET', '/channels'),
  updateChannel: (id: number, fields: Record<string, any>) =>
    request('PUT', `/channels/${id}`, fields),
  deleteChannel: (id: number) =>
    request('DELETE', `/channels/${id}`),
  deleteChannelsBatch: (ids: number[]) =>
    request('POST', '/channels/delete-batch', { ids }),
  reorderChannels: (order: { id: number; number: number }[]) =>
    request('PUT', '/channels/reorder', { order }),

  // Logs
  getLogs: (limit = 100, offset = 0) =>
    request('GET', `/logs?limit=${limit}&offset=${offset}`),
  clearLogs: () => request('DELETE', '/logs'),

  // EPG
  matchEpg: (m3u_text: string) =>
    request('POST', '/epg/match', { m3u_text }),
  autoMatchEpg: () =>
    request('POST', '/epg/auto-match'),
  applyEpg: (mappings: { id: number; xmltv_id: string; logo?: string }[]) =>
    request('POST', '/epg/apply', { mappings }),
  getEpgStatus: () => request('GET', '/epg/status'),

  // EPG Providers
  getEpgProviders: () => request('GET', '/epg/providers'),
  addEpgProvider: (provider: Record<string, any>) =>
    request('POST', '/epg/providers', provider),
  updateEpgProvider: (id: number, fields: Record<string, any>) =>
    request('PUT', `/epg/providers/${id}`, fields),
  deleteEpgProvider: (id: number) =>
    request('DELETE', `/epg/providers/${id}`),
  pushProvidersToMinistra: () =>
    request('POST', '/epg/providers/push-to-ministra'),
  getMinistraEpgSources: () =>
    request('GET', '/epg/ministra-sources'),
  deleteMinistraEpgSource: (id: number) =>
    request('DELETE', `/epg/ministra-sources/${id}`),
};
