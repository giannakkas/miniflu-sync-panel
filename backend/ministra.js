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
let epgSourceTable = null;

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
  epgSourceTable = null;
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
    `SELECT i.id, i.name, i.number, COALESCE(cl.url, i.cmd) as cmd, i.status, i.tv_genre_id, i.xmltv_id, i.logo
     FROM itv i LEFT JOIN ch_links cl ON cl.ch_id = i.id
     GROUP BY i.id
     ORDER BY i.number ASC`
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    number: r.number,
    cmd: r.cmd || '',
    sourceStream: extractStreamKey(r.cmd),
    status: r.status === 1 ? 'synced' : 'not_synced',
    xmltv_id: r.xmltv_id || '',
    logo: r.logo || '',
    hasEpg: !!(r.xmltv_id && r.xmltv_id.trim()),
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
  // Search in itv.cmd
  const [rows] = await p.query(
    'SELECT id, name, number, cmd FROM itv WHERE cmd LIKE ? OR cmd LIKE ?',
    [`%/${streamKey}/%`, `%/${streamKey}`]
  );
  if (rows.length > 0) return rows[0];
  // Also search in ch_links.url
  const [linkRows] = await p.query(
    `SELECT i.id, i.name, i.number, i.cmd FROM itv i
     JOIN ch_links cl ON cl.ch_id = i.id
     WHERE cl.url LIKE ? OR cl.url LIKE ?`,
    [`%/${streamKey}/%`, `%/${streamKey}`]
  );
  return linkRows.length > 0 ? linkRows[0] : null;
}

async function getNextChannelNumber() {
  const p = getPool();
  const [rows] = await p.query('SELECT COALESCE(MAX(number), 0) + 1 as next_num FROM itv');
  return rows[0].next_num;
}

// ── Get GENERAL genre ID ────────────────────────────────────────────

let cachedGenreId = null;

async function getGeneralGenreId() {
  if (cachedGenreId !== null) return cachedGenreId;
  const p = getPool();
  try {
    const [rows] = await p.query("SELECT id FROM tv_genre WHERE title = 'GENERAL' OR title = 'General' LIMIT 1");
    cachedGenreId = rows.length > 0 ? rows[0].id : 1;
  } catch {
    cachedGenreId = 1;
  }
  console.log(`[ministra] Using genre ID: ${cachedGenreId}`);
  return cachedGenreId;
}

// ── ch_links helper (Ministra stores streaming URLs here) ───────────

async function upsertChLink(pool, channelId, url) {
  // Check if link already exists for this channel
  const [existing] = await pool.query(
    'SELECT id FROM ch_links WHERE ch_id = ? LIMIT 1', [channelId]
  );
  if (existing.length > 0) {
    // Update existing link
    await pool.query(
      'UPDATE ch_links SET url = ?, status = 1, changed = NOW() WHERE ch_id = ?',
      [url, channelId]
    );
  } else {
    // Insert new link with all required fields
    await pool.query(
      `INSERT INTO ch_links (ch_id, priority, url, status, use_http_tmp_link, wowza_tmp_link,
       user_agent_filter, monitoring_url, use_load_balancing, changed)
       VALUES (?, 0, ?, 1, 0, 0, '', '', 0, NOW())`,
      [channelId, url]
    );
  }
}

// ── Create / Update channel (schema-safe) ───────────────────────────

