import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Globe, Send, Loader2, CheckCircle, XCircle, Search } from "lucide-react";

interface EpgMatch {
  id: number;
  name: string;
  number: number;
  cmd: string;
  current_xmltv_id: string;
  matched_tvg_id: string;
  matched_tvg_logo: string;
  matched: boolean;
}

const EpgPage = () => {
  const [m3uText, setM3uText] = useState("");
  const [m3uUrl, setM3uUrl] = useState("");
  const [matches, setMatches] = useState<EpgMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState("");

  // Override matched tvg_id per channel
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setM3uText(text);
      toast.success(`Loaded ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleFetchUrl = async () => {
    if (!m3uUrl) return;
    setLoading(true);
    try {
      const res = await fetch(m3uUrl);
      const text = await res.text();
      setM3uText(text);
      toast.success("M3U loaded from URL");
    } catch (err: any) {
      toast.error(`Failed to fetch: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMatch = async () => {
    if (!m3uText) {
      toast.error("No M3U data loaded. Upload a file or fetch from URL first.");
      return;
    }
    setLoading(true);
    try {
      const results = await api.matchEpg(m3uText);
      setMatches(results);
      setOverrides({});
      const matched = results.filter((r: EpgMatch) => r.matched).length;
      toast.success(`${matched}/${results.length} channels matched`);
    } catch (err: any) {
      toast.error(`Match failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    const mappings = matches.map(m => ({
      id: m.id,
      xmltv_id: overrides[m.id] !== undefined ? overrides[m.id] : m.matched_tvg_id,
      logo: m.matched_tvg_logo || '',
    })).filter(m => m.xmltv_id);

    if (mappings.length === 0) {
      toast.error("No EPG IDs to apply");
      return;
    }

    setApplying(true);
    try {
      await api.applyEpg(mappings);
      toast.success(`EPG IDs applied to ${mappings.length} channels in Ministra`);
    } catch (err: any) {
      toast.error(`Apply failed: ${err.message}`);
    } finally {
      setApplying(false);
    }
  };

  const matchedCount = matches.filter(m => m.matched || overrides[m.id]).length;
  const unmatchedCount = matches.length - matchedCount;

  const filtered = matches.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-full animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">EPG Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Import EPG IDs from iptveditor.com M3U and push to Ministra
          </p>
        </div>

        {/* Step 1: Load M3U */}
        <Card className="p-6 bg-card border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">1. Load M3U from iptveditor</h2>
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Upload M3U File</Label>
              <div className="flex gap-2">
                <Input type="file" accept=".m3u,.m3u8" onChange={handleFileUpload} className="h-10" />
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Or Fetch from URL</Label>
              <div className="flex gap-2">
                <Input
                  value={m3uUrl}
                  onChange={e => setM3uUrl(e.target.value)}
                  placeholder="https://iptveditor.com/..."
                  className="h-10 font-mono text-sm flex-1"
                />
                <Button variant="outline" size="sm" onClick={handleFetchUrl} disabled={loading || !m3uUrl} className="h-10">
                  <Globe className="w-4 h-4 mr-2" />
                  Fetch
                </Button>
              </div>
            </div>
          </div>
          {m3uText && (
            <p className="text-xs text-green-500 mt-3">
              ✓ M3U loaded ({m3uText.split('\n').filter(l => l.startsWith('#EXTINF')).length} entries)
            </p>
          )}
        </Card>

        {/* Step 2: Match */}
        <Card className="p-6 bg-card border border-border mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">2. Match Channels</h2>
              <p className="text-xs text-muted-foreground mt-1">Match M3U entries to Ministra channels by name</p>
            </div>
            <Button onClick={handleMatch} disabled={loading || !m3uText}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Match Channels
            </Button>
          </div>
        </Card>

        {/* Step 3: Results & Apply */}
        {matches.length > 0 && (
          <>
            <Card className="p-4 mb-4 bg-card border border-border">
              <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
                <div className="flex gap-4 text-sm">
                  <span className="text-green-500 font-medium">✓ {matchedCount} matched</span>
                  <span className="text-red-500 font-medium">✗ {unmatchedCount} unmatched</span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 w-48" />
                  </div>
                  <Button onClick={handleApply} disabled={applying || matchedCount === 0}>
                    {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Apply EPG to Ministra ({matchedCount})
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="bg-card border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-center p-3 w-10">EPG</th>
                      <th className="text-center p-3 w-14 font-semibold text-muted-foreground text-xs uppercase">#</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase">Channel</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase">Current EPG ID</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase">Matched EPG ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(m => {
                      const epgId = overrides[m.id] !== undefined ? overrides[m.id] : m.matched_tvg_id;
                      const hasEpg = !!(epgId && epgId.trim());
                      return (
                        <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-center">
                            {hasEpg ? (
                              <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                            )}
                          </td>
                          <td className="p-3 text-center text-xs font-mono text-muted-foreground">{m.number}</td>
                          <td className="p-3 font-medium text-foreground">{m.name}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{m.current_xmltv_id || "—"}</td>
                          <td className="p-3">
                            <Input
                              value={overrides[m.id] !== undefined ? overrides[m.id] : m.matched_tvg_id}
                              onChange={e => setOverrides(prev => ({ ...prev, [m.id]: e.target.value }))}
                              placeholder="No match"
                              className="h-8 text-xs font-mono w-full max-w-[280px]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EpgPage;
