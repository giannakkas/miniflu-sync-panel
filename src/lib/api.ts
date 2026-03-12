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

  // Logs
  getLogs: (limit = 100, offset = 0) =>
    request('GET', `/logs?limit=${limit}&offset=${offset}`),
  clearLogs: () => request('DELETE', '/logs'),
};
