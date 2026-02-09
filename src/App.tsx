import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { TranslationProvider } from "@/hooks/useTranslation";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import Branding from "./pages/Branding";
import Roles from "./pages/Roles";
import Locations from "./pages/Locations";
import LocationDetail from "./pages/LocationDetail";
import EnergyData from "./pages/EnergyData";
import Integrations from "./pages/Integrations";
import Profile from "./pages/Profile";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminTenants from "./pages/SuperAdminTenants";
import SuperAdminTenantDetail from "./pages/SuperAdminTenantDetail";
import SuperAdminStatistics from "./pages/SuperAdminStatistics";
import SuperAdminBilling from "./pages/SuperAdminBilling";
import SuperAdminSupport from "./pages/SuperAdminSupport";
import SuperAdminUsers from "./pages/SuperAdminUsers";
import SuperAdminRoles from "./pages/SuperAdminRoles";
import SuperAdminMap from "./pages/SuperAdminMap";

// Import Leaflet CSS globally
import "leaflet/dist/leaflet.css";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <TranslationProvider>
          <ThemeProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/branding" element={<Branding />} />
                  <Route path="/roles" element={<Roles />} />
                  <Route path="/locations" element={<Locations />} />
                  <Route path="/locations/:id" element={<LocationDetail />} />
                  <Route path="/energy-data" element={<EnergyData />} />
                  <Route path="/integrations" element={<Integrations />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/super-admin" element={<SuperAdminDashboard />} />
                  <Route path="/super-admin/tenants" element={<SuperAdminTenants />} />
                  <Route path="/super-admin/tenants/:id" element={<SuperAdminTenantDetail />} />
                  <Route path="/super-admin/statistics" element={<SuperAdminStatistics />} />
                  <Route path="/super-admin/users" element={<SuperAdminUsers />} />
                  <Route path="/super-admin/roles" element={<SuperAdminRoles />} />
                  <Route path="/super-admin/map" element={<SuperAdminMap />} />
                  <Route path="/super-admin/billing" element={<SuperAdminBilling />} />
                  <Route path="/super-admin/support" element={<SuperAdminSupport />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </ThemeProvider>
        </TranslationProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
