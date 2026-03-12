import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Search, MonitorPlay, Loader2, GripVertical, RefreshCw } from "lucide-react";

interface Channel {
  id: number;
  name: string;
  number: number;
  cmd: string;
  sourceStream: string;
  status: string;
}

function SortableRow({ ch, index }: { ch: Channel; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: "relative" as const, zIndex: isDragging ? 10 : undefined };

  return (
    <tr ref={setNodeRef} style={style}
      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isDragging ? "bg-muted shadow-lg" : ""}`}>
      <td className="p-3 w-10">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" tabIndex={-1}>
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="p-3 text-center text-xs font-mono text-muted-foreground font-semibold w-14">{ch.number}</td>
      <td className="p-3 font-medium text-foreground">{ch.name}</td>
      <td className="p-3 font-mono text-foreground">{ch.sourceStream || "—"}</td>
      <td className="p-3 hidden lg:table-cell">
        <span className="font-mono text-xs text-muted-foreground truncate block max-w-[280px]" title={ch.cmd}>{ch.cmd}</span>
      </td>
      <td className="p-3"><StatusBadge status={ch.status || "synced"} /></td>
    </tr>
  );
}

const ChannelsPage = () => {
  const [search, setSearch] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const data = await api.getChannels();
      setChannels(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setChannels(prev => {
      const oldIndex = prev.findIndex(ch => ch.id === active.id);
      const newIndex = prev.findIndex(ch => ch.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex).map((ch, i) => ({ ...ch, number: i + 1 }));
      // Save new order to backend
      api.reorderStreams(reordered.map(ch => ({ streamKey: ch.sourceStream, sortOrder: ch.number }))).catch(() => {});
      return reordered;
    });
    toast.success("Channel order updated");
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadChannels();
    setRefreshing(false);
  };

  const isSearching = search !== "";

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
            <p className="text-sm text-muted-foreground mt-0.5">Channels currently in Ministra — drag to reorder</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card className="p-4 mb-4 bg-card border border-border">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search channels..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          {isSearching && <p className="text-xs text-muted-foreground mt-2">⚠ Drag-and-drop sorting is disabled while searching.</p>}
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-3 w-10"></th>
                      <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-14">#</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Channel Name</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Source Stream</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">CMD / URL</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <SortableContext items={filtered.map(ch => ch.id)} strategy={verticalListSortingStrategy} disabled={isSearching}>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-muted-foreground">
                            <MonitorPlay className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p>No channels found</p>
                          </td>
                        </tr>
                      ) : (
                        filtered.map((ch, i) => (
                          <SortableRow key={ch.id} ch={ch} index={i} />
                        ))
                      )}
                    </tbody>
                  </SortableContext>
                </table>
              </DndContext>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ChannelsPage;
