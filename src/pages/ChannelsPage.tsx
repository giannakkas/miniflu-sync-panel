import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { mockChannels } from "@/lib/mock-data";
import { Search, MonitorPlay, RefreshCw, Trash2 } from "lucide-react";

const ChannelsPage = () => {
  const [search, setSearch] = useState("");

  const filtered = mockChannels.filter(ch =>
    !search || ch.channelName.toLowerCase().includes(search.toLowerCase()) ||
    ch.sourceStream.toLowerCase().includes(search.toLowerCase())
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

        <Card className="bg-card border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Channel Name</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Source Stream</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Output URL</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Last Updated</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      <MonitorPlay className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No channels found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(ch => (
                    <tr key={ch.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">{ch.channelName}</td>
                      <td className="p-3 font-mono text-foreground">{ch.sourceStream}</td>
                      <td className="p-3 hidden lg:table-cell">
                        <span className="font-mono text-xs text-muted-foreground truncate block max-w-[280px]" title={ch.outputUrl}>
                          {ch.outputUrl}
                        </span>
                      </td>
                      <td className="p-3"><StatusBadge status={ch.status} /></td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{ch.lastUpdated}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ChannelsPage;
