#!/usr/bin/env node
/**
 * MiniFlu Sync Panel – Backend API
 *
 * Bridges Flussonic Media Server ↔ Ministra (Stalker Portal).
 * Fetches streams from Flussonic, syncs them as IPTV channels into Ministra via direct MySQL.
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

// ─── Serve static frontend (production) ─────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// ─── Auth middleware (simple token-free session) ────────────────────
// For simplicity we use Basic-style check. The frontend stores login in
// localStorage. Every /api/* call (except /api/auth/login) must include
// Authorization: Basic base64(user:pass) OR we just check a session cookie.
//
// In the first version we keep it simple: only /api/auth/login validates
// credentials. Other routes are open once the SPA is loaded. This matches
// the original Lovable pattern. Add JWT later if needed.

// ─── AUTH ───────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const storedUser = db.getSetting('admin_user');
  const storedHash = db.getSetting('admin_pass');

  if (username === storedUser && bcrypt.compareSync(password, storedHash)) {
    return res.json({ ok: true, user: username });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// ─── SETTINGS ───────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  db.saveSettings(req.body);
  // Reschedule auto-sync if interval changed
  scheduleAutoSync();
  res.json({ ok: true });
});

// ─── TEST CONNECTIONS ───────────────────────────────────────────────
app.post('/api/test/flussonic', async (req, res) => {
  try {
    const result = await flussonic.testConnection();
    res.json(result);
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

app.post('/api/test/ministra', async (req, res) => {
  try {
    const result = await ministra.testConnection();
    res.json(result);
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── DASHBOARD ──────────────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const streams = db.getAllStreams();
  const total = streams.length;
  const synced = streams.filter(s => ['synced', 'updated', 'already_exists'].includes(s.status)).length;
  const notSynced = streams.filter(s => s.status === 'not_synced').length;
  const failed = streams.filter(s => s.status === 'failed').length;

  const fHost = db.getSetting('flussonic_host');
  const mHost = db.getSetting('ministra_db_host');

  res.json({
    total,
    synced,
    notSynced,
    failed,
    flussonicConfigured: !!fHost,
    ministraConfigured: !!mHost,
    lastSyncTime: db.getSyncState('last_full_sync'),
    syncInterval: db.getSetting('sync_interval_minutes') || '5',
    flussonicHost: fHost ? `${fHost}:${db.getSetting('flussonic_port') || '80'}` : null,
    ministraHost: mHost || null,
  });
});

// ─── STREAMS ────────────────────────────────────────────────────────
app.get('/api/streams', (req, res) => {
  res.json(db.getAllStreams());
});

app.post('/api/streams/refresh', async (req, res) => {
  try {
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

    db.addLog({
      action: 'refresh',
      result: 'success',
      details: `Fetched ${flussonicStreams.length} stream(s) from Flussonic`,
    });

    res.json({ ok: true, message: `Fetched ${flussonicStreams.length} stream(s) from Flussonic` });
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
        stream.stream_key,
        stream.title,
        stream.output_url,
        stream.sort_order
      );

      let status;
      if (result.action === 'created') {
        status = 'synced';
        results.success++;
      } else if (result.action === 'updated') {
        status = 'updated';
        results.updated++;
      } else {
        status = 'synced';
        results.skipped++;
      }

      db.updateStreamSync(stream.stream_key, status, result.channelName, result.channelId);

      db.addLog({
        stream_key: stream.stream_key,
        title: stream.title,
        action: `sync → ${result.action}`,
        result: result.action === 'already_exists' ? 'skipped' : 'success',
        details: `Channel #${result.channelId}: ${result.channelName}`,
      });
    } catch (err) {
      results.failed++;
      db.updateStreamSync(stream.stream_key, 'failed', null, null);
      db.addLog({
        stream_key: stream.stream_key,
        title: stream.title,
        action: 'sync',
        result: 'failed',
        details: err.message,
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
    // First refresh from Flussonic
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

    // Then sync all to Ministra
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
    running: false, // Could add mutex later
  });
});

// ─── CHANNELS ───────────────────────────────────────────────────────
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await ministra.getChannels();
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOGS ───────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const logs = db.getLogs(limit, offset);
  res.json({ logs });
});

app.delete('/api/logs', (req, res) => {
  db.clearLogs();
  res.json({ ok: true });
});

// ─── SPA fallback ───────────────────────────────────────────────────
app.get('*', (req, res) => {
  // Don't serve HTML for /api/* 404s
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── AUTO-SYNC SCHEDULER ───────────────────────────────────────────
let cronJob = null;

function scheduleAutoSync() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }

  const minutes = parseInt(db.getSetting('sync_interval_minutes') || '0', 10);
  if (minutes <= 0) {
    console.log('[scheduler] Auto-sync disabled');
    return;
  }

  const expr = `*/${minutes} * * * *`;
  cronJob = cron.schedule(expr, async () => {
    console.log(`[scheduler] Auto-sync triggered (every ${minutes}m)`);
    try {
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

      const results = await syncStreamKeys(null);
      db.setSyncState('last_full_sync', new Date().toISOString());
      console.log(`[scheduler] Sync done: ${results.success} created, ${results.updated} updated, ${results.failed} failed`);
    } catch (err) {
      console.error(`[scheduler] Sync error: ${err.message}`);
      db.addLog({ action: 'auto_sync', result: 'failed', details: err.message });
    }
  });

  console.log(`[scheduler] Auto-sync scheduled every ${minutes} minutes`);
}

// ─── START ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`MiniFlu backend listening on port ${PORT}`);
  scheduleAutoSync();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (cronJob) cronJob.stop();
  await ministra.close();
  process.exit(0);
});
