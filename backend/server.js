#!/usr/bin/env node
/**
 * MiniFlu Sync Panel – Backend API
 * Bridges Flussonic Media Server ↔ Ministra (Stalker Portal).
 */

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');

const db = require('./db');
const flussonic = require('./flussonic');
const ministra = require('./ministra');

const app = express();
app.use(express.json());

// Debug: verify this is the latest code
app.get('/api/version', (req, res) => res.json({ version: 'v20-reorder-fix', time: new Date().toISOString() }));

// Debug: log ALL PUT requests
app.use((req, res, next) => {
  if (req.method === 'PUT') {
    console.log(`[DEBUG] PUT ${req.path} body:`, JSON.stringify(req.body).slice(0, 200));
  }
  next();
});

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// ─── AUTH ───────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  // Check admin
  const adminUser = db.getSetting('admin_user');
  const adminHash = db.getSetting('admin_pass');
  if (username === adminUser && bcrypt.compareSync(password, adminHash)) {
    return res.json({ ok: true, user: username, role: 'admin' });
  }
  
  // Check operator
  const opUser = db.getSetting('operator_user');
  const opHash = db.getSetting('operator_pass');
  if (username === opUser && bcrypt.compareSync(password, opHash)) {
    return res.json({ ok: true, user: username, role: 'operator' });
  }
  
  res.status(401).json({ error: 'Invalid credentials' });
});

// ─── SETTINGS ───────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  db.saveSettings(req.body);
  scheduleAutoSync();
  res.json({ ok: true });
});

// ─── TEST CONNECTIONS ───────────────────────────────────────────────
app.post('/api/test/flussonic', async (req, res) => {
  try { res.json(await flussonic.testConnection()); }
  catch (err) { res.json({ ok: false, message: err.message }); }
});

app.post('/api/test/ministra', async (req, res) => {
  try { res.json(await ministra.testConnection()); }
  catch (err) { res.json({ ok: false, message: err.message }); }
});

// ─── DASHBOARD ──────────────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const streams = db.getAllStreams();
  const total = streams.length;
  const synced = streams.filter(s => s.status === 'synced').length;
  const notSynced = streams.filter(s => s.status === 'not_synced').length;
  const failed = streams.filter(s => s.status === 'failed').length;
  const fHost = db.getSetting('flussonic_host');
  const mHost = db.getSetting('ministra_db_host');

  res.json({
    total, synced, notSynced, failed,
    flussonicConfigured: !!fHost,
    ministraConfigured: !!mHost,
    lastSyncTime: db.getSyncState('last_full_sync'),
    syncInterval: db.getSetting('sync_interval_minutes') || '5',
    flussonicHost: fHost ? `${fHost}:${db.getSetting('flussonic_port') || '80'}` : null,
    ministraHost: mHost || null,
  });
});

// ─── Helper: refresh from Flussonic + reconcile with Ministra ───────
async function refreshFromFlussonic() {
  const flussonicStreams = await flussonic.fetchStreams();

  db.markAllStreamsDead();
  let order = 1;
  for (const s of flussonicStreams) {
    const existing = db.getStreamByKey(s.name);
    db.upsertStream({
      stream_key: s.name,
      title: s.title || s.name,
      output_url: flussonic.buildOutputUrl(s.name),
      protocol: 'MPEG-TS',
      bitrate: s.bitrate || null,
      resolution: s.resolution || null,
      sort_order: existing ? existing.sort_order : order,
      raw_json: JSON.stringify(s.raw || {}),
    });
    order++;
  }
  db.removeDeadStreams();

  // Bidirectional: check which streams already exist in Ministra
  try {
    const reconcile = await ministra.reconcileWithPanel(db);
    console.log(`[reconcile] ${reconcile.matched} matched, ${reconcile.unmatched} unmatched in Ministra (${reconcile.total} total channels)`);
  } catch (err) {
    console.log(`[reconcile] Ministra reconcile skipped: ${err.message}`);
  }

  return flussonicStreams.length;
}

// ─── STREAMS ────────────────────────────────────────────────────────
app.get('/api/streams', (req, res) => {
  res.json(db.getAllStreams());
});

