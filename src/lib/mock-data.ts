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
  sortOrder: number;
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

export const mockStreams: Stream[] = [];

export const mockLogs: LogEntry[] = [];

export const mockChannels: SyncedChannel[] = [];
