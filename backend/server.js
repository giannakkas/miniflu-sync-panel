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

      db.updateStreamSync(stream.stream_key, status, result.channelName, result.channelId);
      db.addLog({
        stream_key: stream.stream_key, title: stream.title,
        action: `sync → ${result.action}`,
        result: result.action === 'already_exists' ? 'skipped' : 'success',
        details: `Channel #${result.channelId}: ${result.channelName}`,
      });
    } catch (err) {
      results.failed++;
      db.updateStreamSync(stream.stream_key, 'failed', null, null);
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
