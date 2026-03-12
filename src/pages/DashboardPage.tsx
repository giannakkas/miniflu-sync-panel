import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { List, CheckCircle, XCircle, AlertTriangle, Activity, Clock, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DashboardPage = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getDashboard().catch(() => null),
      api.getLogs(5, 0).catch(() => ({ logs: [] })),
    ]).then(([dash, logData]) => {
      setDashboard(dash);
      setLogs(logData?.logs || []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const total = dashboard?.total || 0;
  const synced = dashboard?.synced || 0;
  const notSynced = dashboard?.notSynced || 0;
  const failed = dashboard?.failed || 0;

  const summaryCards = [
    { label: "Total Streams", value: total, icon: List, color: "text-primary" },
    { label: "Synced", value: synced, icon: CheckCircle, color: "text-[hsl(var(--status-synced))]" },
    { label: "Not Synced", value: notSynced, icon: AlertTriangle, color: "text-[hsl(var(--status-updated))]" },
    { label: "Failed", value: failed, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your IPTV stream sync operations</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {summaryCards.map(card => (
            <Card key={card.label} className="p-5 bg-card border border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/streams")}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{card.value}</p>
                </div>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5 bg-card border border-border">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Recent Activity</h2>
            </div>
            <div className="space-y-3">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity yet</p>
              ) : (
                logs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{log.title}</p>
                      <p className="text-xs text-muted-foreground">{log.action}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={log.result === "success" ? "synced" : log.result === "failed" ? "failed" : log.result === "updated" ? "updated" : "not_synced"} />
                      <span className="text-xs text-muted-foreground hidden sm:block">{log.timestamp?.split(" ")[1] || ""}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5 bg-card border border-border">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">System Status</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Flussonic Connection</span>
                <span className={`text-sm font-medium ${dashboard?.flussonicConfigured ? "text-[hsl(var(--status-synced))]" : "text-muted-foreground"}`}>
                  ● {dashboard?.flussonicConfigured ? "Configured" : "Not Configured"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Ministra</span>
                <span className={`text-sm font-medium ${dashboard?.ministraConfigured ? "text-[hsl(var(--status-synced))]" : "text-muted-foreground"}`}>
                  ● {dashboard?.ministraConfigured ? "Configured" : "Not Configured"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Last Full Sync</span>
                <span className="text-sm text-foreground">{dashboard?.lastSyncTime ? new Date(dashboard.lastSyncTime).toLocaleString() : "Never"}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Auto-Sync Interval</span>
                <span className="text-sm text-foreground">{dashboard?.syncInterval || 5} minutes</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Flussonic Host</span>
                <span className="text-sm text-foreground font-mono">{dashboard?.flussonicHost || "—"}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Ministra Host</span>
                <span className="text-sm text-foreground font-mono text-xs">{dashboard?.ministraHost || "—"}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
