import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Server, Globe, Shield, Loader2, Database, Clock } from "lucide-react";

const SettingsPage = () => {
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    api.getSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleTest = async (service: string) => {
    setTesting(service);
    try {
      const result = service === "Flussonic"
        ? await api.testFlussonic()
        : await api.testMinistra();

      if (result.ok) {
        toast.success(`${service} connection successful`, { description: result.message || result.db?.message || result.api?.message });
      } else {
        toast.error(`${service} connection failed`, { description: result.message || result.db?.message || result.api?.message });
      }
    } catch (err: any) {
      toast.error(`${service} test failed: ${err.message}`);
    } finally {
      setTesting(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-3xl animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure connections, sync interval, and panel authentication</p>
        </div>

        <div className="space-y-6">
          {/* Flussonic Settings */}
          <Card className="p-6 bg-card border border-border">
            <div className="flex items-center gap-3 mb-5">
              <Server className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Flussonic Settings</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Host</Label>
                <Input value={settings.flussonic_host || ""} onChange={e => update("flussonic_host", e.target.value)} placeholder="e.g. 172.18.181.12" className="h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={settings.flussonic_port || ""} onChange={e => update("flussonic_port", e.target.value)} placeholder="e.g. 80 or 8080" className="h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={settings.flussonic_user || ""} onChange={e => update("flussonic_user", e.target.value)} placeholder="Flussonic username" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={settings.flussonic_pass || ""} onChange={e => update("flussonic_pass", e.target.value)} placeholder="Flussonic password" className="h-10" />
              </div>
            </div>
            <div className="mt-5">
              <Button variant="outline" size="sm" onClick={() => handleTest("Flussonic")} disabled={testing === "Flussonic"}>
                {testing === "Flussonic" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Test Connection
              </Button>
            </div>
          </Card>

          {/* Ministra Settings */}
          <Card className="p-6 bg-card border border-border">
            <div className="flex items-center gap-3 mb-5">
              <Globe className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Ministra REST API (optional)</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>API Base URL</Label>
                <Input value={settings.ministra_api_url || ""} onChange={e => update("ministra_api_url", e.target.value)} placeholder="e.g. http://172.18.181.13:88/stalker_portal/api" className="h-10 font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Used for reading channels. Leave empty if using MySQL only.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>API Username</Label>
                  <Input value={settings.ministra_api_user || ""} onChange={e => update("ministra_api_user", e.target.value)} placeholder="API username" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label>API Password</Label>
                  <Input type="password" value={settings.ministra_api_pass || ""} onChange={e => update("ministra_api_pass", e.target.value)} placeholder="API password" className="h-10" />
                </div>
              </div>
            </div>
          </Card>

          {/* Ministra MySQL */}
          <Card className="p-6 bg-card border border-border">
            <div className="flex items-center gap-3 mb-5">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Ministra MySQL (required for sync)</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Direct MySQL access to stalker_db is required to create/update channels. The REST API v1 only supports reading channels.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>MySQL Host</Label>
                <Input value={settings.ministra_db_host || ""} onChange={e => update("ministra_db_host", e.target.value)} placeholder="e.g. 172.18.181.13" className="h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label>MySQL Port</Label>
                <Input value={settings.ministra_db_port || ""} onChange={e => update("ministra_db_port", e.target.value)} placeholder="3306" className="h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label>MySQL Username</Label>
                <Input value={settings.ministra_db_user || ""} onChange={e => update("ministra_db_user", e.target.value)} placeholder="MySQL username" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>MySQL Password</Label>
                <Input type="password" value={settings.ministra_db_pass || ""} onChange={e => update("ministra_db_pass", e.target.value)} placeholder="MySQL password" className="h-10" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Database Name</Label>
                <Input value={settings.ministra_db_name || ""} onChange={e => update("ministra_db_name", e.target.value)} placeholder="stalker_db" className="h-10 font-mono" />
              </div>
            </div>
            <div className="mt-5">
              <Button variant="outline" size="sm" onClick={() => handleTest("Ministra")} disabled={testing === "Ministra"}>
                {testing === "Ministra" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Test Connection
              </Button>
            </div>
          </Card>

          {/* Sync Interval */}
          <Card className="p-6 bg-card border border-border">
            <div className="flex items-center gap-3 mb-5">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Auto-Sync</h2>
            </div>
            <div className="space-y-2">
              <Label>Sync Interval (minutes)</Label>
              <Input type="number" min="0" value={settings.sync_interval_minutes || "5"} onChange={e => update("sync_interval_minutes", e.target.value)} className="h-10 w-32 font-mono" />
              <p className="text-xs text-muted-foreground">How often to pull streams from Flussonic and sync to Ministra. Set to 0 to disable.</p>
            </div>
          </Card>

          {/* Panel Auth */}
          <Card className="p-6 bg-card border border-border">
            <div className="flex items-center gap-3 mb-5">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Panel Authentication</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Admin Username</Label>
                <Input value={settings.admin_user || ""} onChange={e => update("admin_user", e.target.value)} placeholder="admin" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Admin Password</Label>
                <Input type="password" value={settings.admin_pass || ""} onChange={e => update("admin_pass", e.target.value)} placeholder="Enter new password" className="h-10" />
              </div>
            </div>
          </Card>

          <Separator />
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Settings
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
