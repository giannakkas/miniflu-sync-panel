import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import StreamsPage from "./pages/StreamsPage";
import ChannelsPage from "./pages/ChannelsPage";
import LogsPage from "./pages/LogsPage";
import EpgPage from "./pages/EpgPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/channels" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <>{children}</>;
  return <Navigate to={isAdmin ? "/" : "/channels"} replace />;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
    <Route path="/" element={<AdminRoute><DashboardPage /></AdminRoute>} />
    <Route path="/streams" element={<AdminRoute><StreamsPage /></AdminRoute>} />
    <Route path="/channels" element={<ProtectedRoute><ChannelsPage /></ProtectedRoute>} />
    <Route path="/epg" element={<AdminRoute><EpgPage /></AdminRoute>} />
    <Route path="/logs" element={<AdminRoute><LogsPage /></AdminRoute>} />
    <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
