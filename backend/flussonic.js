/**
 * Flussonic Media Server API client.
 *
 * Supports both:
 *   - v3 API:  GET /streamer/api/v3/streams   (Flussonic 21+)
 *   - Legacy:  GET /flussonic/api/media        (older versions)
 *
 * Auto-detects on first successful call and caches the endpoint.
 */

const { getSetting } = require('./db');

let cachedEndpoint = null; // 'v3' | 'legacy' | null

function baseUrl() {
  const host = getSetting('flussonic_host');
  const port = getSetting('flussonic_port') || '80';
  if (!host) throw new Error('Flussonic host not configured');
  const proto = port === '443' ? 'https' : 'http';
  return `${proto}://${host}:${port}`;
}

function authHeader() {
  const user = getSetting('flussonic_user');
  const pass = getSetting('flussonic_pass');
  if (!user) return {};
  return { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') };
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...authHeader(), ...opts.headers },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Fetch all streams from Flussonic.
 * Returns a normalised array: [{ name, title, input, stats, ... }]
 */
async function fetchStreams() {
  const base = baseUrl();

  // Try cached endpoint first
  if (cachedEndpoint === 'v3') return fetchV3(base);
  if (cachedEndpoint === 'legacy') return fetchLegacy(base);

  // Auto-detect
  try {
    const result = await fetchV3(base);
    cachedEndpoint = 'v3';
    return result;
  } catch {
    try {
      const result = await fetchLegacy(base);
      cachedEndpoint = 'legacy';
      return result;
    } catch (err) {
      throw new Error(`Cannot reach Flussonic at ${base}: ${err.message}`);
    }
  }
}

async function fetchV3(base) {
  // Flussonic v3 API paginates - fetch all pages
  let allStreams = [];
  let cursor = '';
  
  while (true) {
    const url = cursor 
      ? `${base}/streamer/api/v3/streams?cursor=${encodeURIComponent(cursor)}&limit=1000`
      : `${base}/streamer/api/v3/streams?limit=1000`;
    
    const data = await fetchJSON(url);
    const arr = Array.isArray(data) ? data : (data.streams || []);
    allStreams = allStreams.concat(arr.map(normalizeV3));
    
    // Check for next page cursor
    if (data.next_cursor || data.cursor) {
      const nextCursor = data.next_cursor || data.cursor;
      if (nextCursor === cursor || arr.length === 0) break; // No more pages
      cursor = nextCursor;
    } else {
      break; // No pagination info = single page
    }
  }
  
  console.log(`[flussonic] Fetched ${allStreams.length} streams from v3 API`);
  return allStreams;
}

async function fetchLegacy(base) {
  const data = await fetchJSON(`${base}/flussonic/api/media`);
  // Legacy returns an object where keys are stream names
  if (Array.isArray(data)) return data.map(normalizeLegacy);
  return Object.entries(data).map(([name, info]) => normalizeLegacy({ name, ...info }));
}

function normalizeV3(s) {
  const stats = s.stats || s.source_stats || {};
  return {
    name: s.name || s.id,
    title: s.title || s.name || s.id,
    input: Array.isArray(s.inputs) ? (s.inputs[0]?.url || '') : (s.input || ''),
    alive: s.alive !== false && s.status !== 'stopped',
    bitrate: stats.bitrate ? `${Math.round(stats.bitrate / 1000)} kbps` : null,
    resolution: stats.video_width && stats.video_height ? `${stats.video_width}x${stats.video_height}` : null,
    raw: s,
  };
}

function normalizeLegacy(s) {
  const stats = s.stats || {};
  return {
    name: s.name,
    title: s.title || s.name,
    input: s.input || (Array.isArray(s.inputs) ? s.inputs[0] : ''),
    alive: s.alive !== false,
    bitrate: stats.bitrate ? `${Math.round(stats.bitrate / 1000)} kbps` : null,
    resolution: stats.width && stats.height ? `${stats.width}x${stats.height}` : null,
    raw: s,
  };
}

/**
 * Test connection – returns { ok, message, streamCount }
 */
async function testConnection() {
  try {
    const streams = await fetchStreams();
    return { ok: true, message: `Connected. Found ${streams.length} stream(s).`, streamCount: streams.length };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/**
 * Build the output URL for a stream to use in Ministra cmd field.
 */
function buildOutputUrl(streamName) {
  const base = baseUrl();
  // Default to MPEG-TS, Ministra expects: ffmpeg http://host:port/stream_name/mpegts
  return `${base}/${streamName}/mpegts`;
}

module.exports = { fetchStreams, testConnection, buildOutputUrl, baseUrl };
