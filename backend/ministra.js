/**
 * Ministra (Stalker Portal) integration.
 *
 * Channel sync requires direct MySQL access to stalker_db.
 * Auto-detects itv table schema on first use to handle different Ministra versions.
 * Supports bidirectional sync: Flussonic→Ministra and Ministra→Panel status.
 */

const mysql = require('mysql2/promise');
const { getSetting } = require('./db');

let pool = null;
let lastConfig = '';
let itvColumns = null;

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
  itvColumns = null;
  return pool;
}

// ── Schema detection ────────────────────────────────────────────────

async function getItvColumns() {
  if (itvColumns) return itvColumns;
  const p = getPool();
  const [rows] = await p.query('SHOW COLUMNS FROM itv');
  itvColumns = {};
  for (const r of rows) {
    itvColumns[r.Field] = {
      type: r.Type,
      nullable: r.Null === 'YES',
      default: r.Default,
      key: r.Key,
      extra: r.Extra,
    };
  }
  console.log(`[ministra] Detected ${Object.keys(itvColumns).length} columns in itv table`);
  return itvColumns;
}

// ── Test connections ────────────────────────────────────────────────

async function testDbConnection() {
  try {
    const p = getPool();
    const [rows] = await p.query('SELECT COUNT(*) as cnt FROM itv');
    const cols = await getItvColumns();
    return { ok: true, message: `Connected. ${rows[0].cnt} channel(s), ${Object.keys(cols).length} columns in itv.` };
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
  const dbResult = await testDbConnection();
  const api = await testApiConnection();
  return {
    ok: dbResult.ok,
    message: dbResult.ok ? 'Ministra connection OK' : dbResult.message,
    db: dbResult,
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
 * Extract stream key from Ministra cmd field.
 * Handles: ffmpeg http://host:port/STREAM/mpegts, http://host/STREAM/index.m3u8, etc.
 */
function extractStreamKey(cmd) {
  if (!cmd) return '';
  let m = cmd.match(/https?:\/\/[^/]+\/([^/]+)\/(?:mpegts|index\.m3u8|manifest\.mpd|mono\.m3u8)/i);
  if (m) return m[1];
  m = cmd.match(/https?:\/\/[^/]+\/([^/\s]+)/i);
  return m ? m[1] : '';
}

// ── Find channel ────────────────────────────────────────────────────

async function findChannelByCmd(streamKey) {
  const p = getPool();
  const [rows] = await p.query(
    'SELECT id, name, number, cmd FROM itv WHERE cmd LIKE ? OR cmd LIKE ?',
    [`%/${streamKey}/%`, `%/${streamKey}`]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getNextChannelNumber() {
  const p = getPool();
  const [rows] = await p.query('SELECT COALESCE(MAX(number), 0) + 1 as next_num FROM itv');
  return rows[0].next_num;
}

// ── Create / Update channel (schema-safe) ───────────────────────────

async function syncStream(streamKey, title, outputUrl, sortOrder) {
  const p = getPool();
  const cols = await getItvColumns();
  const cmd = outputUrl;

  // Check if channel already exists
  const existing = await findChannelByCmd(streamKey);

  if (existing) {
    if (existing.cmd === cmd && existing.name === title) {
      return { action: 'already_exists', channelId: existing.id, channelName: existing.name };
    }
    const updateCols = ['name = ?', 'cmd = ?'];
    const updateVals = [title, cmd];
    if (sortOrder) { updateCols.push('number = ?'); updateVals.push(sortOrder); }
    if (cols['modified']) { updateCols.push('modified = NOW()'); }
    updateVals.push(existing.id);
    await p.query(`UPDATE itv SET ${updateCols.join(', ')} WHERE id = ?`, updateVals);
    return { action: 'updated', channelId: existing.id, channelName: title };
  }

  // ── Build INSERT dynamically based on actual schema ──
  const num = sortOrder || await getNextChannelNumber();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Values we want to set
  const wanted = {
    name: title, number: num, cmd: cmd, cmd_type: '',
    status: 1, tv_genre_id: 0, xmltv_id: '', use_http_tmp_link: 0,
    monitoring_url: '', base_ch: 1, modified: now, added: now,
  };

  // Safe defaults for known NOT NULL columns
  const defaults = {
    cost: '0', ch_id: '0', service_id: '', bonus_ch: '0',
    volume_correction: '0', contract: '', mc_cmd: '',
    enable_tv_archive: 0, wowza_tmp_link: 0, nginx_secure_link: 0,
    tv_archive_duration: 0, lock: 0, load_balancing: '',
    cmd_1: '', cmd_2: '', cmd_3: '', logo: '', correct_time: 0,
    allow_pvr: 0, allow_local_pvr: 0, allow_remote_pvr: 0,
    censored: 0, descr: '', age: '', genres_id: '', hd: 0,
    rec: '', default_elect: 0, accessed: 0, tv_archive_type: '',
    ch_type: '0', flussonic_tmp_link: 0, for_: '',
  };

  const insertData = {};
  for (const [colName, colInfo] of Object.entries(cols)) {
    if (colInfo.extra === 'auto_increment') continue;
    if (wanted.hasOwnProperty(colName)) {
      insertData[colName] = wanted[colName];
    } else if (!colInfo.nullable && colInfo.default === null) {
      // NOT NULL with no default — must provide value
      if (defaults.hasOwnProperty(colName)) {
        insertData[colName] = defaults[colName];
      } else {
        const type = colInfo.type.toLowerCase();
        if (type.includes('int') || type.includes('float') || type.includes('double') || type.includes('decimal') || type.includes('tinyint')) {
          insertData[colName] = 0;
        } else if (type.includes('datetime') || type.includes('timestamp')) {
          insertData[colName] = now;
        } else {
          insertData[colName] = '';
        }
        console.log(`[ministra] Unknown NOT NULL column "${colName}" (${colInfo.type}) → default: ${JSON.stringify(insertData[colName])}`);
      }
    }
  }

  const columnNames = Object.keys(insertData);
  const placeholders = columnNames.map(() => '?').join(', ');
  const values = columnNames.map(k => insertData[k]);
  const sql = `INSERT INTO itv (${columnNames.join(', ')}) VALUES (${placeholders})`;

  try {
    const [result] = await p.query(sql, values);
    return { action: 'created', channelId: result.insertId, channelName: title };
  } catch (err) {
    console.error(`[ministra] INSERT failed: ${err.message}`);
    console.error(`[ministra] Columns: ${columnNames.join(', ')}`);
    throw err;
  }
}

// ── Bidirectional sync: Ministra → Panel status ─────────────────────

/**
 * Read all Ministra channels and update panel stream statuses to match.
 * Streams in Flussonic that already exist in Ministra get marked 'synced'.
 */
async function reconcileWithPanel(localDb) {
  const p = getPool();
  const [rows] = await p.query('SELECT id, name, number, cmd, status FROM itv ORDER BY number ASC');

  let matched = 0;
  let unmatched = 0;

  for (const ch of rows) {
    const streamKey = extractStreamKey(ch.cmd);
    if (!streamKey) { unmatched++; continue; }

    const stream = localDb.getStreamByKey(streamKey);
    if (stream) {
      localDb.updateStreamSync(
        streamKey,
        ch.status === 1 ? 'synced' : 'not_synced',
        ch.name,
        ch.id
      );
      matched++;
    } else {
      unmatched++;
    }
  }

  return { matched, unmatched, total: rows.length };
}

// ── Close ───────────────────────────────────────────────────────────

async function close() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
  lastConfig = '';
  itvColumns = null;
}

module.exports = {
  testConnection, testDbConnection, testApiConnection,
  getChannels, findChannelByCmd,
  syncStream, reconcileWithPanel, close, extractStreamKey,
  getItvColumns,
};
