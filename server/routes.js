import { Router } from 'express';
import {
  getSetting, setSetting, getAllSettings,
  getAllStreamStates, getLogs, getLogCount, clearLogs,
  updateSortOrder,
} from './db.js';
import {
  refreshStreams, syncStreamsToMinistra, fullSync,
  testFlussonic, testMinistra, getMinistraChannels,
  getSyncStatus,
} from './sync.js';

const router = Router();

// ── Auth ──────────────────────────────────────────────
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = getSetting('admin_user', 'admin');
  const adminPass = getSetting('admin_pass', 'admin');

  if (username === adminUser && password === adminPass) {
    res.json({ ok: true, username });
  } else {
    res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }
});

// ── Settings ──────────────────────────────────────────
router.get('/settings', (req, res) => {
  const settings = getAllSettings();
  // Don't expose passwords in full
  const safe = { ...settings };
  if (safe.flussonic_pass) safe.flussonic_pass = '••••••';
  if (safe.ministra_api_pass) safe.ministra_api_pass = '••••••';
  if (safe.ministra_db_pass) safe.ministra_db_pass = '••••••';
  if (safe.admin_pass) safe.admin_pass = '••••••';
  res.json(safe);
});

router.put('/settings', (req, res) => {
  const allowed = [
    'flussonic_host', 'flussonic_port', 'flussonic_user', 'flussonic_pass',
    'ministra_api_url', 'ministra_api_user', 'ministra_api_pass',
    'ministra_db_host', 'ministra_db_port', 'ministra_db_user', 'ministra_db_pass', 'ministra_db_name',
    'admin_user', 'admin_pass',
    'sync_interval_minutes',
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== '••••••') {
      setSetting(key, req.body[key]);
    }
  }

  res.json({ ok: true });
});

// ── Test Connections ──────────────────────────────────
router.post('/test/flussonic', async (req, res) => {
  try {
    const result = await testFlussonic();
    res.json(result);
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

router.post('/test/ministra', async (req, res) => {
  try {
    const result = await testMinistra();
    res.json(result);
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ── Streams (from Flussonic) ──────────────────────────
router.get('/streams', (req, res) => {
  const streams = getAllStreamStates();
  res.json(streams);
});

router.post('/streams/refresh', async (req, res) => {
  try {
    const count = await refreshStreams();
    res.json({ ok: true, count, message: `${count} streams refreshed from Flussonic` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/streams/reorder', (req, res) => {
  const { order } = req.body; // [{ streamKey, sortOrder }]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

  for (const item of order) {
    updateSortOrder(item.streamKey, item.sortOrder);
  }
  res.json({ ok: true });
});

// ── Sync ──────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const { streamKeys } = req.body; // optional: specific streams to sync
    const result = await syncStreamsToMinistra(streamKeys || null);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/sync/full', async (req, res) => {
  try {
    const result = await fullSync();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/sync/status', (req, res) => {
  res.json(getSyncStatus());
});

// ── Channels (in Ministra) ────────────────────────────
router.get('/channels', async (req, res) => {
  try {
    const channels = await getMinistraChannels();
    // Cross-reference with sync state
    const states = getAllStreamStates();
    const stateMap = {};
    for (const s of states) {
      if (s.ministra_channel_id) stateMap[s.ministra_channel_id] = s;
    }

    const enriched = channels.map(ch => {
      const state = stateMap[ch.id];
      return {
        ...ch,
        sourceStream: state?.stream_key || null,
        status: state?.status || 'synced',
        lastUpdated: state?.last_synced || null,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Logs ──────────────────────────────────────────────
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const logs = getLogs(limit, offset);
  const total = getLogCount();
  res.json({ logs, total });
});

router.delete('/logs', (req, res) => {
  clearLogs();
  res.json({ ok: true });
});

// ── Dashboard ─────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const streams = getAllStreamStates();
  const syncStatus = getSyncStatus();
  const settings = getAllSettings();

  const total = streams.length;
  const synced = streams.filter(s => s.status === 'synced' || s.status === 'updated').length;
  const notSynced = streams.filter(s => s.status === 'not_synced').length;
  const failed = streams.filter(s => s.status === 'failed').length;

  const flussonicConfigured = !!settings.flussonic_host;
  const ministraConfigured = !!(settings.ministra_db_host || settings.ministra_api_url);

  res.json({
    total, synced, notSynced, failed,
    flussonicConfigured,
    ministraConfigured,
    flussonicHost: settings.flussonic_host ? `${settings.flussonic_host}:${settings.flussonic_port || 80}` : null,
    ministraHost: settings.ministra_db_host || settings.ministra_api_url || null,
    syncInterval: settings.sync_interval_minutes || 5,
    ...syncStatus,
  });
});

export default router;
