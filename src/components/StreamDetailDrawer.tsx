import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge, ProtocolBadge } from "@/components/StatusBadge";
import { Separator } from "@/components/ui/separator";
import type { Stream } from "@/lib/mock-data";
import { Send, Upload } from "lucide-react";
import { toast } from "sonner";

interface Props {
  stream: Stream | null;
  onClose: () => void;
}

export function StreamDetailDrawer({ stream, onClose }: Props) {
  if (!stream) return null;

  const handleSend = () => {
    toast.success(`"${stream.title}" sent to Ministra`);
    onClose();
  };

  const rows = [
    { label: "Stream Key", value: stream.streamKey },
    { label: "Title (→ Ministra Name)", value: stream.title },
    { label: "Output URL", value: stream.outputUrl, mono: true },
    { label: "Bitrate", value: stream.bitrate || "—" },
    { label: "Resolution", value: stream.resolution || "—" },
    { label: "Last Synced", value: stream.lastSynced || "Never" },
  ];

  return (
    <Sheet open={!!stream} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-md bg-card">
        <SheetHeader>
          <SheetTitle className="text-foreground">Stream Details</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-3">
            <ProtocolBadge protocol={stream.protocol} />
            <StatusBadge status={stream.status} />
          </div>

          <div className="space-y-4">
            {rows.map(row => (
              <div key={row.label}>
                <p className="text-xs text-muted-foreground mb-1">{row.label}</p>
                <p className={`text-sm text-foreground ${row.mono ? "font-mono text-xs break-all" : "font-medium"}`}>
                  {row.value}
                </p>
              </div>
            ))}
          </div>

          <Separator />

          <div>
            <p className="text-xs text-muted-foreground mb-2">Ministra Channel</p>
            {stream.ministraMatch ? (
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm font-medium text-foreground">{stream.ministraChannelName}</p>
                <p className="text-xs text-muted-foreground mt-1">Channel exists in Ministra</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not yet synced to Ministra</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleSend} className="flex-1">
              <Send className="w-4 h-4 mr-2" />
              Send to Ministra
            </Button>
            <Button variant="outline" className="flex-1">
              <Upload className="w-4 h-4 mr-2" />
              Update
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Channel name "{stream.title}" will be used in Ministra
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
