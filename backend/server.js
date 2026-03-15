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

// Auto-match channels to EPG IDs using iptv-org + manual alias map
app.post('/api/epg/auto-match', async (req, res) => {
  try {
    const channels = await ministra.getChannels();

    // ── Manual alias map: your channel name → iptv-org ID ──
    // Covers common Arabic/MENA/UK name mismatches
    const ALIAS_MAP = {
      // Saudi Arabia
      'saudi tv': 'AlSaudiya.sa',
      'saudi tv 1': 'AlSaudiya.sa',
      'saudi channel': 'AlSaudiya.sa',
      'saudi 1': 'AlSaudiya.sa',
      'al saudiya': 'AlSaudiya.sa',
      'sbc': 'SBC.sa',
      'sbc tv': 'SBC.sa',
      'saudi sport': 'SSC1.sa',
      'ssc 1': 'SSC1.sa',
      'ssc 2': 'SSC2.sa',
      'ssc 3': 'SSC3.sa',
      'ssc 4': 'SSC4.sa',
      'ssc 5': 'SSC5.sa',
      'ekhbariya': 'EkhbariyaTV.sa',
      'al ekhbariya': 'EkhbariyaTV.sa',
      'thikrayat': 'ThikrayatTV.sa',
      'rotana cinema ksa': 'RotanaCinemaKSA.sa',
      'rotana drama': 'RotanaDrama.sa',
      'rotana classic': 'RotanaClassic.sa',
      'rotana khalijia': 'RotanaKhalijiah.sa',
      'rotana music': 'RotanaMusic.sa',
      'rotana clip': 'RotanaClip.sa',
      'rotana cinema': 'RotanaCinemaEgypt.eg',
      'mbc 1': 'MBC1.sa',
      'mbc 2': 'MBC2.sa',
      'mbc 3': 'MBC3.sa',
      'mbc 4': 'MBC4.sa',
      'mbc 5': 'MBC5.sa',
      'mbc action': 'MBCAction.sa',
      'mbc drama': 'MBCDrama.sa',
      'mbc max': 'MBCMax.sa',
      'mbc bollywood': 'MBCBollywood.sa',
      'mbc iraq': 'MBCIraq.iq',
      'mbc masr': 'MBCMasr.eg',
      'mbc masr 2': 'MBCMasr2.eg',
      'mbc persia': 'MBCPersia.sa',
      // Egypt
      'cbc': 'CBC.eg',
      'cbc drama': 'CBCDrama.eg',
      'cbc sofra': 'CBCSofra.eg',
      'al hayat': 'AlhayatTV.eg',
      'al hayat tv': 'AlhayatTV.eg',
      'alhayat': 'AlhayatTV.eg',
      'alhayat drama': 'AlhayatDrama.eg',
      'al nahar': 'AlNaharTV.eg',
      'al nahar drama': 'AlNaharDrama.eg',
      'dmc': 'DMC.eg',
      'dmc drama': 'DMCDrama.eg',
      'nile cinema': 'NileCinema.eg',
      'nile comedy': 'NileComedy.eg',
      'nile drama': 'NileDrama.eg',
      'nile life': 'NileLife.eg',
      'nile tv': 'NileTV.eg',
      'nile tv international': 'NileTVInternational.eg',
      'sada el balad': 'SadaElbalad.eg',
      'sada elbalad': 'SadaElbalad.eg',
      'el mehwar': 'ElMehwarChannel.eg',
      'mehwar': 'ElMehwarChannel.eg',
      'al masriyah': 'AlMasriyah.eg',
      'ten tv': 'TeNTV.eg',
      'on e': 'ONEChannel.eg',
      'on drama': 'ONDrama.eg',
      'on sport': 'ONSport.eg',
      'ertu 1': 'ERTU1.eg',
      'channel 1 egypt': 'ERTU1.eg',
      'extra news': 'ExtraNewsTV.eg',
      'pnc food': 'PNCFood.eg',
      // UAE
      'al emarat': 'AlEmaratTV.ae',
      'al emarat tv': 'AlEmaratTV.ae',
      'emirates tv': 'AlEmaratTV.ae',
      'abu dhabi tv': 'AbuDhabiTV.ae',
      'abu dhabi': 'AbuDhabiTV.ae',
      'dubai tv': 'DubaiTV.ae',
      'dubai one': 'DubaiOne.ae',
      'dubai sport': 'DubaiSportsChannel.ae',
      'dubai sports': 'DubaiSportsChannel.ae',
      'sharjah tv': 'SharjahTV.ae',
      'sama dubai': 'SamaDubai.ae',
      'ad sport 1': 'ADSports1.ae',
      'ad sports 1': 'ADSports1.ae',
      'ad sport 2': 'ADSports2.ae',
      'ad sports 2': 'ADSports2.ae',
      'noor dubai': 'NoorDubai.ae',
      'baynounah': 'BaynounahTV.ae',
      'ajman tv': 'AjmanTV.ae',
      // Kuwait
      'kuwait tv': 'KTV1.kw',
      'kuwait tv 1': 'KTV1.kw',
      'ktv 1': 'KTV1.kw',
      'ktv 2': 'KTV2.kw',
      'ktv sport': 'KTVSport.kw',
      'kuwait sport': 'KTVSport.kw',
      'al rai': 'AlRaiTV.kw',
      'funoon': 'FunoonTV.kw',
      // Qatar
      'qatar tv': 'QatarTelevision.qa',
      'al rayyan': 'AlRayyanTV.qa',
      'al kass': 'AlKassTV.qa',
      'alkass': 'AlKassTV.qa',
      'beinsports 1': 'BeINSports1.qa',
      'bein sports 1': 'BeINSports1.qa',
      'bein sport 1': 'BeINSports1.qa',
      'bein sports 2': 'BeINSports2.qa',
      'bein sport 2': 'BeINSports2.qa',
      'bein sports 3': 'BeINSports3.qa',
      // Oman / Bahrain / Jordan / Lebanon
      'oman tv': 'OmanTV.om',
      'bahrain tv': 'BahrainTV.bh',
      'jordan tv': 'JordanTV.jo',
      'roya tv': 'RoyaTV.jo',
      'al mamlaka': 'AlMamlakaTV.jo',
      'lbc': 'LBCI.lb',
      'lbc international': 'LBCI.lb',
      'mtv lebanon': 'MTVLebanon.lb',
      'al mayadeen': 'AlMayadeenTV.lb',
      'al jadeed': 'AlJadeed.lb',
      // Pan-Arab
      'al jazeera': 'AlJazeera.qa',
      'al jazeera arabic': 'AlJazeera.qa',
      'al jazeera english': 'AlJazeeraEnglish.qa',
      'al jazeera mubasher': 'AlJazeeraMubasher.qa',
      'al arabiya': 'AlArabiya.sa',
      'alarabiya': 'AlArabiya.sa',
      'sky news arabia': 'SkyNewsArabia.ae',
      'france 24 arabic': 'France24Arabic.fr',
      'rt arabic': 'RTArabic.ru',
      'bbc arabic': 'BBCArabic.gb',
      'al hurra': 'AlHurra.us',
      'trt arabi': 'TRTArabi.tr',
      'cnbc arabia': 'CNBCArabiya.ae',
      // beIN
      'bein movies 1': 'BeINMovies1.qa',
      'bein movies 2': 'BeINMovies2.qa',
      'bein movies 3': 'BeINMovies3.qa',
      'bein movies 4': 'BeINMovies4.qa',
      'bein drama': 'BeINDrama.qa',
      'bein entertainment': 'BeINEntertainment.qa',
      'bein gourmet': 'BeINGourmet.qa',
      // UK
      'bbc one': 'BBCOne.uk',
      'bbc two': 'BBCTwo.uk',
      'bbc three': 'BBCThree.uk',
      'bbc four': 'BBCFour.uk',
      'bbc news': 'BBCNews.uk',
      'itv': 'ITV1.uk',
      'itv 1': 'ITV1.uk',
      'itv 2': 'ITV2.uk',
      'itv 3': 'ITV3.uk',
      'itv 4': 'ITV4.uk',
      'channel 4': 'Channel4.uk',
      'channel 5': 'Channel5.uk',
      'sky news': 'SkyNews.uk',
      'sky sports main event': 'SkySportsMainEvent.uk',
      'sky sports premier league': 'SkySportsPremierLeague.uk',
      'sky sports football': 'SkySportsFootball.uk',
      'sky cinema premiere': 'SkyCinemaPremiere.uk',
      'sky one': 'SkyShowcase.uk',
      'dave': 'Dave.uk',
      'e4': 'E4.uk',
      'film4': 'Film4.uk',
      'more4': 'More4.uk',
      'quest': 'Quest.uk',
      'bt sport 1': 'BTSport1.uk',
      'bt sport 2': 'BTSport2.uk',
      'bt sport 3': 'BTSport3.uk',
      'tnt sports 1': 'TNTSports1.uk',
      'tnt sports 2': 'TNTSports2.uk',
      'tnt sports 3': 'TNTSports3.uk',
      'eurosport 1': 'Eurosport1.uk',
      'eurosport 2': 'Eurosport2.uk',
      'comedy central': 'ComedyCentral.uk',
      'mtv': 'MTV.uk',
      'nickelodeon': 'Nickelodeon.uk',
      'cartoon network': 'CartoonNetwork.uk',
      'discovery': 'DiscoveryChannel.uk',
      'discovery channel': 'DiscoveryChannel.uk',
      'nat geo': 'NationalGeographic.uk',
      'national geographic': 'NationalGeographic.uk',
      'history': 'HistoryChannel.uk',
      'history channel': 'HistoryChannel.uk',
    };

    // ── 1. Fetch iptv-org database ──
    console.log('[epg] Fetching iptv-org database...');
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

    // Build lookups
    const iptvByName = new Map();
    const iptvByAlt = new Map();
    const iptvById = new Map();
    for (const ch of iptvChannels) {
      if (ch.closed) continue;
      const n = (ch.name || '').toLowerCase().trim();
      if (n && !iptvByName.has(n)) iptvByName.set(n, ch);
      if (ch.id) iptvById.set(ch.id.toLowerCase(), ch);
      if (ch.alt_names) {
        for (const alt of ch.alt_names) {
          const a = alt.toLowerCase().trim();
          if (a && !iptvByAlt.has(a)) iptvByAlt.set(a, ch);
        }
      }
    }

    // ── 2. Match each channel ──
    const results = [];
    for (const ch of channels) {
      const chName = (ch.name || '').toLowerCase().trim();
      const chClean = chName.replace(/[^a-z0-9]/g, '');

      let matchId = '';
      let matchName = '';
      let matchSource = '';

      // --- STEP 1: Manual alias map (highest priority, most accurate) ---
      const aliasId = ALIAS_MAP[chName];
      if (aliasId) {
        matchId = aliasId;
        matchName = chName;
        matchSource = 'alias';
      }

      // --- STEP 2: Exact name match in iptv-org ---
      if (!matchId) {
        const exact = iptvByName.get(chName) || iptvByAlt.get(chName);
        if (exact) {
          matchId = exact.id;
          matchName = exact.name;
          matchSource = 'iptv-org';
        }
      }

      // --- STEP 3: Cleaned name match (remove spaces, hyphens, etc) ---
      if (!matchId) {
        for (const [key, val] of iptvByName) {
          if (key.replace(/[^a-z0-9]/g, '') === chClean) {
            matchId = val.id;
            matchName = val.name;
            matchSource = 'iptv-org';
            break;
          }
        }
      }
      if (!matchId) {
        for (const [key, val] of iptvByAlt) {
          if (key.replace(/[^a-z0-9]/g, '') === chClean) {
            matchId = val.id;
            matchName = val.name;
            matchSource = 'iptv-org';
            break;
          }
        }
      }

      // --- STEP 4: Substring match (channel name contains or is contained) ---
      if (!matchId && chClean.length >= 4) {
        // Try exact substring first
        for (const [key, val] of iptvByName) {
          const kClean = key.replace(/[^a-z0-9]/g, '');
          if (kClean.length >= 4 && kClean === chClean) {
            matchId = val.id;
            matchName = val.name;
            matchSource = 'iptv-org';
            break;
          }
        }
        // Then containment
        if (!matchId) {
          for (const [key, val] of iptvByName) {
            const kClean = key.replace(/[^a-z0-9]/g, '');
            if (kClean.length >= 5 && chClean.length >= 5) {
              if (kClean.includes(chClean) || chClean.includes(kClean)) {
                matchId = val.id;
                matchName = val.name;
                matchSource = 'iptv-org';
                break;
              }
            }
          }
        }
      }

      // --- STEP 5: Common prefix/suffix normalization ---
      if (!matchId) {
        // Remove common suffixes: "hd", "sd", "fhd", "tv", "channel"
        const stripped = chClean
          .replace(/(hd|sd|fhd|uhd)$/, '')
          .replace(/^(al|el)/, '')
          .replace(/(tv|channel|ch)$/, '');

        if (stripped.length >= 3) {
          for (const [key, val] of iptvByName) {
            const kStripped = key.replace(/[^a-z0-9]/g, '')
              .replace(/(hd|sd|fhd|uhd)$/, '')
              .replace(/^(al|el)/, '')
              .replace(/(tv|channel|ch)$/, '');
            if (kStripped.length >= 3 && kStripped === stripped) {
              matchId = val.id;
              matchName = val.name;
              matchSource = 'iptv-org';
              break;
            }
          }
        }
      }

      results.push({
        id: ch.id, name: ch.name, number: ch.number, cmd: ch.cmd,
        current_xmltv_id: ch.xmltv_id || '',
        matched_tvg_id: matchId,
        matched_name: matchName,
        matched_tvg_logo: '', matched_country: '',
        matched_source: matchSource, matched: !!matchId,
      });
    }

    const matched = results.filter(r => r.matched).length;
    const sources = {};
    for (const r of results) { if (r.matched_source) sources[r.matched_source] = (sources[r.matched_source] || 0) + 1; }
    console.log(`[epg] Auto-matched ${matched}/${results.length}:`, sources);
    res.json(results);
  } catch (err) {
    console.error('[epg] Auto-match error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── EPG PROVIDERS ──────────────────────────────────────────────────
app.get('/api/epg/providers', (req, res) => {
  try {
    const providers = db.getEpgProviders();
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/epg/providers', (req, res) => {
  try {
    const { name, country, url, format, type, channels, enabled, notes } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
    const result = db.addEpgProvider({ name, country, url, format, type, channels, enabled, notes });
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/epg/providers/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.updateEpgProvider(id, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/epg/providers/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.deleteEpgProvider(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push enabled direct providers to Ministra EPG table
app.post('/api/epg/providers/push-to-ministra', async (req, res) => {
  try {
    const providers = db.getEpgProviders();
    const directEnabled = providers.filter(p => p.type === 'direct' && p.enabled);
    if (directEnabled.length === 0) return res.json({ ok: true, pushed: 0, message: 'No enabled direct providers to push' });

    // First: fix any .gz URLs in Ministra (Stalker 5.6.10 can't parse gzip)
    try {
      const existingSources = await ministra.getEpgSources();
      if (Array.isArray(existingSources)) {
        for (const src of existingSources) {
          const url = src.uri || src.url || '';
          if (url.endsWith('.xml.gz')) {
            const fixedUrl = url.replace('.xml.gz', '.xml');
            console.log(`[epg] Fixing gzip URL in Ministra: ${url} → ${fixedUrl}`);
            await ministra.updateEpgSourceUrl(src.id, fixedUrl);
          }
        }
      }
    } catch (err) {
      console.log(`[epg] Could not fix gz URLs: ${err.message}`);
    }

    const results = [];
    for (const p of directEnabled) {
      // Ensure we never push .gz URLs
      const url = p.url.endsWith('.xml.gz') ? p.url.replace('.xml.gz', '.xml') : p.url;
      try {
        const result = await ministra.addEpgSource(url, '');
        results.push({ name: p.name, ...result });
      } catch (err) {
        results.push({ name: p.name, action: 'error', error: err.message });
      }
    }
    const created = results.filter(r => r.action === 'created').length;
    const existing = results.filter(r => r.action === 'exists').length;
    const errors = results.filter(r => r.action === 'error').length;
    console.log(`[epg] Pushed to Ministra: ${created} created, ${existing} already exist, ${errors} errors`);
    res.json({ ok: true, pushed: created, existing, errors, results });
  } catch (err) {
    console.error('[epg] Push to Ministra error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get current Ministra EPG sources
app.get('/api/epg/ministra-sources', async (req, res) => {
  try {
    const sources = await ministra.getEpgSources();
    // If it's an error object with diagnostics, return it
    if (sources && sources.error) {
      return res.json({ sources: [], debug: sources });
    }
    res.json(Array.isArray(sources) ? sources : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a Ministra EPG source
app.delete('/api/epg/ministra-sources/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await ministra.deleteEpgSource(id);
    res.json({ ok: true });
  } catch (err) {
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

// ─── ADMIN: EPG table diagnostic ──────────────────────────────────
app.get('/api/admin/epg-tables', async (req, res) => {
  try {
    const ministraPool = require('./ministra');
    // We need raw pool access for diagnostics
    const mysql = require('mysql2/promise');
    const dbCfg = {
      host: db.getSetting('ministra_db_host'),
      port: parseInt(db.getSetting('ministra_db_port') || '3306'),
      user: db.getSetting('ministra_db_user'),
      password: db.getSetting('ministra_db_pass'),
      database: db.getSetting('ministra_db_name') || 'stalker_db',
      connectTimeout: 10000,
    };
    const conn = await mysql.createConnection(dbCfg);
    const [tables] = await conn.query('SHOW TABLES');
    const result = [];
    for (const row of tables) {
      const table = Object.values(row)[0];
      if (!table.toLowerCase().includes('epg')) continue;
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
      const [cnt] = await conn.query(`SELECT COUNT(*) as c FROM \`${table}\``);
      const colInfo = cols.map(c => `${c.Field} (${c.Type}${c.Null === 'NO' ? ' NOT NULL' : ''})`);
      // Get sample row
      const [sample] = await conn.query(`SELECT * FROM \`${table}\` LIMIT 3`);
      result.push({
        table,
        rows: cnt[0].c,
        columns: colInfo,
        sample: sample.map(s => {
          // Truncate long values
          const trimmed = {};
          for (const [k, v] of Object.entries(s)) {
            const str = String(v || '');
            trimmed[k] = str.length > 100 ? str.slice(0, 100) + '...' : str;
          }
          return trimmed;
        }),
      });
    }
    await conn.end();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
