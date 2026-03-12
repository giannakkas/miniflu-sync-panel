import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send } from "lucide-react";
import type { Stream } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  streams: Stream[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function SyncConfirmDialog({ open, streams, onConfirm, onCancel, loading }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send to Ministra
          </AlertDialogTitle>
          <AlertDialogDescription>
            The following {streams.length} stream{streams.length !== 1 ? "s" : ""} will be sent to Ministra.
            Channel names will be created from the stream <strong className="text-foreground">title</strong>, not the stream key.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-64 rounded-lg border border-border">
          <div className="divide-y divide-border">
            {streams.map(stream => (
              <div key={stream.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{stream.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">{stream.streamKey} · {stream.outputUrl}</p>
                </div>
                <StatusBadge status={stream.status} />
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Note:</strong> Channels will be created in Ministra using the title as the channel name.
          Streams already synced will be updated.
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading} className="font-semibold">
            {loading ? "Sending..." : `Send ${streams.length} Stream${streams.length !== 1 ? "s" : ""}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
