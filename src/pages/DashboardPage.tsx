import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { mockStreams, mockLogs } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { List, CheckCircle, XCircle, AlertTriangle, Activity, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DashboardPage = () => {
  const navigate = useNavigate();
  const total = mockStreams.length;
  const synced = mockStreams.filter(s => s.status === "synced" || s.status === "updated").length;
  const notSynced = mockStreams.filter(s => s.status === "not_synced").length;
  const failed = mockStreams.filter(s => s.status === "failed").length;

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

        {/* Summary Cards */}
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

        {/* Two column layout */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card className="p-5 bg-card border border-border">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Recent Activity</h2>
            </div>
            <div className="space-y-3">
              {mockLogs.slice(0, 5).map(log => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{log.title}</p>
                    <p className="text-xs text-muted-foreground">{log.action}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={log.result === "success" ? "synced" : log.result === "failed" ? "failed" : log.result === "updated" ? "updated" : "not_synced"} />
                    <span className="text-xs text-muted-foreground hidden sm:block">{log.timestamp.split(" ")[1]}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Status */}
          <Card className="p-5 bg-card border border-border">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">System Status</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Flussonic Connection</span>
                <span className="text-sm font-medium text-muted-foreground">● Not Configured</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Ministra API</span>
                <span className="text-sm font-medium text-muted-foreground">● Not Configured</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Last Full Sync</span>
                <span className="text-sm text-muted-foreground">Never</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Flussonic Host</span>
                <span className="text-sm text-muted-foreground font-mono">—</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Ministra API</span>
                <span className="text-sm text-muted-foreground font-mono">—</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
