import { useState, useMemo } from "react";
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
import { mockStreams, type Stream } from "@/lib/mock-data";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  RefreshCw, Search, Send, Eye, Upload,
  CheckCircle, XCircle, AlertTriangle, List, Loader2, GripVertical,
} from "lucide-react";

function SortableRow({
  stream,
  selected,
  syncing,
  onToggleSelect,
  onView,
  onSend,
}: {
  stream: Stream;
  selected: boolean;
  syncing: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onSend: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stream.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${
        selected ? "bg-primary/5" : ""
      } ${isDragging ? "bg-muted shadow-lg" : ""}`}
    >
      <td className="p-3 w-10">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="p-3 text-center text-xs font-mono text-muted-foreground font-semibold w-14">
        {stream.sortOrder}
      </td>
      <td className="p-3 w-10">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
      </td>
      <td className="p-3 font-mono text-foreground font-medium">{stream.streamKey}</td>
      <td className="p-3 font-medium text-foreground">{stream.title}</td>
      <td className="p-3 hidden xl:table-cell">
        <span className="font-mono text-xs text-muted-foreground truncate block max-w-[280px]" title={stream.outputUrl}>
          {stream.outputUrl}
        </span>
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSend} disabled={syncing}>
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Upload className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

const StreamsPage = () => {
  const [streams, setStreams] = useState<Stream[]>(() =>
    [...mockStreams].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [drawerStream, setDrawerStream] = useState<Stream | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmSingle, setConfirmSingle] = useState<Stream | null>(null);

  const isFiltering = search !== "" || statusFilter !== "all";

  const filtered = useMemo(() =>
    streams.filter(s => {
      const matchSearch = !search ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.streamKey.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    }),
    [streams, search, statusFilter]
  );

  const {
    paginatedItems,
    currentPage,
    pageSize,
    totalItems,
    setCurrentPage,
    handlePageSizeChange,
  } = usePagination(filtered, 10);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setStreams(prev => {
      const oldIndex = prev.findIndex(s => s.id === active.id);
      const newIndex = prev.findIndex(s => s.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      return reordered.map((s, i) => ({ ...s, sortOrder: i + 1 }));
    });

    toast.success("Channel order updated");
  };

  const total = streams.length;
  const synced = streams.filter(s => ["synced", "updated"].includes(s.status)).length;
  const notSynced = streams.filter(s => s.status === "not_synced").length;
  const failed = streams.filter(s => s.status === "failed").length;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedSet);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedSet(next);
  };

  const selectAll = () => setSelectedSet(new Set(filtered.map(s => s.id)));
  const deselectAll = () => setSelectedSet(new Set());

  const streamsToConfirm = confirmSingle
    ? [confirmSingle]
    : streams.filter(s => selectedSet.has(s.id));

  const handleSendSelectedClick = () => {
    setConfirmSingle(null);
    setConfirmOpen(true);
  };

  const handleSendOneClick = (stream: Stream) => {
    setConfirmSingle(stream);
    setConfirmOpen(true);
  };

  const handleConfirmSend = async () => {
    const ids = streamsToConfirm.map(s => s.id);
    setConfirmLoading(true);
    setSyncing(new Set(ids));
    await new Promise(r => setTimeout(r, 1500));
    setSyncing(new Set());
    setConfirmLoading(false);
    setConfirmOpen(false);
    toast.success(`${ids.length} stream(s) sent to Ministra`, { description: "Channel names created from stream titles" });
    if (!confirmSingle) setSelectedSet(new Set());
    setConfirmSingle(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setRefreshing(false);
    toast.success("Streams refreshed from Flussonic");
  };

  const summaryCards = [
    { label: "Total Streams", value: total, icon: List, color: "text-primary" },
    { label: "Synced", value: synced, icon: CheckCircle, color: "text-[hsl(var(--status-synced))]" },
    { label: "Not Synced", value: notSynced, icon: AlertTriangle, color: "text-[hsl(var(--status-updated))]" },
    { label: "Failed", value: failed, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-full animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Streams</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Flussonic Output Streams · Last sync: 2026-03-12 08:30</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
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

        {/* Toolbar */}
        <Card className="p-4 mb-4 bg-card border border-border">
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search streams..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-9 h-9 w-64"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="not_synced">Not Synced</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                  <SelectItem value="already_exists">Already Exists</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
              <Button
                size="sm"
                onClick={handleSendSelectedClick}
                disabled={selectedSet.size === 0}
                className="font-semibold"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Selected to Ministra ({selectedSet.size})
              </Button>
            </div>
          </div>
          {isFiltering && (
            <p className="text-xs text-muted-foreground mt-2">
              ⚠ Drag-and-drop sorting is disabled while filters are active. Clear filters to reorder.
            </p>
          )}
        </Card>

        {/* Table */}
        <Card className="bg-card border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 w-10"></th>
                    <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-14">#</th>
                    <th className="text-left p-3 w-10">
                      <Checkbox
                        checked={filtered.length > 0 && filtered.every(s => selectedSet.has(s.id))}
                        onCheckedChange={(c) => c ? selectAll() : deselectAll()}
                      />
                    </th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Stream Key</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Title</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">Output URL</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Ministra Match</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <SortableContext items={paginatedItems.map(s => s.id)} strategy={verticalListSortingStrategy} disabled={isFiltering}>
                  <tbody>
                    {paginatedItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-muted-foreground">
                          <List className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p>No streams found</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map(stream => (
                        <SortableRow
                          key={stream.id}
                          stream={stream}
                          selected={selectedSet.has(stream.id)}
                          syncing={syncing.has(stream.id)}
                          onToggleSelect={() => toggleSelect(stream.id)}
                          onView={() => setDrawerStream(stream)}
                          onSend={() => handleSendOneClick(stream)}
                        />
                      ))
                    )}
                  </tbody>
                </SortableContext>
              </table>
            </DndContext>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </Card>
      </div>

      <StreamDetailDrawer stream={drawerStream} onClose={() => setDrawerStream(null)} />
      <SyncConfirmDialog
        open={confirmOpen}
        streams={streamsToConfirm}
        onConfirm={handleConfirmSend}
        onCancel={() => { setConfirmOpen(false); setConfirmSingle(null); }}
        loading={confirmLoading}
      />
    </DashboardLayout>
  );
};

export default StreamsPage;
