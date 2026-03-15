import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Upload, Globe, Send, Loader2, CheckCircle, XCircle, Search, Wand2,
  Plus, Trash2, ExternalLink, Copy, ChevronDown, ChevronUp, Satellite, ArrowUpToLine, Server
} from "lucide-react";

interface EpgMatch {
  id: number;
  name: string;
  number: number;
  cmd: string;
  current_xmltv_id: string;
  matched_tvg_id: string;
  matched_tvg_logo: string;
  matched_source?: string;
  matched: boolean;
}

interface EpgProvider {
  id: number;
  name: string;
  country: string;
  url: string;
  format: string;
  type: string;
  channels: number;
  enabled: number;
  notes: string;
  created_at: string;
}

interface MinistraEpgSource {
  id: number;
  uri: string;
  prefix: string;
  status: number;
  updated: string;
  hash: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  EG: '🇪🇬', GB: '🇬🇧', AE: '🇦🇪', SA: '🇸🇦', ALL: '🌍', CY: '🇨🇾',
  US: '🇺🇸', DE: '🇩🇪', FR: '🇫🇷', TR: '🇹🇷', GR: '🇬🇷', IT: '🇮🇹',
};

const COUNTRY_NAMES: Record<string, string> = {
  EG: 'Egypt', GB: 'United Kingdom', AE: 'UAE', SA: 'Saudi Arabia', ALL: 'Multi-region',
  CY: 'Cyprus', US: 'United States', DE: 'Germany', FR: 'France', TR: 'Turkey', GR: 'Greece', IT: 'Italy',
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  direct: { label: 'Direct XMLTV', color: 'bg-green-500/10 text-green-500' },
  'iptv-org-grabber': { label: 'iptv-org Grabber', color: 'bg-amber-500/10 text-amber-500' },
  api: { label: 'JSON API', color: 'bg-blue-500/10 text-blue-500' },
};

