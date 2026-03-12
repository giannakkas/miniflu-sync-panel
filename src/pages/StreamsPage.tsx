import { useState, useMemo, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { StreamDetailDrawer } from "@/components/StreamDetailDrawer";
import { SyncConfirmDialog } from "@/components/SyncConfirmDialog";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { api } from "@/lib/api";
import type { Stream } from "@/lib/mock-data";
import { toast } from "sonner";
import {
  RefreshCw, Search, Send, Eye, CheckCircle, XCircle, AlertTriangle, List, Loader2,
} from "lucide-react";

const StreamsPage = () => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [drawerStream, setDrawerStream] = useState<Stream | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmSingle, setConfirmSingle] = useState<Stream | null>(null);

  const loadStreams = useCallback(async () => {
    try {
      const data = await api.getStreams();
      setStreams(data.map((s: any, i: number) => ({
        id: s.stream_key,
        streamKey: s.stream_key,
        title: s.title,
        outputUrl: s.output_url,
        protocol: s.protocol || "MPEG-TS",
        status: s.status || "not_synced",
        ministraMatch: !!s.ministra_channel_name,
        ministraChannelName: s.ministra_channel_name,
        bitrate: s.bitrate,
        resolution: s.resolution,
        lastSynced: s.last_synced,
        sortOrder: s.sort_order || (i + 1),
      })));
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStreams(); }, [loadStreams]);

  const filtered = useMemo(() =>
    streams.filter(s => {
      const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.streamKey.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    }),
    [streams, search, statusFilter]
  );

  const { paginatedItems, currentPage, pageSize, totalItems, setCurrentPage, handlePageSizeChange } = usePagination(filtered, 20);

  const total = streams.length;
  const synced = streams.filter(s => ["synced", "updated", "already_exists"].includes(s.status)).length;
  const notSynced = streams.filter(s => s.status === "not_synced").length;
  const failed = streams.filter(s => s.status === "failed").length;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedSet);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedSet(next);
  };
  const selectAll = () => setSelectedSet(new Set(filtered.map(s => s.id)));
  const deselectAll = () => setSelectedSet(new Set());

  const streamsToConfirm = confirmSingle ? [confirmSingle] : streams.filter(s => selectedSet.has(s.id));

  const handleSendSelectedClick = () => { setConfirmSingle(null); setConfirmOpen(true); };
  const handleSendOneClick = (stream: Stream) => { setConfirmSingle(stream); setConfirmOpen(true); };

  const handleConfirmSend = async () => {
    const keys = streamsToConfirm.map(s => s.streamKey);
    setConfirmLoading(true);
    setSyncing(new Set(keys));
    try {
      const result = await api.syncStreams(keys);
      toast.success(`${result.total} stream(s) processed`, {
        description: `${result.success || 0} created, ${result.updated || 0} updated, ${result.failed || 0} failed`,
      });
      await loadStreams();
    } catch (err: any) {
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(new Set());
      setConfirmLoading(false);
      setConfirmOpen(false);
      if (!confirmSingle) setSelectedSet(new Set());
      setConfirmSingle(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await api.refreshStreams();
      toast.success(result.message || "Streams refreshed");
      await loadStreams();
    } catch (err: any) {
      toast.error(`Refresh failed: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const summaryCards = [
    { label: "Total Streams", value: total, icon: List, color: "text-primary" },
    { label: "Synced", value: synced, icon: CheckCircle, color: "text-[hsl(var(--status-synced))]" },
    { label: "Not Synced", value: notSynced, icon: AlertTriangle, color: "text-[hsl(var(--status-updated))]" },
    { label: "Failed", value: failed, icon: XCircle, color: "text-destructive" },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-full animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Streams</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Flussonic Output Streams</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh from Flussonic
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {summaryCards.map(card => (
            <Card key={card.label} className="p-4 bg-card border border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{card.value}</p>
                </div>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-4 mb-4 bg-card border border-border">
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search streams..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-9 h-9 w-64" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Filter status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="not_synced">Not Synced</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
              <Button size="sm" onClick={handleSendSelectedClick} disabled={selectedSet.size === 0} className="font-semibold">
                <Send className="w-4 h-4 mr-2" /> Send Selected to Ministra ({selectedSet.size})
              </Button>
            </div>
          </div>
        </Card>

        <Card className="bg-card border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 w-10">
                    <Checkbox checked={filtered.length > 0 && filtered.every(s => selectedSet.has(s.id))} onCheckedChange={(c) => c ? selectAll() : deselectAll()} />
                  </th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Stream Key</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Title</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">Output URL</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Ministra Match</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <List className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>{streams.length === 0 ? "No streams yet. Click 'Refresh from Flussonic' to fetch streams." : "No streams match your filter"}</p>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map(stream => (
                    <tr key={stream.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${selectedSet.has(stream.id) ? "bg-primary/5" : ""}`}>
                      <td className="p-3 w-10"><Checkbox checked={selectedSet.has(stream.id)} onCheckedChange={() => toggleSelect(stream.id)} /></td>
                      <td className="p-3 font-mono text-foreground font-medium">{stream.streamKey}</td>
                      <td className="p-3 font-medium text-foreground">{stream.title}</td>
                      <td className="p-3 hidden xl:table-cell">
                        <span className="font-mono text-xs text-muted-foreground truncate block max-w-[280px]" title={stream.outputUrl}>{stream.outputUrl}</span>
                      </td>
                      <td className="p-3"><StatusBadge status={stream.status} /></td>
                      <td className="p-3 hidden lg:table-cell">
                        {stream.ministraMatch ? (
                          <span className="text-xs text-[hsl(var(--status-synced))] font-medium">✓ {stream.ministraChannelName}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDrawerStream(stream)}><Eye className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSendOneClick(stream)} disabled={syncing.has(stream.id)}>
                            {syncing.has(stream.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination currentPage={currentPage} totalItems={totalItems} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={handlePageSizeChange} />
        </Card>
      </div>
      <StreamDetailDrawer stream={drawerStream} onClose={() => setDrawerStream(null)} />
      <SyncConfirmDialog open={confirmOpen} streams={streamsToConfirm} onConfirm={handleConfirmSend} onCancel={() => { setConfirmOpen(false); setConfirmSingle(null); }} loading={confirmLoading} />
    </DashboardLayout>
  );
};

export default StreamsPage;
