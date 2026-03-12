export type SyncStatus = "synced" | "not_synced" | "failed" | "updated" | "already_exists" | "pending";
export type Protocol = "MPEG-TS" | "HLS" | "DASH";
export type LogResult = "success" | "failed" | "updated" | "skipped";

export interface Stream {
  id: string;
  streamKey: string;
  title: string;
  outputUrl: string;
  protocol: Protocol;
  status: SyncStatus;
  ministraMatch: boolean;
  ministraChannelName?: string;
  bitrate?: string;
  resolution?: string;
  lastSynced?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  streamKey: string;
  title: string;
  action: string;
  result: LogResult;
  details: string;
}

export interface SyncedChannel {
  id: string;
  channelName: string;
  sourceStream: string;
  outputUrl: string;
  status: SyncStatus;
  lastUpdated: string;
}

export const mockStreams: Stream[] = [
  { id: "1", streamKey: "TV1", title: "3sat", outputUrl: "http://172.18.181.12:8080/TV1/mpegts", protocol: "MPEG-TS", status: "synced", ministraMatch: true, ministraChannelName: "3sat", bitrate: "4500 kbps", resolution: "1920x1080", lastSynced: "2026-03-12 08:30" },
  { id: "2", streamKey: "TV2", title: "ZDF", outputUrl: "http://172.18.181.12:8080/TV2/mpegts", protocol: "MPEG-TS", status: "synced", ministraMatch: true, ministraChannelName: "ZDF", bitrate: "5000 kbps", resolution: "1920x1080", lastSynced: "2026-03-12 08:30" },
  { id: "3", streamKey: "TV3", title: "BBC World News", outputUrl: "http://172.18.181.12:8080/TV3/mpegts", protocol: "MPEG-TS", status: "not_synced", ministraMatch: false, bitrate: "3500 kbps", resolution: "1280x720" },
  { id: "4", streamKey: "TV4", title: "CNN International", outputUrl: "http://172.18.181.12:8080/TV4/mpegts", protocol: "MPEG-TS", status: "failed", ministraMatch: false, bitrate: "4000 kbps", resolution: "1920x1080", lastSynced: "2026-03-11 22:15" },
  { id: "5", streamKey: "TV5", title: "Eurosport", outputUrl: "http://172.18.181.12:8080/TV5/mpegts", protocol: "MPEG-TS", status: "not_synced", ministraMatch: false, bitrate: "6000 kbps", resolution: "1920x1080" },
  { id: "6", streamKey: "TV6", title: "National Geographic", outputUrl: "http://172.18.181.12:8080/TV6/mpegts", protocol: "MPEG-TS", status: "already_exists", ministraMatch: true, ministraChannelName: "National Geographic", bitrate: "4500 kbps", resolution: "1920x1080", lastSynced: "2026-03-10 14:00" },
  { id: "7", streamKey: "TV7", title: "Arte", outputUrl: "http://172.18.181.12:8080/TV7/mpegts", protocol: "MPEG-TS", status: "updated", ministraMatch: true, ministraChannelName: "Arte", bitrate: "3000 kbps", resolution: "1280x720", lastSynced: "2026-03-12 07:45" },
  { id: "8", streamKey: "TV8", title: "Al Jazeera English", outputUrl: "http://172.18.181.12:8080/TV8/mpegts", protocol: "MPEG-TS", status: "synced", ministraMatch: true, ministraChannelName: "Al Jazeera English", bitrate: "3500 kbps", resolution: "1280x720", lastSynced: "2026-03-12 08:30" },
  { id: "9", streamKey: "TV9", title: "Sky News", outputUrl: "http://172.18.181.12:8080/TV9/mpegts", protocol: "HLS", status: "not_synced", ministraMatch: false, bitrate: "4000 kbps", resolution: "1920x1080" },
  { id: "10", streamKey: "TV10", title: "France 24", outputUrl: "http://172.18.181.12:8080/TV10/mpegts", protocol: "MPEG-TS", status: "pending", ministraMatch: false, bitrate: "3000 kbps", resolution: "1280x720" },
  { id: "11", streamKey: "TV11", title: "DW News", outputUrl: "http://172.18.181.12:8080/TV11/mpegts", protocol: "MPEG-TS", status: "synced", ministraMatch: true, ministraChannelName: "DW News", bitrate: "4500 kbps", resolution: "1920x1080", lastSynced: "2026-03-12 06:00" },
  { id: "12", streamKey: "TV12", title: "Discovery Channel", outputUrl: "http://172.18.181.12:8080/TV12/mpegts", protocol: "DASH", status: "failed", ministraMatch: false, bitrate: "5500 kbps", resolution: "1920x1080", lastSynced: "2026-03-11 20:00" },
];

