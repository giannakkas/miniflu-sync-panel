#!/usr/bin/env node
/**
 * Bulk update streaming links for channels 4-100 in Ministra
 * 
 * Primary (priority 0): http://172.18.181.65:8000/play/TV{N}?ts
 * Secondary (priority 1): http://172.18.181.12:8080/TV{N}/mpegts
 * 
 * Usage: node bulk-links.js
 * Run from /opt/miniflu-sync-panel/backend/
 */

const path = require('path');
const mysql = require(path.join(__dirname, 'backend', 'node_modules', 'mysql2', 'promise'));

const DB_CONFIG = {
  host: '172.18.181.13',
  port: 3306,
  user: 'test',
  password: '1234',
  database: 'stalker_db',
  connectTimeout: 10000,
};

const FROM_CH = 4;
const TO_CH = 103;
const PRIMARY_TEMPLATE = 'http://172.18.181.65:8000/play/TV{N}?ts';
const SECONDARY_TEMPLATE = 'http://172.18.181.12:8080/TV{N}/mpegts';

async function main() {
  console.log(`Connecting to Ministra MySQL at ${DB_CONFIG.host}...`);
  const conn = await mysql.createConnection(DB_CONFIG);

  // Get all channels in range
  const [channels] = await conn.query(
    'SELECT id, number, name FROM itv WHERE number >= ? AND number <= ? ORDER BY number ASC',
    [FROM_CH, TO_CH]
  );

  console.log(`Found ${channels.length} channels in range ${FROM_CH}-${TO_CH}\n`);

  let updated = 0;
  let errors = 0;

  for (const ch of channels) {
    const N = ch.number;
    const primaryUrl = PRIMARY_TEMPLATE.replace(/{N}/g, N);
    const secondaryUrl = SECONDARY_TEMPLATE.replace(/{N}/g, N);

    try {
      // Delete existing links
      await conn.query('DELETE FROM ch_links WHERE ch_id = ?', [ch.id]);

      // Insert primary (priority 0)
      await conn.query(
        `INSERT INTO ch_links (ch_id, priority, url, status, use_http_tmp_link, wowza_tmp_link,
         user_agent_filter, monitoring_url, use_load_balancing, changed)
         VALUES (?, 0, ?, 1, 0, 0, '', '', 0, NOW())`,
        [ch.id, primaryUrl]
      );

      // Insert secondary (priority 1)
      await conn.query(
        `INSERT INTO ch_links (ch_id, priority, url, status, use_http_tmp_link, wowza_tmp_link,
         user_agent_filter, monitoring_url, use_load_balancing, changed)
         VALUES (?, 1, ?, 1, 0, 0, '', '', 0, NOW())`,
        [ch.id, secondaryUrl]
      );

      // Update itv.cmd to match primary
      await conn.query('UPDATE itv SET cmd = ?, modified = NOW() WHERE id = ?', [primaryUrl, ch.id]);

      updated++;
      console.log(`✓ Ch #${N} ${ch.name.padEnd(30)} → ${primaryUrl}`);
      console.log(`  ${' '.repeat(N.toString().length + ch.name.length + 6)}  + ${secondaryUrl}`);
    } catch (err) {
      errors++;
      console.error(`✗ Ch #${N} ${ch.name}: ${err.message}`);
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Done: ${updated} updated, ${errors} errors`);

  await conn.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
