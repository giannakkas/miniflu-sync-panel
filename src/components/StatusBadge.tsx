import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SyncStatus, Protocol, LogResult } from "@/lib/mock-data";

const statusConfig: Record<SyncStatus, { label: string; className: string }> = {
  synced: { label: "Synced", className: "status-synced" },
  not_synced: { label: "Not Synced", className: "status-not-synced" },
  failed: { label: "Failed", className: "status-failed" },
  updated: { label: "Updated", className: "status-updated" },
  already_exists: { label: "Already Exists", className: "status-exists" },
  pending: { label: "Pending", className: "status-pending" },
};

export function StatusBadge({ status }: { status: SyncStatus }) {
  const config = statusConfig[status];
  return <Badge variant="outline" className={cn("font-medium text-xs border-0", config.className)}>{config.label}</Badge>;
}

const protocolConfig: Record<Protocol, string> = {
  "MPEG-TS": "protocol-mpegts",
  HLS: "protocol-hls",
  DASH: "protocol-dash",
};

export function ProtocolBadge({ protocol }: { protocol: Protocol }) {
  return <Badge className={cn("font-medium text-xs", protocolConfig[protocol])}>{protocol}</Badge>;
}

const logResultConfig: Record<LogResult, { label: string; className: string }> = {
  success: { label: "Success", className: "status-synced" },
  failed: { label: "Failed", className: "status-failed" },
  updated: { label: "Updated", className: "status-updated" },
  skipped: { label: "Skipped", className: "status-not-synced" },
};

export function LogResultBadge({ result }: { result: LogResult }) {
  const config = logResultConfig[result];
  return <Badge className={cn("font-medium text-xs", config.className)}>{config.label}</Badge>;
}