export const mockLogs: LogEntry[] = [
  { id: "1", timestamp: "2026-03-12 08:30:15", streamKey: "TV1", title: "3sat", action: "Send to Ministra", result: "success", details: "Channel '3sat' created successfully in Ministra" },
  { id: "2", timestamp: "2026-03-12 08:30:16", streamKey: "TV2", title: "ZDF", action: "Send to Ministra", result: "success", details: "Channel 'ZDF' created successfully in Ministra" },
  { id: "3", timestamp: "2026-03-12 08:30:17", streamKey: "TV8", title: "Al Jazeera English", action: "Send to Ministra", result: "success", details: "Channel 'Al Jazeera English' created successfully" },
  { id: "4", timestamp: "2026-03-12 07:45:00", streamKey: "TV7", title: "Arte", action: "Update in Ministra", result: "updated", details: "Channel 'Arte' URL updated in Ministra" },
  { id: "5", timestamp: "2026-03-11 22:15:30", streamKey: "TV4", title: "CNN International", action: "Send to Ministra", result: "failed", details: "API Error: Connection timeout to Ministra API" },
  { id: "6", timestamp: "2026-03-11 20:00:10", streamKey: "TV12", title: "Discovery Channel", action: "Send to Ministra", result: "failed", details: "API Error: Invalid stream format for Ministra" },
  { id: "7", timestamp: "2026-03-10 14:00:00", streamKey: "TV6", title: "National Geographic", action: "Send to Ministra", result: "skipped", details: "Channel 'National Geographic' already exists in Ministra" },
  { id: "8", timestamp: "2026-03-12 06:00:00", streamKey: "TV11", title: "DW News", action: "Send to Ministra", result: "success", details: "Channel 'DW News' created successfully in Ministra" },
];

export const mockChannels: SyncedChannel[] = [
  { id: "1", channelName: "3sat", sourceStream: "TV1", outputUrl: "http://172.18.181.12:8080/TV1/mpegts", status: "synced", lastUpdated: "2026-03-12 08:30" },
  { id: "2", channelName: "ZDF", sourceStream: "TV2", outputUrl: "http://172.18.181.12:8080/TV2/mpegts", status: "synced", lastUpdated: "2026-03-12 08:30" },
  { id: "3", channelName: "Al Jazeera English", sourceStream: "TV8", outputUrl: "http://172.18.181.12:8080/TV8/mpegts", status: "synced", lastUpdated: "2026-03-12 08:30" },
  { id: "4", channelName: "Arte", sourceStream: "TV7", outputUrl: "http://172.18.181.12:8080/TV7/mpegts", status: "updated", lastUpdated: "2026-03-12 07:45" },
  { id: "5", channelName: "National Geographic", sourceStream: "TV6", outputUrl: "http://172.18.181.12:8080/TV6/mpegts", status: "already_exists", lastUpdated: "2026-03-10 14:00" },
  { id: "6", channelName: "DW News", sourceStream: "TV11", outputUrl: "http://172.18.181.12:8080/TV11/mpegts", status: "synced", lastUpdated: "2026-03-12 06:00" },
];
