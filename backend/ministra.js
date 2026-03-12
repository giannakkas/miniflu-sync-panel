/**
 * Ministra (Stalker Portal) integration.
 *
 * Channel sync requires direct MySQL access to stalker_db.
 * The REST API v1 is read-only and used optionally for verification.
 *
 * Key table: itv
 *   id          – auto-increment
 *   name        – channel display name
 *   number      – channel number / sort order
 *   cmd         – stream command, e.g. "ffmpeg http://host/stream/mpegts"
 *   status      – 1 = active
 *   tv_genre_id – genre/category FK (default 0 or 10)
 *   xmltv_id    – EPG ID (empty string default)
 *   ...
 */

const mysql = require('mysql2/promise');
const { getSetting } = require('./db');

let pool = null;
let lastConfig = '';

function getPoolConfig() {
  return {
    host: getSetting('ministra_db_host'),
    port: parseInt(getSetting('ministra_db_port') || '3306', 10),
    user: getSetting('ministra_db_user'),
    password: getSetting('ministra_db_pass'),
    database: getSetting('ministra_db_name') || 'stalker_db',
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10000,
  };
}

function getPool() {
  const cfg = getPoolConfig();
  const key = JSON.stringify(cfg);
  if (pool && lastConfig === key) return pool;
  if (pool) pool.end().catch(() => {});
  if (!cfg.host) throw new Error('Ministra MySQL host not configured');
  pool = mysql.createPool(cfg);
  lastConfig = key;
  return pool;
}

// ── Test connections ────────────────────────────────────────────────

async function testDbConnection() {
  try {
    const p = getPool();
    const [rows] = await p.query('SELECT COUNT(*) as cnt FROM itv');
    return { ok: true, message: `Connected. ${rows[0].cnt} channel(s) in itv table.` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function testApiConnection() {
  const url = getSetting('ministra_api_url');
  if (!url) return { ok: true, message: 'API not configured (MySQL-only mode)' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/itv`, {
      headers: buildApiHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, message: 'REST API reachable' };
  } catch (err) {
    return { ok: false, message: `REST API: ${err.message}` };
  }
}

async function testConnection() {
  const db = await testDbConnection();
  const api = await testApiConnection();
  return {
    ok: db.ok, // DB is required
    message: db.ok ? 'Ministra connection OK' : db.message,
    db,
    api,
  };
}

function buildApiHeaders() {
  const user = getSetting('ministra_api_user');
  const pass = getSetting('ministra_api_pass');
  const headers = {};
  if (user) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }
  return headers;
}

// ── Read channels from Ministra ─────────────────────────────────────

async function getChannels() {
  const p = getPool();
  const [rows] = await p.query(
    'SELECT id, name, number, cmd, status, tv_genre_id FROM itv ORDER BY number ASC'
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    number: r.number,
    cmd: r.cmd || '',
    sourceStream: extractStreamKey(r.cmd),
    status: r.status === 1 ? 'synced' : 'not_synced',
  }));
}

/**
 * Extract the stream key from a Ministra cmd field.
 * E.g. "ffmpeg http://10.0.0.1:80/my_stream/mpegts" → "my_stream"
 */
function extractStreamKey(cmd) {
  if (!cmd) return '';
  // Pattern: proto://host:port/STREAM_KEY/format
  const m = cmd.match(/https?:\/\/[^/]+\/([^/]+)\/(?:mpegts|index\.m3u8|manifest\.mpd)/i);
  return m ? m[1] : '';
}

// ── Find channel by stream key ──────────────────────────────────────

async function findChannelByCmd(streamKey) {
  const p = getPool();
  const [rows] = await p.query(
    'SELECT id, name, number, cmd FROM itv WHERE cmd LIKE ?',
    [`%/${streamKey}/%`]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function findChannelByName(name) {
  const p = getPool();
  const [rows] = await p.query('SELECT id, name, number, cmd FROM itv WHERE name = ?', [name]);
  return rows.length > 0 ? rows[0] : null;
}

// ── Get next available channel number ───────────────────────────────

async function getNextChannelNumber() {
  const p = getPool();
  const [rows] = await p.query('SELECT COALESCE(MAX(number), 0) + 1 as next_num FROM itv');
  return rows[0].next_num;
}

// ── Create / Update channel ─────────────────────────────────────────

/**
 * Sync a single stream to Ministra.
 * Returns { action: 'created'|'updated'|'already_exists', channelId, channelName }
 */
async function syncStream(streamKey, title, outputUrl, sortOrder) {
  const p = getPool();
  const cmd = `ffmpeg ${outputUrl}`;

  // Check if channel already exists by cmd pattern
  const existing = await findChannelByCmd(streamKey);

  if (existing) {
    // Check if anything changed
    if (existing.cmd === cmd && existing.name === title) {
      return { action: 'already_exists', channelId: existing.id, channelName: existing.name };
    }
    // Update
    await p.query(
      'UPDATE itv SET name = ?, cmd = ?, number = ? WHERE id = ?',
      [title, cmd, sortOrder || existing.number, existing.id]
    );
    return { action: 'updated', channelId: existing.id, channelName: title };
  }

  // Create new channel
  const num = sortOrder || await getNextChannelNumber();
  const [result] = await p.query(
    `INSERT INTO itv (name, number, cmd, status, tv_genre_id, xmltv_id, use_http_tmp_link, monitoring_url)
     VALUES (?, ?, ?, 1, 0, '', 0, '')`,
    [title, num, cmd]
  );
  return { action: 'created', channelId: result.insertId, channelName: title };
}

// ── Close pool on shutdown ──────────────────────────────────────────

async function close() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
  lastConfig = '';
}

module.exports = {
  testConnection, testDbConnection, testApiConnection,
  getChannels, findChannelByCmd, findChannelByName,
  syncStream, close, extractStreamKey,
};
