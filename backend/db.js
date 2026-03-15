const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'miniflu.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS streams (
    stream_key            TEXT PRIMARY KEY,
    title                 TEXT NOT NULL DEFAULT '',
    output_url            TEXT NOT NULL DEFAULT '',
    protocol              TEXT NOT NULL DEFAULT 'MPEG-TS',
    status                TEXT NOT NULL DEFAULT 'not_synced',
    sync_error            TEXT DEFAULT '',
    ministra_channel_name TEXT,
    ministra_channel_id   INTEGER,
    bitrate               TEXT,
    resolution            TEXT,
    last_synced           TEXT,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    alive                 INTEGER NOT NULL DEFAULT 1,
    raw_json              TEXT,
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  TEXT NOT NULL DEFAULT (datetime('now')),
    stream_key TEXT,
    title      TEXT,
    action     TEXT NOT NULL,
    result     TEXT NOT NULL,
    details    TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS epg_providers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    country    TEXT NOT NULL DEFAULT '',
    url        TEXT NOT NULL,
    format     TEXT NOT NULL DEFAULT 'xmltv',
    type       TEXT NOT NULL DEFAULT 'direct',
    channels   INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    notes      TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Default settings ────────────────────────────────────────────────
const defaults = {
  admin_user: 'admin',
  admin_pass: bcrypt.hashSync('!Venushub6165!!', 10),
  operator_user: 'user',
  operator_pass: bcrypt.hashSync('!User1234!!', 10),
  flussonic_host: '172.18.181.12',
  flussonic_port: '8080',
  flussonic_user: 'admin',
  flussonic_pass: 'admin',
  ministra_api_url: 'http://172.18.181.13:88/stalker_portal/api',
  ministra_api_user: '',
  ministra_api_pass: '',
  ministra_db_host: '172.18.181.13',
  ministra_db_port: '3306',
  ministra_db_user: 'test',
  ministra_db_pass: '1234',
  ministra_db_name: 'stalker_db',
  sync_interval_minutes: '5',
};

const insertDefault = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [k, v] of Object.entries(defaults)) {
  insertDefault.run(k, v);
}