async function syncStream(streamKey, title, outputUrl, sortOrder) {
  const p = getPool();
  const cols = await getItvColumns();
  const cmd = outputUrl;
  const genreId = await getGeneralGenreId();

  // Check if channel already exists
  const existing = await findChannelByCmd(streamKey);

  if (existing) {
    if (existing.cmd === cmd && existing.name === title) {
      // Still ensure ch_links exists
      await upsertChLink(p, existing.id, cmd);
      return { action: 'already_exists', channelId: existing.id, channelName: existing.name };
    }
    const updateCols = ['name = ?', 'cmd = ?', 'tv_genre_id = ?'];
    const updateVals = [title, cmd, genreId];
    if (sortOrder) { updateCols.push('number = ?'); updateVals.push(sortOrder); }
    if (cols['modified']) { updateCols.push('modified = NOW()'); }
    updateVals.push(existing.id);
    await p.query(`UPDATE itv SET ${updateCols.join(', ')} WHERE id = ?`, updateVals);
    // Update ch_links too
    await upsertChLink(p, existing.id, cmd);
    return { action: 'updated', channelId: existing.id, channelName: title };
  }

  // ── Build INSERT dynamically based on actual schema ──
  const num = sortOrder || await getNextChannelNumber();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Values we want to set
  const wanted = {
    name: title, number: num, cmd: cmd,
    status: 1, tv_genre_id: genreId, xmltv_id: '', use_http_tmp_link: 0,
    monitoring_url: '', base_ch: 0, modified: now, added: now,
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
    // Insert streaming link into ch_links
    await upsertChLink(p, result.insertId, cmd);
    return { action: 'created', channelId: result.insertId, channelName: title };
  } catch (err) {
    console.error(`[ministra] INSERT failed: ${err.message}`);
    console.error(`[ministra] Columns: ${columnNames.join(', ')}`);
    throw err;
  }
}

// ── Bidirectional sync: Ministra → Panel status ─────────────────────

/**
 * Read all Ministra channels and update panel stream statuses.
 * Simple binary: if stream exists in Ministra → synced, if not → not_synced.
 */
async function reconcileWithPanel(localDb) {
  const p = getPool();
  const [rows] = await p.query(
    `SELECT i.id, i.name, i.number, COALESCE(cl.url, i.cmd) as cmd, i.status
     FROM itv i LEFT JOIN ch_links cl ON cl.ch_id = i.id
     GROUP BY i.id
     ORDER BY i.number ASC`
  );

  // First, mark ALL streams as not_synced
  localDb.db.exec("UPDATE streams SET status = 'not_synced', ministra_channel_name = NULL, ministra_channel_id = NULL");

  let matched = 0;
  for (const ch of rows) {
    const streamKey = extractStreamKey(ch.cmd);
    if (!streamKey) continue;

    const stream = localDb.getStreamByKey(streamKey);
    if (stream) {
      localDb.updateStreamSync(streamKey, 'synced', ch.name, ch.id);
      matched++;
    }
  }

  return { matched, unmatched: rows.length - matched, total: rows.length };
}

// ── Delete channel ──────────────────────────────────────────────────

async function deleteChannel(id) {
  const p = getPool();
  await p.query('DELETE FROM ch_links WHERE ch_id = ?', [id]);
  await p.query('DELETE FROM itv WHERE id = ?', [id]);
}

async function deleteChannels(ids) {
  const p = getPool();
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await p.query(`DELETE FROM ch_links WHERE ch_id IN (${placeholders})`, ids);
  await p.query(`DELETE FROM itv WHERE id IN (${placeholders})`, ids);
}

// ── Update channel ──────────────────────────────────────────────────

async function updateChannel(id, fields) {
  const p = getPool();
  const sets = [];
  const vals = [];
  if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name); }
  if (fields.number !== undefined) { sets.push('number = ?'); vals.push(fields.number); }
  if (fields.cmd !== undefined) {
    sets.push('cmd = ?'); vals.push(fields.cmd);
    // Also update ch_links
    await upsertChLink(p, id, fields.cmd);
  }
  if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status); }
  sets.push('modified = NOW()');
  vals.push(id);
  await p.query(`UPDATE itv SET ${sets.join(', ')} WHERE id = ?`, vals);
}

// ── Reorder channels ────────────────────────────────────────────────

