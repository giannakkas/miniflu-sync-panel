import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import apiRoutes from './routes.js';
import { getSetting } from './db.js';
import { fullSync } from './sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// API routes
app.use('/api', apiRoutes);

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Auto-sync scheduler
let cronJob = null;

function setupCronJob() {
  if (cronJob) cronJob.stop();

  const intervalMinutes = getSetting('sync_interval_minutes', 5);

  if (intervalMinutes <= 0) {
    console.log('[Sync] Auto-sync disabled');
    return;
  }

  // node-cron expression for every N minutes
  const cronExpr = `*/${intervalMinutes} * * * *`;

  cronJob = cron.schedule(cronExpr, async () => {
    console.log(`[Sync] Auto-sync triggered (every ${intervalMinutes} min)`);
    try {
      const result = await fullSync();
      console.log(`[Sync] Complete: ${result.total} streams, ${result.success} created, ${result.updated} updated, ${result.failed} failed`);
    } catch (err) {
      console.error('[Sync] Auto-sync failed:', err.message);
    }
  });

  console.log(`[Sync] Auto-sync scheduled every ${intervalMinutes} minutes`);
}

// Start
app.listen(PORT, () => {
  console.log(`MiniFlu Sync Panel running on http://0.0.0.0:${PORT}`);
  setupCronJob();
});

// Re-check cron interval every 60s in case settings changed
setInterval(() => {
  const current = getSetting('sync_interval_minutes', 5);
  if (cronJob?._scheduler?.timeMatcher?.pattern !== `*/${current} * * * *`) {
    setupCronJob();
  }
}, 60000);
