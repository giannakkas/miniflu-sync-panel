import mysql from 'mysql2/promise';
import axios from 'axios';

export class MinistraClient {
  constructor(config) {
    // REST API config
    this.apiUrl = config.apiUrl; // e.g. http://host:88/stalker_portal/api
    this.apiUser = config.apiUser;
    this.apiPass = config.apiPass;

    // MySQL config (for channel creation - REST API v1 only supports GET for channels)
    this.dbHost = config.dbHost;
    this.dbPort = config.dbPort || 3306;
    this.dbUser = config.dbUser;
    this.dbPass = config.dbPass;
    this.dbName = config.dbName || 'stalker_db';

    this.pool = null;
  }

  async _getPool() {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: this.dbHost,
        port: this.dbPort,
        user: this.dbUser,
        password: this.dbPass,
        database: this.dbName,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        connectTimeout: 10000,
      });
    }
    return this.pool;
  }

  async testConnection() {
    const results = { api: null, db: null };

    // Test REST API
    if (this.apiUrl) {
      try {
        const authConfig = {};
        if (this.apiUser && this.apiPass) {
          authConfig.auth = { username: this.apiUser, password: this.apiPass };
        }
        const res = await axios.get(`${this.apiUrl}/itv`, {
          ...authConfig,
          timeout: 10000,
        });
        if (res.data && res.data.status === 'OK') {
          results.api = { ok: true, message: `API connected, ${res.data.results?.length || 0} channels found` };
        } else {
          results.api = { ok: false, message: `API returned: ${res.data?.error || 'unexpected response'}` };
        }
      } catch (err) {
        results.api = { ok: false, message: `API error: ${err.message}` };
      }
    }

    // Test MySQL
    if (this.dbHost) {
      try {
        const pool = await this._getPool();
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM itv');
        results.db = { ok: true, message: `DB connected, ${rows[0].count} channels in itv table` };
      } catch (err) {
        results.db = { ok: false, message: `DB error: ${err.message}` };
      }
    }

    const ok = (results.api?.ok || false) || (results.db?.ok || false);
    return { ok, ...results };
  }

  // Get all channels from Ministra
  async getChannels() {
    // Try REST API first
    if (this.apiUrl) {
      try {
        const authConfig = {};
        if (this.apiUser && this.apiPass) {
          authConfig.auth = { username: this.apiUser, password: this.apiPass };
        }
        const res = await axios.get(`${this.apiUrl}/itv`, { ...authConfig, timeout: 15000 });
        if (res.data?.status === 'OK') {
          return (res.data.results || []).map(ch => ({
            id: ch.id,
            name: ch.name,
            number: ch.number,
            cmd: ch.cmd,
          }));
        }
      } catch (err) {
        // Fall through to MySQL
      }
    }

    // Fallback to MySQL
    if (this.dbHost) {
      const pool = await this._getPool();
      const [rows] = await pool.query(
        'SELECT id, name, number, cmd FROM itv WHERE status = 1 ORDER BY number ASC'
      );
      return rows;
    }

    throw new Error('No Ministra connection configured');
  }

  // Create or update a channel in Ministra via MySQL
  async upsertChannel(streamKey, title, outputUrl, channelNumber = null) {
    if (!this.dbHost) {
      throw new Error('MySQL connection required for channel creation');
    }

    const pool = await this._getPool();

    // Check if channel already exists (by name or cmd matching the stream)
    const [existing] = await pool.query(
      'SELECT id, name, number, cmd FROM itv WHERE name = ? OR cmd LIKE ?',
      [title, `%${streamKey}%`]
    );

    if (existing.length > 0) {
      const ch = existing[0];
      // Update the URL if different
      const currentCmd = ch.cmd || '';
      if (!currentCmd.includes(outputUrl)) {
        await pool.query(
          'UPDATE itv SET cmd = ?, name = ? WHERE id = ?',
          [outputUrl, title, ch.id]
        );
        return { action: 'updated', channelId: ch.id, channelName: title };
      }
      return { action: 'already_exists', channelId: ch.id, channelName: ch.name };
    }

    // Determine next channel number
    if (!channelNumber) {
      const [maxRow] = await pool.query('SELECT COALESCE(MAX(number), 0) + 1 as next_num FROM itv');
      channelNumber = maxRow[0].next_num;
    }

    // Insert new channel
    const [result] = await pool.query(
      `INSERT INTO itv (name, number, cmd, status, tv_genre_id, base_ch, xmltv_id, service_id, bonus_ch, volume_correction, use_http_tmp_link, monitoring_url, enable_monitoring, enable_tv_archive, mc_cmd, allow_pvr, allow_local_pvr, allow_local_timeshift, modified, added)
       VALUES (?, ?, ?, 1, 1, 1, '', '', 0, 0, 0, '', 0, 0, '', 0, 0, 0, NOW(), NOW())`,
      [title, channelNumber, outputUrl]
    );

    return { action: 'created', channelId: result.insertId, channelName: title };
  }

  // Delete a channel from Ministra
  async deleteChannel(channelId) {
    if (!this.dbHost) throw new Error('MySQL connection required');
    const pool = await this._getPool();
    await pool.query('DELETE FROM itv WHERE id = ?', [channelId]);
    // Also clean up channel links
    await pool.query('DELETE FROM ch_links WHERE ch_id = ?', [channelId]);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