async function reorderChannels(order) {
  const p = getPool();
  for (const item of order) {
    const id = parseInt(item.id, 10);
    const num = parseInt(item.number, 10);
    if (isNaN(id) || isNaN(num)) {
      console.error(`[ministra] Skipping invalid reorder entry: id=${item.id}, number=${item.number}`);
      continue;
    }
    await p.query('UPDATE itv SET number = ?, modified = NOW() WHERE id = ?', [num, id]);
  }
  console.log(`[ministra] Reordered ${order.length} channels`);
}

// ── EPG functions ───────────────────────────────────────────────────

async function applyEpgIds(mappings) {
  const p = getPool();
  for (const m of mappings) {
    const id = Number(m.id);
    if (!id || isNaN(id)) continue;
    const sets = ['xmltv_id = ?'];
    const vals = [m.xmltv_id || ''];
    if (m.logo) {
      sets.push('logo = ?');
      vals.push(m.logo);
    }
    sets.push('modified = NOW()');
    vals.push(id);
    await p.query(`UPDATE itv SET ${sets.join(', ')} WHERE id = ?`, vals);
  }
  console.log(`[ministra] Applied EPG IDs to ${mappings.length} channels`);
}

async function getEpgStatus() {
  const p = getPool();
  const [rows] = await p.query(
    "SELECT id, name, xmltv_id FROM itv ORDER BY number ASC"
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    xmltv_id: r.xmltv_id || '',
    hasEpg: !!(r.xmltv_id && r.xmltv_id.trim()),
  }));
}

// ── EPG Source management (Ministra epg source table) ───────────────

async function discoverEpgSourceTable() {
  if (epgSourceTable) return epgSourceTable;
  const p = getPool();
  
  // Candidate table names used by different Ministra/Stalker versions
  const candidates = ['epg_url', 'epg_setting', 'epg_sources', 'epg_source'];
  
  // First check candidate tables
  for (const table of candidates) {
    try {
      const [cols] = await p.query(`SHOW COLUMNS FROM ${table}`);
      const colNames = cols.map(c => c.Field);
      if (colNames.includes('uri') || colNames.includes('url')) {
        epgSourceTable = { name: table, cols: colNames, urlField: colNames.includes('uri') ? 'uri' : 'url' };
        console.log(`[ministra] Found EPG source table: ${table} (columns: ${colNames.join(', ')})`);
        return epgSourceTable;
      }
    } catch {
      // Table doesn't exist, skip
    }
  }
  
  // Check the main 'epg' table - it might be the source table if it has few rows and a uri/url column
  try {
    const [cols] = await p.query('SHOW COLUMNS FROM epg');
    const colNames = cols.map(c => c.Field);
    if (colNames.includes('uri') || colNames.includes('url')) {
      // Check row count - if it's small (< 50), it's likely the source config table
      const [cnt] = await p.query('SELECT COUNT(*) as c FROM epg');
      if (cnt[0].c < 50) {
        epgSourceTable = { name: 'epg', cols: colNames, urlField: colNames.includes('uri') ? 'uri' : 'url' };
        console.log(`[ministra] EPG source table is 'epg' (${cnt[0].c} rows, columns: ${colNames.join(', ')})`);
        return epgSourceTable;
      }
      // Has uri column but too many rows - might be mixed. Log the schema for debugging
      console.log(`[ministra] 'epg' table has ${cnt[0].c} rows and uri column. Schema: ${colNames.join(', ')}`);
    }
  } catch {}

  // Last resort: search ALL tables for one with 'uri' field and few rows
  try {
    const [tables] = await p.query("SHOW TABLES");
    for (const row of tables) {
      const table = Object.values(row)[0];
      if (!table.toLowerCase().includes('epg')) continue;
      try {
        const [cols] = await p.query(`SHOW COLUMNS FROM \`${table}\``);
        const colNames = cols.map(c => c.Field);
        console.log(`[ministra] EPG-related table '${table}': ${colNames.join(', ')}`);
        if (colNames.includes('uri') || colNames.includes('url')) {
          const [cnt] = await p.query(`SELECT COUNT(*) as c FROM \`${table}\``);
          if (cnt[0].c < 100) {
            epgSourceTable = { name: table, cols: colNames, urlField: colNames.includes('uri') ? 'uri' : 'url' };
            console.log(`[ministra] Using '${table}' as EPG source table (${cnt[0].c} rows)`);
            return epgSourceTable;
          }
        }
      } catch {}
    }
  } catch {}

  console.error('[ministra] Could not find EPG source table!');
  return null;
}