app.post('/api/streams/refresh', async (req, res) => {
  try {
    const count = await refreshFromFlussonic();
    db.addLog({ action: 'refresh', result: 'success', details: `Fetched ${count} stream(s) from Flussonic` });
    res.json({ ok: true, message: `Fetched ${count} stream(s) from Flussonic` });
  } catch (err) {
    db.addLog({ action: 'refresh', result: 'failed', details: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/streams/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  db.reorderStreams(order);
  res.json({ ok: true });
});

// ─── SYNC ───────────────────────────────────────────────────────────

async function syncStreamKeys(streamKeys) {
  const results = { total: 0, success: 0, updated: 0, failed: 0, skipped: 0 };
  const streams = streamKeys
    ? streamKeys.map(k => db.getStreamByKey(k)).filter(Boolean)
    : db.getAllStreams();

  results.total = streams.length;

  for (const stream of streams) {
    try {
      const result = await ministra.syncStream(
        stream.stream_key, stream.title, stream.output_url, stream.sort_order
      );

      let status = 'synced';
      if (result.action === 'created') { results.success++; }
      else if (result.action === 'updated') { results.updated++; }
      else { results.skipped++; }

      db.updateStreamSync(stream.stream_key, status, result.channelName, result.channelId, '');
      db.addLog({
        stream_key: stream.stream_key, title: stream.title,
        action: `sync → ${result.action}`,
        result: result.action === 'already_exists' ? 'skipped' : 'success',
        details: `Channel #${result.channelId}: ${result.channelName}`,
      });
    } catch (err) {
      results.failed++;
      db.updateStreamSync(stream.stream_key, 'failed', null, null, err.message);
      db.addLog({
        stream_key: stream.stream_key, title: stream.title,
        action: 'sync', result: 'failed', details: err.message,
      });
    }
  }
  return results;
}

app.post('/api/sync', async (req, res) => {
  try {
    const { streamKeys } = req.body;
    const results = await syncStreamKeys(streamKeys);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/full', async (req, res) => {
  try {
    await refreshFromFlussonic();
    const results = await syncStreamKeys(null);
    db.setSyncState('last_full_sync', new Date().toISOString());
    db.addLog({
      action: 'full_sync',
      result: results.failed > 0 ? 'failed' : 'success',
      details: `Full sync: ${results.success} created, ${results.updated} updated, ${results.skipped} unchanged, ${results.failed} failed`,
    });
    res.json(results);
  } catch (err) {
    db.addLog({ action: 'full_sync', result: 'failed', details: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync/status', (req, res) => {
  res.json({
    lastFullSync: db.getSyncState('last_full_sync'),
    running: false,
  });
});

// ─── CHANNELS (live from Ministra) ──────────────────────────────────
app.get('/api/channels', async (req, res) => {
  try { res.json(await ministra.getChannels()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// IMPORTANT: /reorder must come BEFORE /:id or Express matches "reorder" as an id
app.put('/api/channels/reorder', async (req, res) => {
  console.log('=== REORDER HIT ===');
  try {
    const body = req.body;
    const order = body && body.order;
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array' });
    }

    const mysql2 = require('mysql2/promise');
    const dbMod = require('./db');
    const conn = await mysql2.createConnection({
      host: dbMod.getSetting('ministra_db_host'),
      port: Number(dbMod.getSetting('ministra_db_port')) || 3306,
      user: dbMod.getSetting('ministra_db_user'),
      password: dbMod.getSetting('ministra_db_pass'),
      database: dbMod.getSetting('ministra_db_name') || 'stalker_db',
    });

    let count = 0;
    for (let i = 0; i < order.length; i++) {
      const rawId = order[i].id;
      const rawNum = order[i].number;
      const id = typeof rawId === 'string' ? parseInt(rawId) : rawId;
      const num = typeof rawNum === 'string' ? parseInt(rawNum) : rawNum;
      if (id && num >= 0 && !isNaN(id) && !isNaN(num)) {
        await conn.execute('UPDATE itv SET number = ?, modified = NOW() WHERE id = ?', [num, id]);
        count++;
      }
    }

    await conn.end();
    console.log(`=== REORDER DONE: ${count}/${order.length} ===`);
    res.json({ ok: true, reordered: count });
  } catch (err) {
    console.error('=== REORDER ERROR:', err.message, '===');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/channels/delete-batch', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    await ministra.deleteChannels(ids);
    res.json({ ok: true, deleted: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/channels/:id', async (req, res) => {
  try {
    await ministra.updateChannel(parseInt(req.params.id), req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/channels/:id', async (req, res) => {
  try {
    await ministra.deleteChannel(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── M3U EXPORT ─────────────────────────────────────────────────────
app.get('/api/channels/export.m3u', async (req, res) => {
  try {
    const channels = await ministra.getChannels();
    let m3u = '#EXTM3U\n';
    for (const ch of channels) {
      const name = ch.name || '';
      const tvgName = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
      const tvgId = ch.xmltv_id || (tvgName.toLowerCase().replace(/\s+/g, '') + '.tv');
      const logo = 'https://logo.m3uassets.com/' + tvgName.toLowerCase().replace(/\s+/g, '') + '.png';
      const url = ch.cmd || '';
      m3u += `#EXTINF:0 CUID="${ch.number}" tvg-name="${name}" tvg-id="${tvgId}" tvg-logo="${logo}" group-title="",${name}\n`;
      m3u += `${url}\n`;
    }
    res.setHeader('Content-Type', 'application/x-mpegurl');
    res.setHeader('Content-Disposition', 'attachment; filename="channels.m3u"');
    res.send(m3u);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EPG ────────────────────────────────────────────────────────────

// Parse M3U text and return channel→tvg-id mappings
function parseM3UForEpg(m3uText) {
  const lines = m3uText.split('\n');
  const mappings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;
    const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
    const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
    const nameMatch = line.match(/,([^$]+)$/);
    const urlLine = (lines[i + 1] || '').trim();
    if (nameMatch) {
      mappings.push({
        name: nameMatch[1].trim(),
        tvg_id: tvgIdMatch ? tvgIdMatch[1] : '',
        tvg_logo: tvgLogoMatch ? tvgLogoMatch[1] : '',
        url: urlLine.startsWith('http') ? urlLine : '',
      });
    }
  }
  return mappings;
}

// Match M3U entries to Ministra channels by name or URL
app.post('/api/epg/match', async (req, res) => {
  try {
    const { m3u_text } = req.body;
    if (!m3u_text) return res.status(400).json({ error: 'No M3U data provided' });

    const mappings = parseM3UForEpg(m3u_text);
    const channels = await ministra.getChannels();

    const results = channels.map(ch => {
      // Try to find matching M3U entry by name (fuzzy) or URL
      const chNameLower = (ch.name || '').toLowerCase().trim();
      const chUrl = (ch.cmd || '').trim();

      let match = mappings.find(m => m.url && chUrl && m.url === chUrl);
      if (!match) match = mappings.find(m => m.name.toLowerCase().trim() === chNameLower);
      if (!match) {
        // Fuzzy: strip special chars and compare
        const chClean = chNameLower.replace(/[^a-z0-9]/g, '');
        match = mappings.find(m => m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === chClean);
      }

      return {
        id: ch.id,
        name: ch.name,
        number: ch.number,
        cmd: ch.cmd,
        current_xmltv_id: ch.xmltv_id || '',
        matched_tvg_id: match ? match.tvg_id : '',
        matched_tvg_logo: match ? match.tvg_logo : '',
        matched: !!match,
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply EPG IDs to Ministra channels
app.post('/api/epg/apply', async (req, res) => {
  try {
    const { mappings } = req.body; // [{ id: number, xmltv_id: string, logo: string }]
    if (!Array.isArray(mappings)) return res.status(400).json({ error: 'mappings must be an array' });

    await ministra.applyEpgIds(mappings);
    res.json({ ok: true, applied: mappings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get EPG status for all channels
app.get('/api/epg/status', async (req, res) => {
  try {
    const status = await ministra.getEpgStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-match channels to EPG IDs using iptv-org database + epg.best API
app.post('/api/epg/auto-match', async (req, res) => {
  try {
    const channels = await ministra.getChannels();
    
    // 1. Fetch iptv-org channel database (bulk, fast)
    console.log('[epg] Fetching iptv-org channel database...');
    let iptvChannels = [];
    try {
      const dbRes = await fetch('https://iptv-org.github.io/api/channels.json', {
        signal: AbortSignal.timeout(30000),
      });
      if (dbRes.ok) iptvChannels = await dbRes.json();
      console.log(`[epg] Loaded ${iptvChannels.length} channels from iptv-org`);
    } catch (err) {
      console.log(`[epg] iptv-org fetch failed: ${err.message}`);
    }

    // Build iptv-org lookup maps
    const byName = new Map();
    const byAltName = new Map();
    for (const ch of iptvChannels) {
      if (ch.closed) continue;
      const nameLower = (ch.name || '').toLowerCase().trim();
      if (nameLower && !byName.has(nameLower)) byName.set(nameLower, ch);
      if (ch.alt_names) {
        for (const alt of ch.alt_names) {
          const altLower = alt.toLowerCase().trim();
          if (altLower && !byAltName.has(altLower)) byAltName.set(altLower, ch);
        }
      }
    }

    // 2. Match each channel - try iptv-org first, then epg.best as fallback
    const results = [];
    for (const ch of channels) {
      const chName = (ch.name || '').toLowerCase().trim();
      const chClean = chName.replace(/[^a-z0-9]/g, '');

      // Try iptv-org: exact name
      let match = byName.get(chName) || byAltName.get(chName);

      // iptv-org: fuzzy strip special chars
      if (!match) {
        for (const [key, val] of byName) {
          if (key.replace(/[^a-z0-9]/g, '') === chClean) { match = val; break; }
        }
      }
      if (!match) {
        for (const [key, val] of byAltName) {
          if (key.replace(/[^a-z0-9]/g, '') === chClean) { match = val; break; }
        }
      }

      // iptv-org: partial match
      if (!match && chClean.length >= 4) {
        for (const [key, val] of byName) {
          const keyClean = key.replace(/[^a-z0-9]/g, '');
          if (keyClean.length >= 4 && (keyClean.includes(chClean) || chClean.includes(keyClean))) {
            match = val; break;
          }
        }
      }

      if (match) {
        results.push({
          id: ch.id, name: ch.name, number: ch.number, cmd: ch.cmd,
          current_xmltv_id: ch.xmltv_id || '',
          matched_tvg_id: match.id,
          matched_name: match.name,
          matched_logo: '',
          matched_country: match.country || '',
          matched_source: 'iptv-org',
          matched: true,
        });
        continue;
      }

      // 3. Fallback: try epg.best search API
      let epgBestMatch = null;
      try {
        const searchName = encodeURIComponent(ch.name);
        const epgRes = await fetch(`https://epg.best/api/v2/channels?search=${searchName}&per_page=5`, {
          signal: AbortSignal.timeout(10000),
        });
        if (epgRes.ok) {
          const epgData = await epgRes.json();
          const epgResults = epgData.data || epgData;
          if (Array.isArray(epgResults) && epgResults.length > 0) {
            epgBestMatch = epgResults[0]; // Best match
          }
        }
      } catch {
        // epg.best failed, skip
      }

      results.push({
        id: ch.id, name: ch.name, number: ch.number, cmd: ch.cmd,
        current_xmltv_id: ch.xmltv_id || '',
        matched_tvg_id: epgBestMatch ? epgBestMatch.tvg_id : '',
        matched_name: epgBestMatch ? epgBestMatch.display_name : '',
        matched_logo: '',
        matched_country: epgBestMatch ? epgBestMatch.country : '',
        matched_source: epgBestMatch ? 'epg.best' : '',
        matched: !!epgBestMatch,
      });
    }

    const matched = results.filter(r => r.matched).length;
    console.log(`[epg] Auto-matched ${matched}/${results.length} channels`);
    res.json(results);
  } catch (err) {
    console.error('[epg] Auto-match error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── LOGS ───────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  res.json({ logs: db.getLogs(limit, offset) });
});

app.delete('/api/logs', (req, res) => {
  db.clearLogs();
  res.json({ ok: true });
});

// ─── ADMIN: Reset local cache ───────────────────────────────────────
app.post('/api/admin/reset', async (req, res) => {
  db.db.exec('DELETE FROM streams');
  db.db.exec('DELETE FROM logs');
  db.db.exec('DELETE FROM sync_state');
  // Settings are preserved
  res.json({ ok: true, message: 'Streams, logs, sync state cleared. Settings preserved.' });
});

// ─── SPA fallback ───────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── AUTO-SYNC SCHEDULER ───────────────────────────────────────────
let cronJob = null;

function scheduleAutoSync() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
  const minutes = parseInt(db.getSetting('sync_interval_minutes') || '0', 10);
  if (minutes <= 0) { console.log('[scheduler] Auto-sync disabled'); return; }

  cronJob = cron.schedule(`*/${minutes} * * * *`, async () => {
    console.log(`[scheduler] Auto-sync triggered (every ${minutes}m)`);
    try {
      // Only refresh from Flussonic and reconcile with Ministra
      // Does NOT force-sync unsynced streams — user must do that manually
      await refreshFromFlussonic();
      console.log(`[scheduler] Refresh + reconcile done`);
    } catch (err) {
      console.error(`[scheduler] Error: ${err.message}`);
      db.addLog({ action: 'auto_sync', result: 'failed', details: err.message });
    }
  });
  console.log(`[scheduler] Auto-sync every ${minutes} minutes`);
}

// ─── START ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MiniFlu backend listening on port ${PORT}`);
  scheduleAutoSync();
});

process.on('SIGTERM', async () => {
  if (cronJob) cronJob.stop();
  await ministra.close();
  process.exit(0);
});
