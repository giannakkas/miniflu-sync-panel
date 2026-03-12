# MiniFlu Sync Panel

Sync IPTV streams from **Flussonic Media Server** to **Ministra (Stalker Portal)** — automatically.

## Architecture

```
┌──────────────┐     REST/API     ┌──────────────┐      MySQL       ┌──────────────┐
│   Flussonic  │ ───────────────→ │   MiniFlu    │ ───────────────→ │   Ministra   │
│ Media Server │  fetch streams   │   Backend    │  create/update   │ Stalker Portal│
└──────────────┘                  │  (Node.js)   │  channels (itv)  └──────────────┘
                                  └──────┬───────┘
                                         │
                                  ┌──────┴───────┐
                                  │   Frontend   │
                                  │ React + Vite │
                                  └──────────────┘
```

## Features

- **Stream Discovery** — Pulls all streams from Flussonic (v3 + legacy API auto-detect)
- **One-Click Sync** — Push selected or all streams to Ministra as IPTV channels
- **Auto-Sync** — Configurable cron interval (default: every 5 minutes)
- **Drag & Drop Ordering** — Reorder channels, order is preserved in Ministra
- **Connection Testing** — Verify Flussonic and Ministra connectivity from the UI
- **Sync Logs** — Full history of every sync operation with success/fail details
- **Channels View** — See what's currently in Ministra from the panel

## Quick Start (Server)

### Prerequisites

- **Node.js 20+**
- **Nginx** (reverse proxy)
- **PM2** (`npm install -g pm2`)
- Network access to Flussonic and Ministra MySQL

### Install

```bash
cd /opt
git clone https://github.com/giannakkas/miniflu-sync-panel.git
cd miniflu-sync-panel

# Build frontend
npm install
npm run build

# Install backend
cd backend
npm install

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # follow the output to enable on boot
```

### Nginx

```bash
sudo cp nginx/miniflu.conf /etc/nginx/sites-available/miniflu
sudo ln -sf /etc/nginx/sites-available/miniflu /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

### Access

Open `http://your-server-ip` — login with `admin` / `admin`, then go to **Settings** to configure:

1. **Flussonic** — host, port, credentials
2. **Ministra MySQL** — host, port, user, pass, database name
3. **Auto-Sync** — interval in minutes (0 = disabled)
4. **Change admin password**

### Update

```bash
cd /opt/miniflu-sync-panel
git pull
npm install && npm run build
cd backend && npm install
pm2 restart miniflu
```

## Development

```bash
# Terminal 1: Frontend dev server
npm run dev

# Terminal 2: Backend
cd backend
node --watch server.js
```

Frontend dev server runs on `:8080`, backend on `:3000`.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, dnd-kit
- **Backend**: Node.js, Express, better-sqlite3 (local DB), mysql2 (Ministra), node-cron
- **Deployment**: PM2 + Nginx reverse proxy

## Data

- Settings, stream cache, and sync logs are stored in `backend/data/miniflu.db` (SQLite)
- Channel data lives in Ministra's MySQL `itv` table — MiniFlu only writes there, never deletes