const EpgPage = () => {
  const [m3uText, setM3uText] = useState("");
  const [m3uUrl, setM3uUrl] = useState("");
  const [matches, setMatches] = useState<EpgMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  // Providers state
  const [providers, setProviders] = useState<EpgProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersExpanded, setProvidersExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '', country: '', url: '', format: 'xmltv', type: 'direct', channels: 0, notes: ''
  });
  const [countryFilter, setCountryFilter] = useState<string>('ALL');

  // Ministra EPG sources state
  const [ministraSources, setMinistraSources] = useState<MinistraEpgSource[]>([]);
  const [ministraLoading, setMinistraLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    loadProviders();
    loadMinistraSources();
  }, []);

  const loadProviders = async () => {
    try {
      setProvidersLoading(true);
      const data = await api.getEpgProviders();
      setProviders(data);
    } catch (err: any) {
      toast.error(`Failed to load providers: ${err.message}`);
    } finally {
      setProvidersLoading(false);
    }
  };

  const loadMinistraSources = async () => {
    try {
      setMinistraLoading(true);
      const data = await api.getMinistraEpgSources();
      setMinistraSources(data);
    } catch (err: any) {
      // Silently fail - table may not exist yet
      console.log('Failed to load Ministra sources:', err.message);
    } finally {
      setMinistraLoading(false);
    }
  };

  const pushToMinistra = async () => {
    setPushing(true);
    try {
      const result = await api.pushProvidersToMinistra();
      if (result.pushed > 0) {
        toast.success(`Pushed ${result.pushed} EPG source(s) to Ministra`, {
          description: result.existing ? `${result.existing} already existed` : undefined,
        });
      } else if (result.existing > 0) {
        toast.info(`All ${result.existing} sources already exist in Ministra`);
      } else {
        toast.warning('No enabled direct providers to push');
      }
      await loadMinistraSources();
    } catch (err: any) {
      toast.error(`Push failed: ${err.message}`);
    } finally {
      setPushing(false);
    }
  };

  const handleDeleteMinistraSource = async (id: number) => {
    try {
      await api.deleteMinistraEpgSource(id);
      setMinistraSources(prev => prev.filter(s => s.id !== id));
      toast.success('Ministra EPG source deleted');
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  const toggleProvider = async (id: number, enabled: boolean) => {
    try {
      await api.updateEpgProvider(id, { enabled });
      setProviders(prev => prev.map(p => p.id === id ? { ...p, enabled: enabled ? 1 : 0 } : p));
    } catch (err: any) {
      toast.error(`Failed to toggle provider: ${err.message}`);
    }
  };

  const handleDeleteProvider = async (id: number) => {
    try {
      await api.deleteEpgProvider(id);
      setProviders(prev => prev.filter(p => p.id !== id));
      toast.success('Provider deleted');
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  const handleAddProvider = async () => {
    if (!newProvider.name || !newProvider.url) {
      toast.error('Name and URL are required');
      return;
    }
    try {
      await api.addEpgProvider(newProvider);
      setShowAddForm(false);
      setNewProvider({ name: '', country: '', url: '', format: 'xmltv', type: 'direct', channels: 0, notes: '' });
      await loadProviders();
      toast.success('Provider added');
    } catch (err: any) {
      toast.error(`Failed to add provider: ${err.message}`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('URL copied to clipboard');
  };

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

  const handleAutoMatch = async () => {
    setAutoLoading(true);
    try {
      const results = await api.autoMatchEpg();
      setMatches(results);
      setOverrides({});
      const matched = results.filter((r: EpgMatch) => r.matched).length;
      const sources = results.reduce((acc: Record<string, number>, r: EpgMatch) => {
        if (r.matched_source) acc[r.matched_source] = (acc[r.matched_source] || 0) + 1;
        return acc;
      }, {});
      const sourceText = Object.entries(sources).map(([k, v]) => `${v} from ${k}`).join(', ');
      toast.success(`${matched}/${results.length} channels matched`, { description: sourceText || undefined });
    } catch (err: any) {
      toast.error(`Auto-match failed: ${err.message}`);
    } finally {
      setAutoLoading(false);
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
  const filtered = matches.filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()));

  // Country filter for providers
  const countries = [...new Set(providers.map(p => p.country))].sort();
  const filteredProviders = countryFilter === 'ALL'
    ? providers
    : providers.filter(p => p.country === countryFilter);

  const directProviders = filteredProviders.filter(p => p.type === 'direct');
  const grabberProviders = filteredProviders.filter(p => p.type !== 'direct');

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-full animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">EPG Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage EPG providers, import EPG IDs, and push to Ministra
          </p>
        </div>

        {/* ── EPG PROVIDERS ─────────────────────────────────────── */}
        <Card className="p-6 bg-card border border-border mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setProvidersExpanded(!providersExpanded)}>
              <Satellite className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">EPG Providers</h2>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                {providers.filter(p => p.enabled).length}/{providers.length} active
              </span>
              {providersExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={pushToMinistra}
                disabled={pushing || providers.filter(p => p.type === 'direct' && p.enabled).length === 0}
              >
                {pushing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowUpToLine className="w-4 h-4 mr-1" />}
                Push to Ministra
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowAddForm(!showAddForm); setProvidersExpanded(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                Add Provider
              </Button>
            </div>
          </div>

          {providersExpanded && (
            <>
              {/* Country filter tabs */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => setCountryFilter('ALL')}
                  className={`text-xs px-3 py-1.5 rounded-full transition-colors ${countryFilter === 'ALL' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                >
                  All ({providers.length})
                </button>
                {countries.filter(c => c !== 'ALL').map(c => (
                  <button
                    key={c}
                    onClick={() => setCountryFilter(c)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-colors ${countryFilter === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                  >
                    {COUNTRY_FLAGS[c] || ''} {COUNTRY_NAMES[c] || c} ({providers.filter(p => p.country === c).length})
                  </button>
                ))}
              </div>

              {/* Add form */}
              {showAddForm && (
                <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Add Custom Provider</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Name *</Label>
                      <Input value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))} placeholder="e.g. My EPG Source" className="h-9 text-sm mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">URL *</Label>
                      <Input value={newProvider.url} onChange={e => setNewProvider(p => ({ ...p, url: e.target.value }))} placeholder="https://..." className="h-9 text-sm font-mono mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Country Code</Label>
                      <Input value={newProvider.country} onChange={e => setNewProvider(p => ({ ...p, country: e.target.value.toUpperCase() }))} placeholder="GB, EG, AE, SA..." className="h-9 text-sm mt-1" maxLength={3} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <select
                        value={newProvider.type}
                        onChange={e => setNewProvider(p => ({ ...p, type: e.target.value }))}
                        className="w-full h-9 text-sm rounded-md border border-input bg-background px-3 mt-1"
                      >
                        <option value="direct">Direct XMLTV URL</option>
                        <option value="iptv-org-grabber">iptv-org Grabber</option>
                        <option value="api">JSON API</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Format</Label>
                      <select
                        value={newProvider.format}
                        onChange={e => setNewProvider(p => ({ ...p, format: e.target.value }))}
                        className="w-full h-9 text-sm rounded-md border border-input bg-background px-3 mt-1"
                      >
                        <option value="xmltv">XMLTV (.xml / .xml.gz)</option>
                        <option value="json">JSON</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Channels (approx)</Label>
                      <Input type="number" value={newProvider.channels || ''} onChange={e => setNewProvider(p => ({ ...p, channels: parseInt(e.target.value) || 0 }))} className="h-9 text-sm mt-1" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" onClick={handleAddProvider} className="h-9 w-full">
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Input value={newProvider.notes} onChange={e => setNewProvider(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." className="h-9 text-sm mt-1" />
                  </div>
                </div>
              )}

              {/* Direct XMLTV providers */}
              {directProviders.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Direct XMLTV Sources — ready to use in Ministra
                  </h3>
                  <div className="space-y-2">
                    {directProviders.map(p => (
                      <ProviderRow
                        key={p.id}
                        provider={p}
                        onToggle={toggleProvider}
                        onDelete={handleDeleteProvider}
                        onCopy={copyToClipboard}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Grabber / API providers */}
              {grabberProviders.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Grabber / API Sources — require iptv-org grabber or processing
                  </h3>
                  <div className="space-y-2">
                    {grabberProviders.map(p => (
                      <ProviderRow
                        key={p.id}
                        provider={p}
                        onToggle={toggleProvider}
                        onDelete={handleDeleteProvider}
                        onCopy={copyToClipboard}
                      />
                    ))}
                  </div>
                </div>
              )}

              {providersLoading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading providers...
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── MINISTRA EPG SOURCES ──────────────────────────────── */}
        <Card className="p-6 bg-card border border-border mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-semibold text-foreground">Ministra EPG Sources</h2>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                {ministraSources.length} source(s)
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={loadMinistraSources} disabled={ministraLoading}>
              {ministraLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
              Refresh
            </Button>
          </div>

          {ministraSources.length > 0 ? (
            <div className="space-y-2">
              {ministraSources.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-card">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.status ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">#{s.id}</span>
                  <code className="text-xs font-mono text-foreground flex-1 truncate">{s.uri}</code>
                  {s.prefix && (
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground shrink-0">
                      prefix: {s.prefix}
                    </span>
                  )}
                  {s.updated && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(s.updated).toLocaleDateString()}
                    </span>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                    onClick={() => handleDeleteMinistraSource(s.id)}
                    title="Delete from Ministra"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {ministraLoading ? 'Loading...' : 'No EPG sources in Ministra. Use "Push to Ministra" above to add enabled direct providers.'}
            </p>
          )}
        </Card>

        {/* ── M3U IMPORT ────────────────────────────────────────── */}
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
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">2. Match Channels</h2>
              <p className="text-xs text-muted-foreground mt-1">Match from M3U file or auto-detect using iptv-org database + MENA alias map</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleMatch} disabled={loading || autoLoading || !m3uText}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Match from M3U
              </Button>
              <Button onClick={handleAutoMatch} disabled={loading || autoLoading}>
                {autoLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Auto-Match EPG
              </Button>
            </div>
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
                      <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase hidden lg:table-cell">Source</th>
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
                          <td className="p-3 hidden lg:table-cell">
                            {m.matched_source && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                m.matched_source === 'iptv-org' ? 'bg-blue-500/10 text-blue-500' :
                                m.matched_source === 'alias' ? 'bg-orange-500/10 text-orange-500' :
                                'bg-green-500/10 text-green-500'
                              }`}>
                                {m.matched_source}
                              </span>
                            )}
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

// ── Provider Row Component ──────────────────────────────────────────
function ProviderRow({ provider: p, onToggle, onDelete, onCopy }: {
  provider: EpgProvider;
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (id: number) => void;
  onCopy: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = TYPE_LABELS[p.type] || { label: p.type, color: 'bg-muted text-muted-foreground' };
  const flag = COUNTRY_FLAGS[p.country] || '🌐';
  const isDirect = p.type === 'direct';

  return (
    <div className={`border border-border rounded-lg transition-colors ${p.enabled ? 'bg-card' : 'bg-muted/30 opacity-70'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Switch
          checked={!!p.enabled}
          onCheckedChange={(v) => onToggle(p.id, v)}
          className="data-[state=checked]:bg-green-500 shrink-0"
        />
        <span className="text-lg shrink-0">{flag}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground truncate">{p.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              ~{p.channels.toLocaleString()} ch
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isDirect && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onCopy(p.url)} title="Copy URL">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(p.url, '_blank')} title="Open URL">
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(!expanded)} title="Details">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(p.id)} title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2">
            <div>
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">URL</span>
              <div className="flex items-center gap-1 mt-0.5">
                <code className="text-xs font-mono text-foreground bg-muted px-2 py-1 rounded break-all flex-1">{p.url}</code>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => onCopy(p.url)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Notes</span>
              <p className="text-xs text-muted-foreground mt-0.5">{p.notes || '—'}</p>
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
            <span>Format: <strong className="text-foreground">{p.format}</strong></span>
            <span>Country: <strong className="text-foreground">{COUNTRY_NAMES[p.country] || p.country}</strong></span>
            <span>Added: <strong className="text-foreground">{p.created_at ? new Date(p.created_at + 'Z').toLocaleDateString() : '—'}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default EpgPage;
