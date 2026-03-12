import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { Search, MonitorPlay, Loader2 } from "lucide-react";

const ChannelsPage = () => {
  const [search, setSearch] = useState("");
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getChannels()
      .then(setChannels)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = channels.filter(ch =>
    !search || ch.name?.toLowerCase().includes(search.toLowerCase()) ||
    ch.sourceStream?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-full animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Synced Channels</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Channels currently in Ministra from Flussonic</p>
          </div>
        </div>

        <Card className="p-4 mb-4 bg-card border border-border">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search channels..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <Card className="p-8 text-center text-muted-foreground">
            <MonitorPlay className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>Could not load channels: {error}</p>
            <p className="text-xs mt-1">Make sure Ministra connection is configured in Settings</p>
          </Card>
        ) : (
          <Card className="bg-card border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Channel Name</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Number</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Source Stream</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">CMD / URL</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-muted-foreground">
                        <MonitorPlay className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No channels found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map(ch => (
                      <tr key={ch.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{ch.name}</td>
                        <td className="p-3 font-mono text-muted-foreground">{ch.number}</td>
                        <td className="p-3 font-mono text-foreground">{ch.sourceStream || "—"}</td>
                        <td className="p-3 hidden lg:table-cell">
                          <span className="font-mono text-xs text-muted-foreground truncate block max-w-[280px]" title={ch.cmd}>{ch.cmd}</span>
                        </td>
                        <td className="p-3"><StatusBadge status={ch.status || "synced"} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ChannelsPage;
