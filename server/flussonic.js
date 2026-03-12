import axios from 'axios';

export class FlussonicClient {
  constructor(host, port, username, password) {
    this.baseUrl = `http://${host}:${port}`;
    this.auth = { username, password };
  }

  async testConnection() {
    try {
      const res = await axios.get(`${this.baseUrl}/streamer/api/v3/streams`, {
        auth: this.auth,
        params: { limit: 1 },
        timeout: 10000,
      });
      return { ok: true, message: 'Connected to Flussonic' };
    } catch (err) {
      // Try legacy API path
      try {
        const res = await axios.get(`${this.baseUrl}/flussonic/api/v3/streams`, {
          auth: this.auth,
          params: { limit: 1 },
          timeout: 10000,
        });
        return { ok: true, message: 'Connected to Flussonic (legacy path)' };
      } catch (err2) {
        return {
          ok: false,
          message: `Connection failed: ${err.message}`,
        };
      }
    }
  }

  async getStreams() {
    let streams = [];
    let apiPath = '/streamer/api/v3/streams';

    try {
      streams = await this._fetchStreams(apiPath);
    } catch (err) {
      // Fallback to legacy path
      apiPath = '/flussonic/api/v3/streams';
      try {
        streams = await this._fetchStreams(apiPath);
      } catch (err2) {
        throw new Error(`Failed to fetch streams from Flussonic: ${err.message}`);
      }
    }

    return streams;
  }

  async _fetchStreams(apiPath) {
    const allStreams = [];
    let cursor = undefined;

    // Paginate through all streams
    while (true) {
      const params = { limit: 200 };
      if (cursor) params.next = cursor;

      const res = await axios.get(`${this.baseUrl}${apiPath}`, {
        auth: this.auth,
        params,
        timeout: 30000,
      });

      const data = res.data;
      const items = data.streams || data.ITEMS || [];

      if (items.length === 0) break;

      for (const stream of items) {
        allStreams.push(this._normalizeStream(stream));
      }

      cursor = data.next;
      if (!cursor) break;
    }

    return allStreams;
  }

  _normalizeStream(raw) {
    const name = raw.name || raw.id || '';
    const title = raw.title || name;
    const stats = raw.stats || {};
    const inputs = raw.inputs || raw.input || [];
    const firstInput = Array.isArray(inputs) ? inputs[0] : inputs;

    // Determine protocol from output or input URL
    let protocol = 'MPEG-TS';
    const inputUrl = typeof firstInput === 'string' ? firstInput : (firstInput?.url || '');
    if (inputUrl.includes('.m3u8') || inputUrl.includes('/hls')) protocol = 'HLS';
    else if (inputUrl.includes('/dash') || inputUrl.includes('.mpd')) protocol = 'DASH';

    // Build output URL
    const outputUrl = `${this.baseUrl}/${name}/mpegts`;

    // Extract bitrate and resolution from stats
    const bitrate = stats.input_bitrate
      ? `${Math.round(stats.input_bitrate / 1000)} kbps`
      : (stats.bitrate ? `${Math.round(stats.bitrate / 1000)} kbps` : null);

    let resolution = null;
    if (stats.video_width && stats.video_height) {
      resolution = `${stats.video_width}x${stats.video_height}`;
    } else if (raw.tracks) {
      const videoTrack = raw.tracks.find(t => t.content === 'video');
      if (videoTrack && videoTrack.width && videoTrack.height) {
        resolution = `${videoTrack.width}x${videoTrack.height}`;
      }
    }

    return {
      streamKey: name,
      title,
      outputUrl,
      protocol,
      bitrate,
      resolution,
      alive: stats.alive !== undefined ? stats.alive : (raw.alive || false),
    };
  }
}