// ── Seed EPG providers ──────────────────────────────────────────────
const providerCount = db.prepare('SELECT COUNT(*) as cnt FROM epg_providers').get();
if (providerCount.cnt === 0) {
  const seedProviders = [
    // Egypt
    { name: 'IPTV-EPG.org Egypt', country: 'EG', url: 'https://iptv-epg.org/files/epg-eg.xml.gz', format: 'xmltv', type: 'direct', channels: 107, notes: 'Free, auto-updated daily. 107 Egyptian channels.' },
    { name: 'elcinema.com (iptv-org)', country: 'EG', url: 'https://github.com/iptv-org/epg/tree/master/sites/elcinema.com', format: 'xmltv', type: 'iptv-org-grabber', channels: 198, notes: 'Arabic movie/TV guide. Requires iptv-org grabber to generate XMLTV. 198 channels with xmltv-id mapping.' },
    { name: 'sat.tv Arabic (iptv-org)', country: 'EG', url: 'https://github.com/iptv-org/epg/tree/master/sites/sat.tv', format: 'xmltv', type: 'iptv-org-grabber', channels: 30308, notes: 'Massive Arabic satellite EPG. Covers Egypt, Saudi, UAE + all Arab countries. Requires iptv-org grabber.' },
    // UK
    { name: 'IPTV-EPG.org UK', country: 'GB', url: 'https://iptv-epg.org/files/epg-gb.xml.gz', format: 'xmltv', type: 'direct', channels: 941, notes: 'Free, auto-updated daily. 941 UK channels.' },
    { name: 'Freeview-EPG (GitHub)', country: 'GB', url: 'https://raw.githubusercontent.com/dp247/Freeview-EPG/master/epg.xml', format: 'xmltv', type: 'direct', channels: 200, notes: 'Free UK Freeview EPG. 7 days data, updated every 12h. Regional support. GitHub: dp247/Freeview-EPG' },
    { name: 'freeview.co.uk (iptv-org)', country: 'GB', url: 'https://github.com/iptv-org/epg/tree/master/sites/freeview.co.uk', format: 'xmltv', type: 'iptv-org-grabber', channels: 166, notes: 'Official UK Freeview. 104 channels with xmltv-id. Requires iptv-org grabber.' },
    { name: 'sky.com (iptv-org)', country: 'GB', url: 'https://github.com/iptv-org/epg/tree/master/sites/sky.com', format: 'xmltv', type: 'iptv-org-grabber', channels: 542, notes: 'Sky UK EPG. 489 channels with xmltv-id. Requires iptv-org grabber.' },
    { name: 'mytelly.co.uk (iptv-org)', country: 'GB', url: 'https://github.com/iptv-org/epg/tree/master/sites/mytelly.co.uk', format: 'xmltv', type: 'iptv-org-grabber', channels: 488, notes: 'UK TV guide. 387 channels with xmltv-id. Requires iptv-org grabber.' },
    // UAE
    { name: 'IPTV-EPG.org UAE', country: 'AE', url: 'https://iptv-epg.org/files/epg-ae.xml.gz', format: 'xmltv', type: 'direct', channels: 58, notes: 'Free, auto-updated daily. 58 UAE channels.' },
    { name: 'osn.com (iptv-org)', country: 'AE', url: 'https://github.com/iptv-org/epg/tree/master/sites/osn.com', format: 'xmltv', type: 'iptv-org-grabber', channels: 134, notes: 'OSN MENA channels. 86 with xmltv-id. Covers UAE, Saudi, Egypt. Requires iptv-org grabber.' },
    { name: 'bein.com (iptv-org)', country: 'AE', url: 'https://github.com/iptv-org/epg/tree/master/sites/bein.com', format: 'xmltv', type: 'iptv-org-grabber', channels: 134, notes: 'beIN Sports + Entertainment. All 134 with xmltv-id. Requires iptv-org grabber.' },
    // Saudi Arabia
    { name: 'IPTV-EPG.org Saudi Arabia', country: 'SA', url: 'https://iptv-epg.org/files/epg-sa.xml.gz', format: 'xmltv', type: 'direct', channels: 138, notes: 'Free, auto-updated daily. 138 Saudi channels.' },
    { name: 'shahid.mbc.net (iptv-org)', country: 'SA', url: 'https://github.com/iptv-org/epg/tree/master/sites/shahid.mbc.net', format: 'xmltv', type: 'iptv-org-grabber', channels: 207, notes: 'MBC/Shahid channels. 168 with xmltv-id. Saudi + pan-Arab. Requires iptv-org grabber.' },
    { name: 'rotana.net (iptv-org)', country: 'SA', url: 'https://github.com/iptv-org/epg/tree/master/sites/rotana.net', format: 'xmltv', type: 'iptv-org-grabber', channels: 32, notes: 'Rotana TV channels. 26 with xmltv-id. Requires iptv-org grabber.' },
    // Multi-region
    { name: 'iptv-org Channel Database', country: 'ALL', url: 'https://iptv-org.github.io/api/channels.json', format: 'json', type: 'api', channels: 39000, notes: 'Channel ID database (~39K channels). Used for auto-match. No EPG schedules, only channel metadata.' },
  ];
  const insertProvider = db.prepare(
    'INSERT INTO epg_providers (name, country, url, format, type, channels, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const p of seedProviders) {
    insertProvider.run(p.name, p.country, p.url, p.format, p.type, p.channels, p.notes);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const r of rows) {
    // Don't expose hashed password
    if (r.key === 'admin_pass') continue;
    obj[r.key] = r.value;
  }
  return obj;
}

function saveSettings(settings) {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const run = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (k === 'admin_pass' && v) {
        upsert.run(k, bcrypt.hashSync(v, 10));
      } else if (k === 'admin_pass' && !v) {
        // Skip empty password = keep current
      } else {
        upsert.run(k, v);
      }
    }
  });
  run(Object.entries(settings));
}

