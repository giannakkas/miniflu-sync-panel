import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio, Wifi } from "lucide-react";

const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    // Simulate network delay
    await new Promise(r => setTimeout(r, 600));
    
    const success = login(username, password);
    if (!success) {
      setError("Invalid credentials. Try admin / admin");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-sidebar">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Radio className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold text-sidebar-accent-foreground tracking-tight">MiniFlu</h1>
          </div>
          <p className="text-sidebar-foreground text-lg mb-6">Flussonic to Ministra Sync Panel</p>
          <div className="flex items-center justify-center gap-2 text-sidebar-foreground/60 text-sm">
            <Wifi className="w-4 h-4" />
            <span>IPTV Stream Management</span>
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background rounded-l-3xl">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Radio className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">MiniFlu</h1>
          </div>

          <h2 className="text-2xl font-semibold text-foreground mb-1">Welcome back</h2>
          <p className="text-muted-foreground mb-8">Sign in to your operator panel</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                className="h-11"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="h-11"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(c) => setRemember(c === true)}
              />
              <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">Remember me</Label>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-8 text-center">
            Internal operator panel · MiniFlu v1.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
