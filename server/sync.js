import { FlussonicClient } from './flussonic.js';
import { MinistraClient } from './ministra.js';
import {
  getSetting, getAllSettings,
  upsertStreamState, updateStreamSyncStatus, getAllStreamStates, getStreamState,
  addLog,
} from './db.js';

let syncInProgress = false;
let lastSyncTime = null;
let lastSyncResult = null;

export function getSyncStatus() {
  return {
    inProgress: syncInProgress,
    lastSyncTime,
    lastSyncResult,
  };
}

function createFlussonicClient() {
  const host = getSetting('flussonic_host');
  const port = getSetting('flussonic_port', 80);
  const user = getSetting('flussonic_user');
  const pass = getSetting('flussonic_pass');
  if (!host) return null;
  return new FlussonicClient(host, port, user, pass);
}

function createMinistraClient() {
  const settings = getAllSettings();
  return new MinistraClient({
    apiUrl: settings.ministra_api_url || null,
    apiUser: settings.ministra_api_user || null,
    apiPass: settings.ministra_api_pass || null,
    dbHost: settings.ministra_db_host || null,
    dbPort: settings.ministra_db_port || 3306,
    dbUser: settings.ministra_db_user || null,
    dbPass: settings.ministra_db_pass || null,
    dbName: settings.ministra_db_name || 'stalker_db',
  });
}

// Pull streams from Flussonic and update local state
export async function refreshStreams() {
  const client = createFlussonicClient();
  if (!client) throw new Error('Flussonic not configured');

  const streams = await client.getStreams();

  // Get existing state to preserve sync statuses
  const existingStates = {};
  for (const s of getAllStreamStates()) {
    existingStates[s.stream_key] = s;
  }

  // Update stream states
  for (let i = 0; i < streams.length; i++) {
    const stream = streams[i];
    const existing = existingStates[stream.streamKey];

    upsertStreamState(stream.streamKey, {
      title: stream.title,
      output_url: stream.outputUrl,
      protocol: stream.protocol,
      status: existing?.status || 'not_synced',
      bitrate: stream.bitrate,
      resolution: stream.resolution,
      sort_order: existing?.sort_order || (i + 1),
    });
  }

  return streams.length;
}

// Send specific streams to Ministra
export async function syncStreamsToMinistra(streamKeys = null) {
  if (syncInProgress) throw new Error('Sync already in progress');
  syncInProgress = true;

  const ministra = createMinistraClient();
  const results = [];

  try {
    const allStates = getAllStreamStates();
    const toSync = streamKeys
      ? allStates.filter(s => streamKeys.includes(s.stream_key))
      : allStates;

    for (const stream of toSync) {
      try {
        const result = await ministra.upsertChannel(
          stream.stream_key,
          stream.title,
          stream.output_url
        );

        let status;
        if (result.action === 'created') status = 'synced';
        else if (result.action === 'updated') status = 'updated';
        else status = 'already_exists';

        updateStreamSyncStatus(stream.stream_key, status, result.channelId, result.channelName);

        const logResult = result.action === 'already_exists' ? 'skipped' : 
                          result.action === 'updated' ? 'updated' : 'success';
        addLog(
          stream.stream_key, stream.title,
          result.action === 'created' ? 'Send to Ministra' : 
          result.action === 'updated' ? 'Update in Ministra' : 'Check in Ministra',
          logResult,
          `Channel '${result.channelName}' ${result.action} in Ministra (ID: ${result.channelId})`
        );

        results.push({ streamKey: stream.stream_key, ...result });
      } catch (err) {
        updateStreamSyncStatus(stream.stream_key, 'failed', null, null);
        addLog(stream.stream_key, stream.title, 'Send to Ministra', 'failed', err.message);
        results.push({ streamKey: stream.stream_key, action: 'failed', error: err.message });
      }
    }

    lastSyncTime = new Date().toISOString();
    lastSyncResult = {
      total: results.length,
      success: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      skipped: results.filter(r => r.action === 'already_exists').length,
      failed: results.filter(r => r.action === 'failed').length,
    };

    return lastSyncResult;
  } finally {
    syncInProgress = false;
    await ministra.close();
  }
}

// Full sync: refresh from Flussonic then push all to Ministra
export async function fullSync() {
  await refreshStreams();
  return await syncStreamsToMinistra();
}

// Test connections
export async function testFlussonic() {
  const client = createFlussonicClient();
  if (!client) return { ok: false, message: 'Flussonic not configured' };
  return await client.testConnection();
}

export async function testMinistra() {
  const ministra = createMinistraClient();
  try {
    return await ministra.testConnection();
  } finally {
    await ministra.close();
  }
}

// Get Ministra channels
export async function getMinistraChannels() {
  const ministra = createMinistraClient();
  try {
    return await ministra.getChannels();
  } finally {
    await ministra.close();
  }
}