// ── Stream helpers ──────────────────────────────────────────────────
function upsertStream(s) {
  db.prepare(`
    INSERT INTO streams (stream_key, title, output_url, protocol, bitrate, resolution, sort_order, alive, raw_json, updated_at)
    VALUES (@stream_key, @title, @output_url, @protocol, @bitrate, @resolution, @sort_order, 1, @raw_json, datetime('now'))
    ON CONFLICT(stream_key) DO UPDATE SET
      title = excluded.title,
      output_url = excluded.output_url,
      protocol = excluded.protocol,
      bitrate = excluded.bitrate,
      resolution = excluded.resolution,
      alive = 1,
      raw_json = excluded.raw_json,
      updated_at = datetime('now')
  `).run(s);
}

function markAllStreamsDead() {
  db.prepare('UPDATE streams SET alive = 0').run();
}

function removeDeadStreams() {
  db.prepare('DELETE FROM streams WHERE alive = 0').run();
}

function getAllStreams() {
  return db.prepare('SELECT * FROM streams ORDER BY sort_order ASC, stream_key ASC').all();
}

function getStreamByKey(key) {
  return db.prepare('SELECT * FROM streams WHERE stream_key = ?').get(key);
}

function updateStreamSync(streamKey, status, ministraChannelName, ministraChannelId, syncError) {
  db.prepare(`
    UPDATE streams SET status = ?, ministra_channel_name = ?, ministra_channel_id = ?, sync_error = ?, last_synced = datetime('now')
    WHERE stream_key = ?
  `).run(status, ministraChannelName, ministraChannelId, syncError || '', streamKey);
}

function reorderStreams(order) {
  const stmt = db.prepare('UPDATE streams SET sort_order = ? WHERE stream_key = ?');
  const run = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.sortOrder, item.streamKey);
    }
  });
  run(order);
}

// ── Log helpers ─────────────────────────────────────────────────────
function addLog(entry) {
  db.prepare(`
    INSERT INTO logs (stream_key, title, action, result, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.stream_key || null, entry.title || null, entry.action, entry.result, entry.details || '');
}

function getLogs(limit = 100, offset = 0) {
  return db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
}

function clearLogs() {
  db.prepare('DELETE FROM logs').run();
}

// ── Sync state ──────────────────────────────────────────────────────
function getSyncState(key) {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSyncState(key, value) {
  db.prepare(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

// ── EPG Provider helpers ────────────────────────────────────────────
function getEpgProviders() {
  return db.prepare('SELECT * FROM epg_providers ORDER BY country ASC, name ASC').all();
}

function getEpgProvider(id) {
  return db.prepare('SELECT * FROM epg_providers WHERE id = ?').get(id);
}

function addEpgProvider(p) {
  return db.prepare(
    'INSERT INTO epg_providers (name, country, url, format, type, channels, enabled, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(p.name, p.country || '', p.url, p.format || 'xmltv', p.type || 'direct', p.channels || 0, p.enabled !== undefined ? (p.enabled ? 1 : 0) : 1, p.notes || '');
}

function updateEpgProvider(id, p) {
  const fields = [];
  const values = [];
  for (const key of ['name', 'country', 'url', 'format', 'type', 'channels', 'notes']) {
    if (p[key] !== undefined) { fields.push(`${key} = ?`); values.push(p[key]); }
  }
  if (p.enabled !== undefined) { fields.push('enabled = ?'); values.push(p.enabled ? 1 : 0); }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE epg_providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteEpgProvider(id) {
  db.prepare('DELETE FROM epg_providers WHERE id = ?').run(id);
}

module.exports = {
  db, getSetting, getSettings, saveSettings,
  upsertStream, markAllStreamsDead, removeDeadStreams, getAllStreams, getStreamByKey, updateStreamSync, reorderStreams,
  addLog, getLogs, clearLogs,
  getSyncState, setSyncState,
  getEpgProviders, getEpgProvider, addEpgProvider, updateEpgProvider, deleteEpgProvider,
};
