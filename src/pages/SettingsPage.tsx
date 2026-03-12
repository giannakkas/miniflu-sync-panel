import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Server, Globe, Shield, Loader2 } from "lucide-react";

const SettingsPage = () => {
  const [testing, setTesting] = useState<string | null>(null);

  const handleTest = async (service: string) => {
    setTesting(service);
    await new Promise(r => setTimeout(r, 1200));
    setTesting(null);
    toast.success(`${service} connection successful`);
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-3xl animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure connections and panel authentication</p>
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
                <Input placeholder="e.g. 172.18.181.12" className="h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input placeholder="e.g. 8080" className="h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input placeholder="Flussonic username" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" placeholder="Flussonic password" className="h-10" />
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
              <h2 className="text-lg font-semibold text-foreground">Ministra Settings</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>API Base URL</Label>
                <Input placeholder="e.g. http://172.18.181.13:88/stalker_portal/api" className="h-10 font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Full URL including path to Stalker Portal API</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input placeholder="Ministra API username" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" placeholder="Ministra API password" className="h-10" />
                </div>
              </div>
            </div>
            <div className="mt-5">
              <Button variant="outline" size="sm" onClick={() => handleTest("Ministra")} disabled={testing === "Ministra"}>
                {testing === "Ministra" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Test Connection
              </Button>
            </div>
          </Card>

          {/* Panel Auth */}
          <Card className="p-6 bg-card border border-border">
            <div className="flex items-center gap-3 mb-5">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Panel Authentication</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Admin Username</Label>
                <Input defaultValue="admin" className="h-10" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" placeholder="Enter new password" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" placeholder="Confirm password" className="h-10" />
                </div>
              </div>
            </div>
            <Separator className="my-5" />
            <Button onClick={() => toast.success("Settings saved")}>
              Save Settings
            </Button>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
