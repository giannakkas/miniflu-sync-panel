import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'miniflu.json');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// In-memory store, persisted to JSON
let store = {
  settings: {},
  sync_logs: [],
  sync_state: {},  // keyed by stream_key
  _logIdCounter: 0,
};

// Load from disk
function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      store = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      if (!store.settings) store.settings = {};
      if (!store.sync_logs) store.sync_logs = [];
      if (!store.sync_state) store.sync_state = {};
      if (!store._logIdCounter) store._logIdCounter = store.sync_logs.length;
    }
  } catch (err) {
    console.error('[DB] Failed to load:', err.message);
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[DB] Failed to save:', err.message);
  }
}

load();

// Settings helpers
export function getSetting(key, defaultValue = null) {
  return store.settings[key] ?? defaultValue;
}

export function setSetting(key, value) {
  store.settings[key] = value;
  save();
}

export function getAllSettings() {
  return { ...store.settings };
}

// Sync state helpers
export function upsertStreamState(streamKey, data) {
  const existing = store.sync_state[streamKey] || {};
  store.sync_state[streamKey] = {
    stream_key: streamKey,
    title: data.title || existing.title || streamKey,
    output_url: data.output_url || existing.output_url || '',
    protocol: data.protocol || existing.protocol || 'MPEG-TS',
    status: data.status || existing.status || 'not_synced',
    ministra_channel_id: existing.ministra_channel_id || null,
    ministra_channel_name: existing.ministra_channel_name || null,
    bitrate: data.bitrate ?? existing.bitrate ?? null,
    resolution: data.resolution ?? existing.resolution ?? null,
    last_synced: existing.last_synced || null,
    sort_order: data.sort_order ?? existing.sort_order ?? 0,
  };
  save();
}

export function updateStreamSyncStatus(streamKey, status, ministraChannelId, ministraChannelName) {
  if (store.sync_state[streamKey]) {
    store.sync_state[streamKey].status = status;
    store.sync_state[streamKey].ministra_channel_id = ministraChannelId;
    store.sync_state[streamKey].ministra_channel_name = ministraChannelName;
    store.sync_state[streamKey].last_synced = new Date().toISOString().replace('T', ' ').slice(0, 19);
    save();
  }
}

export function getAllStreamStates() {
  return Object.values(store.sync_state).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

export function getStreamState(streamKey) {
  return store.sync_state[streamKey] || null;
}

export function clearStreamStates() {
  store.sync_state = {};
  save();
}

export function updateSortOrder(streamKey, sortOrder) {
  if (store.sync_state[streamKey]) {
    store.sync_state[streamKey].sort_order = sortOrder;
    save();
  }
}

// Log helpers
export function addLog(streamKey, title, action, result, details = '') {
  store._logIdCounter = (store._logIdCounter || 0) + 1;
  store.sync_logs.unshift({
    id: store._logIdCounter,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    stream_key: streamKey,
    title,
    action,
    result,
    details,
  });
  // Keep max 1000 logs
  if (store.sync_logs.length > 1000) store.sync_logs = store.sync_logs.slice(0, 1000);
  save();
}

export function getLogs(limit = 100, offset = 0) {
  return store.sync_logs.slice(offset, offset + limit);
}

export function getLogCount() {
  return store.sync_logs.length;
}

export function clearLogs() {
  store.sync_logs = [];
  save();
}