async function getEpgSources() {
  const p = getPool();
  const tableInfo = await discoverEpgSourceTable();
  
  if (!tableInfo) {
    // Fallback: dump all epg-related table names for debugging
    try {
      const [tables] = await p.query("SHOW TABLES");
      const epgTables = [];
      for (const row of tables) {
        const t = Object.values(row)[0];
        if (t.toLowerCase().includes('epg')) epgTables.push(t);
      }
      console.log(`[ministra] EPG-related tables found: ${epgTables.join(', ') || 'none'}`);
      return { error: 'EPG source table not found', epg_tables: epgTables };
    } catch (err) {
      return { error: err.message };
    }
  }

  try {
    const [rows] = await p.query(`SELECT * FROM \`${tableInfo.name}\` ORDER BY id ASC`);
    return rows;
  } catch (err) {
    console.error(`[ministra] Failed to read ${tableInfo.name}: ${err.message}`);
    return [];
  }
}

async function addEpgSource(uri, prefix) {
  const p = getPool();
  const tableInfo = await discoverEpgSourceTable();
  if (!tableInfo) throw new Error('EPG source table not found in Ministra database');

  const urlField = tableInfo.urlField;
  
  // Check if this URL already exists
  const [existing] = await p.query(`SELECT id FROM \`${tableInfo.name}\` WHERE \`${urlField}\` = ?`, [uri]);
  if (existing.length > 0) {
    return { action: 'exists', id: existing[0].id };
  }

  // Build insert based on available columns
  const cols = tableInfo.cols;
  const insertCols = [urlField];
  const insertVals = [uri];
  const placeholders = ['?'];

  if (cols.includes('prefix')) { insertCols.push('prefix'); insertVals.push(prefix || ''); placeholders.push('?'); }
  if (cols.includes('status')) { insertCols.push('status'); insertVals.push(1); placeholders.push('?'); }
  if (cols.includes('enabled')) { insertCols.push('enabled'); insertVals.push(1); placeholders.push('?'); }

  const sql = `INSERT INTO \`${tableInfo.name}\` (${insertCols.map(c => '`'+c+'`').join(', ')}) VALUES (${placeholders.join(', ')})`;
  const [result] = await p.query(sql, insertVals);
  console.log(`[ministra] Added EPG source #${result.insertId} to ${tableInfo.name}: ${uri}`);
  return { action: 'created', id: result.insertId };
}

async function deleteEpgSource(id) {
  const p = getPool();
  const tableInfo = await discoverEpgSourceTable();
  if (!tableInfo) throw new Error('EPG source table not found');
  await p.query(`DELETE FROM \`${tableInfo.name}\` WHERE id = ?`, [id]);
  console.log(`[ministra] Deleted EPG source #${id} from ${tableInfo.name}`);
}

async function toggleEpgSource(id, enabled) {
  const p = getPool();
  const tableInfo = await discoverEpgSourceTable();
  if (!tableInfo) throw new Error('EPG source table not found');
  const statusCol = tableInfo.cols.includes('status') ? 'status' : tableInfo.cols.includes('enabled') ? 'enabled' : null;
  if (!statusCol) throw new Error('No status/enabled column found');
  await p.query(`UPDATE \`${tableInfo.name}\` SET \`${statusCol}\` = ? WHERE id = ?`, [enabled ? 1 : 0, id]);
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
  getItvColumns, deleteChannel, deleteChannels, updateChannel, reorderChannels,
  applyEpgIds, getEpgStatus,
  getEpgSources, addEpgSource, deleteEpgSource, toggleEpgSource,
};
