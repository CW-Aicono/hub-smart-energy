import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { TranslationProvider } from "@/hooks/useTranslation";
import { ThemeProvider } from "@/hooks/useTheme";
import ModuleGuard from "@/components/ModuleGuard";
import { SuperAdminWrapper } from "@/components/super-admin/SuperAdminWrapper";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import Branding from "./pages/Branding";
import Roles from "./pages/Roles";
import Locations from "./pages/Locations";
import LocationDetail from "./pages/LocationDetail";
import EnergyData from "./pages/EnergyData";
import MetersOverview from "./pages/MetersOverview";
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
import SuperAdminModulePricing from "./pages/SuperAdminModulePricing";
import SuperAdminUsers from "./pages/SuperAdminUsers";
import SuperAdminRoles from "./pages/SuperAdminRoles";
import MobileApp from "./pages/MobileApp";
import GettingStarted from "./pages/GettingStarted";
import ChargingPoints from "./pages/ChargingPoints";
import ChargingBilling from "./pages/ChargingBilling";
import Automation from "./pages/Automation";
import LiveValues from "./pages/LiveValues";
import UpdateBanner from "./components/UpdateBanner";
// Import Leaflet CSS globally
import "leaflet/dist/leaflet.css";

const queryClient = new QueryClient();

const M = ({ children }: { children: React.ReactNode }) => (
  <ModuleGuard>{children}</ModuleGuard>
);

const SA = ({ children }: { children: React.ReactNode }) => (
  <SuperAdminWrapper>{children}</SuperAdminWrapper>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <TranslationProvider>
          <ThemeProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <UpdateBanner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/branding" element={<M><Branding /></M>} />
                  <Route path="/roles" element={<Roles />} />
                  <Route path="/locations" element={<M><Locations /></M>} />
                  <Route path="/locations/:id" element={<M><LocationDetail /></M>} />
                  <Route path="/energy-data" element={<M><EnergyData /></M>} />
                  <Route path="/meters" element={<M><MetersOverview /></M>} />
                  <Route path="/live-values" element={<M><LiveValues /></M>} />
                  <Route path="/integrations" element={<M><Integrations /></M>} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/super-admin" element={<SA><SuperAdminDashboard /></SA>} />
                  <Route path="/super-admin/tenants" element={<SA><SuperAdminTenants /></SA>} />
                  <Route path="/super-admin/tenants/:id" element={<SA><SuperAdminTenantDetail /></SA>} />
                  <Route path="/super-admin/statistics" element={<SA><SuperAdminStatistics /></SA>} />
                  <Route path="/super-admin/users" element={<SA><SuperAdminUsers /></SA>} />
                  <Route path="/super-admin/roles" element={<SA><SuperAdminRoles /></SA>} />
                  <Route path="/super-admin/billing" element={<SA><SuperAdminBilling /></SA>} />
                  <Route path="/super-admin/module-pricing" element={<SA><SuperAdminModulePricing /></SA>} />
                  <Route path="/super-admin/support" element={<SA><SuperAdminSupport /></SA>} />
                  <Route path="/charging/points" element={<M><ChargingPoints /></M>} />
                  <Route path="/charging/billing" element={<M><ChargingBilling /></M>} />
                  <Route path="/automation" element={<M><Automation /></M>} />
                  <Route path="/m" element={<MobileApp />} />
                  <Route path="/getting-started" element={<GettingStarted />} />
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
