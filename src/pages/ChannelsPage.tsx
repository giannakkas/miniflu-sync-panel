import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Search, MonitorPlay, Loader2, GripVertical, RefreshCw, Trash2, Pencil, X, Check, Download } from "lucide-react";

interface Channel {
  id: number;
  name: string;
  number: number;
  cmd: string;
  sourceStream: string;
  status: string;
}

function SortableRow({ ch, selected, onToggle, onEdit, onDelete, editing, editData, setEditData, onSaveEdit, onCancelEdit, isAdmin }: {
  ch: Channel; selected: boolean; onToggle: () => void;
  onEdit: () => void; onDelete: () => void;
  editing: boolean; editData: { name: string; cmd: string } | null;
  setEditData: (d: { name: string; cmd: string }) => void;
  onSaveEdit: () => void; onCancelEdit: () => void;
  isAdmin: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: "relative" as const, zIndex: isDragging ? 10 : undefined };

  return (
    <tr ref={setNodeRef} style={style}
      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isDragging ? "bg-muted shadow-lg" : ""} ${selected ? "bg-primary/5" : ""}`}>
      <td className="p-3 w-10">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" tabIndex={-1}>
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="p-3 w-10">{isAdmin && <Checkbox checked={selected} onCheckedChange={onToggle} />}</td>
      <td className="p-3 text-center text-xs font-mono text-muted-foreground font-semibold w-14">{ch.number}</td>
      <td className="p-3 font-medium text-foreground">
        {editing && editData ? (
          <Input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} className="h-8 text-sm" />
        ) : ch.name}
      </td>
      <td className="p-3 font-mono text-foreground text-xs">{ch.sourceStream || "—"}</td>
      <td className="p-3 hidden lg:table-cell">
        {editing && editData ? (
          <Input value={editData.cmd} onChange={e => setEditData({ ...editData, cmd: e.target.value })} className="h-8 text-xs font-mono" />
        ) : (
          <span className="font-mono text-xs text-muted-foreground truncate block max-w-[280px]" title={ch.cmd}>{ch.cmd}</span>
        )}
      </td>
      <td className="p-3">
        {isAdmin ? (
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500" onClick={onSaveEdit}><Check className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancelEdit}><X className="w-3.5 h-3.5" /></Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
            </>
          )}
        </div>
        ) : null}
      </td>
    </tr>
  );
}

const ChannelsPage = () => {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ name: string; cmd: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const activeId = Number(active.id);
      const overId = Number(over.id);
      const oldIndex = prev.findIndex(ch => ch.id === activeId);
      const newIndex = prev.findIndex(ch => ch.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex).map((ch, i) => ({ ...ch, number: i + 1 }));
      api.reorderChannels(reordered.map(ch => ({ id: ch.id, number: ch.number })))
        .then(() => toast.success("Channel order saved to Ministra"))
        .catch((err: any) => toast.error(`Reorder failed: ${err.message}`));
      return reordered;
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadChannels();
    setRefreshing(false);
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedSet);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedSet(next);
  };
  const selectAll = () => setSelectedSet(new Set(filtered.map(ch => ch.id)));
  const deselectAll = () => setSelectedSet(new Set());

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedSet.size} channel(s) from Ministra?`)) return;
    setDeleting(true);
    try {
      await api.deleteChannelsBatch(Array.from(selectedSet));
      toast.success(`${selectedSet.size} channel(s) deleted`);
      setSelectedSet(new Set());
      await loadChannels();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOne = async (id: number) => {
    if (!confirm("Delete this channel from Ministra?")) return;
    try {
      await api.deleteChannel(id);
      toast.success("Channel deleted");
      await loadChannels();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  const handleEdit = (ch: Channel) => {
    setEditingId(ch.id);
    setEditData({ name: ch.name, cmd: ch.cmd });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editData) return;
    try {
      await api.updateChannel(editingId, editData);
      toast.success("Channel updated");
      setEditingId(null);
      setEditData(null);
      await loadChannels();
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData(null);
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
            <p className="text-sm text-muted-foreground mt-0.5">
              {channels.length} channel{channels.length !== 1 ? "s" : ""} in Ministra — drag to reorder
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" asChild>
                <a href="/api/channels/export.m3u" download="channels.m3u">
                  <Download className="w-4 h-4 mr-2" />
                  Export M3U
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Card className="p-4 mb-4 bg-card border border-border">
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search channels..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {isAdmin && <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>}
              {isAdmin && <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>}
              {isAdmin && selectedSet.size > 0 && (
                <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={deleting}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? "Deleting..." : `Delete Selected (${selectedSet.size})`}
                </Button>
              )}
            </div>
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
                      <th className="text-left p-3 w-10">
                        {isAdmin && <Checkbox checked={filtered.length > 0 && filtered.every(ch => selectedSet.has(ch.id))} onCheckedChange={(c) => c ? selectAll() : deselectAll()} />}
                      </th>
                      <th className="text-center p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-14">#</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Channel Name</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Source Stream</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">CMD / URL</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <SortableContext items={filtered.map(ch => ch.id)} strategy={verticalListSortingStrategy} disabled={isSearching}>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-muted-foreground">
                            <MonitorPlay className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p>No channels found</p>
                          </td>
                        </tr>
                      ) : (
                        filtered.map(ch => (
                          <SortableRow
                            key={ch.id} ch={ch}
                            selected={selectedSet.has(ch.id)}
                            onToggle={() => toggleSelect(ch.id)}
                            onEdit={() => handleEdit(ch)}
                            onDelete={() => handleDeleteOne(ch.id)}
                            editing={editingId === ch.id}
                            editData={editingId === ch.id ? editData : null}
                            setEditData={setEditData}
                            onSaveEdit={handleSaveEdit}
                            onCancelEdit={handleCancelEdit}
                            isAdmin={isAdmin}
                          />
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
