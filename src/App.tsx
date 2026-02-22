import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { TranslationProvider } from "@/hooks/useTranslation";
import { ThemeProvider } from "@/hooks/useTheme";
import { DemoModeDetector } from "@/contexts/DemoMode";
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
import SetPassword from "./pages/SetPassword";
import AcceptInvite from "./pages/AcceptInvite";
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
import ChargePointDetail from "./pages/ChargePointDetail";
import ChargingBilling from "./pages/ChargingBilling";
import Automation from "./pages/Automation";
import EmailTemplates from "./pages/EmailTemplates";
import LiveValues from "./pages/LiveValues";
import Tasks from "./pages/Tasks";
import NetworkInfrastructure from "./pages/NetworkInfrastructure";
import SuperAdminOcppIntegrations from "./pages/SuperAdminOcppIntegrations";
import SuperAdminOcppControl from "./pages/SuperAdminOcppControl";
import ChargingApp from "./pages/ChargingApp";
import ChargingAppAdmin from "./pages/ChargingAppAdmin";
import ArbitrageTrading from "./pages/ArbitrageTrading";
import TenantElectricity from "./pages/TenantElectricity";
import TenantEnergyApp from "./pages/TenantEnergyApp";
import Demo from "./pages/Demo";
import UpdateBanner from "./components/UpdateBanner";
import CookieConsent from "./components/CookieConsent";
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
    <BrowserRouter>
      <DemoModeDetector>
        <AuthProvider>
          <TenantProvider>
            <TranslationProvider>
              <ThemeProvider>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <UpdateBanner />
                  <CookieConsent />
                  <Routes>
                    <Route path="/demo" element={<Demo />} />
                    <Route path="/" element={<Index />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/settings/branding" element={<M><Branding /></M>} />
                    <Route path="/settings/email-templates" element={<M><EmailTemplates /></M>} />
                    <Route path="/roles" element={<Roles />} />
                    <Route path="/locations" element={<M><Locations /></M>} />
                    <Route path="/locations/:id" element={<M><LocationDetail /></M>} />
                    <Route path="/energy-data" element={<M><EnergyData /></M>} />
                    <Route path="/meters" element={<M><MetersOverview /></M>} />
                    <Route path="/live-values" element={<M><LiveValues /></M>} />
                    <Route path="/integrations" element={<M><Integrations /></M>} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/set-password" element={<SetPassword />} />
                    <Route path="/accept-invite" element={<AcceptInvite />} />
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
                    <Route path="/super-admin/ocpp/integrations" element={<SA><SuperAdminOcppIntegrations /></SA>} />
                    <Route path="/super-admin/ocpp/control" element={<SA><SuperAdminOcppControl /></SA>} />
                    <Route path="/charging/points" element={<M><ChargingPoints /></M>} />
                    <Route path="/charging/points/:id" element={<M><ChargePointDetail /></M>} />
                    <Route path="/charging/billing" element={<M><ChargingBilling /></M>} />
                    <Route path="/charging/app" element={<M><ChargingAppAdmin /></M>} />
                    <Route path="/automation" element={<M><Automation /></M>} />
                    <Route path="/tasks" element={<M><Tasks /></M>} />
                    <Route path="/network" element={<M><NetworkInfrastructure /></M>} />
                    <Route path="/arbitrage" element={<M><ArbitrageTrading /></M>} />
                    <Route path="/tenant-electricity" element={<M><TenantElectricity /></M>} />
                    <Route path="/ev" element={<ChargingApp />} />
                    <Route path="/te" element={<TenantEnergyApp />} />
                    <Route path="/m" element={<MobileApp />} />
                    <Route path="/getting-started" element={<GettingStarted />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </TooltipProvider>
              </ThemeProvider>
            </TranslationProvider>
          </TenantProvider>
        </AuthProvider>
      </DemoModeDetector>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
