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

function updateStreamSync(streamKey, status, ministraChannelName, ministraChannelId) {
  db.prepare(`
    UPDATE streams SET status = ?, ministra_channel_name = ?, ministra_channel_id = ?, last_synced = datetime('now')
    WHERE stream_key = ?
  `).run(status, ministraChannelName, ministraChannelId, streamKey);
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

module.exports = {
  db, getSetting, getSettings, saveSettings,
  upsertStream, markAllStreamsDead, removeDeadStreams, getAllStreams, getStreamByKey, updateStreamSync, reorderStreams,
  addLog, getLogs, clearLogs,
  getSyncState, setSyncState,
};
