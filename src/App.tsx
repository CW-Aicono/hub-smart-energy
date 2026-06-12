import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { UserPreferencesProvider } from "@/hooks/useUserPreferences";
import { TranslationProvider } from "@/hooks/useTranslation";
import { ThemeProvider } from "@/hooks/useTheme";
import { DemoModeDetector } from "@/contexts/DemoMode";
import ModuleGuard from "@/components/ModuleGuard";
import { SuperAdminWrapper } from "@/components/super-admin/SuperAdminWrapper";
import { PartnerLayout } from "@/components/partner/PartnerLayout";
import PartnerDashboard from "@/pages/partner/PartnerDashboard";
import PartnerTenants from "@/pages/partner/PartnerTenants";
import PartnerMembers from "@/pages/partner/PartnerMembers";
import PartnerBilling from "@/pages/partner/PartnerBilling";
import PartnerSalesCatalog from "@/pages/partner/PartnerSalesCatalog";
import PartnerSalesRules from "@/pages/partner/PartnerSalesRules";
import PartnerBranding from "@/pages/partner/PartnerBranding";
import PartnerReporting from "@/pages/partner/PartnerReporting";
import PartnerTenantDetail from "@/pages/partner/PartnerTenantDetail";
import RecoveryGuard from "@/components/RecoveryGuard";
import MustChangePasswordGuard from "@/components/MustChangePasswordGuard";
import TenantStatusGuard from "@/components/TenantStatusGuard";
import SalesHostGuard from "@/components/SalesHostGuard";
import BoardHostGuard from "@/components/BoardHostGuard";
import UpdateBanner from "./components/UpdateBanner";
import SupportSessionBanner from "./components/SupportSessionBanner";
import SuperAdminImpersonationBar from "./components/SuperAdminImpersonationBar";
import CookieConsent from "./components/CookieConsent";
import LocationDetail from "./pages/LocationDetail";
import Locations from "./pages/Locations";
import PPA from "./pages/PPA";
import PPAWizard from "./pages/PPAWizard";
import PPADetail from "./pages/PPADetail";
// leaflet CSS is loaded lazily in map components

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Admin = lazy(() => import("./pages/Admin"));
const Settings = lazy(() => import("./pages/Settings"));
const Branding = lazy(() => import("./pages/Branding"));
const Roles = lazy(() => import("./pages/Roles"));

const EnergyData = lazy(() => import("./pages/EnergyData"));
const MetersOverview = lazy(() => import("./pages/MetersOverview"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Profile = lazy(() => import("./pages/Profile"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Help = lazy(() => import("./pages/Help"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const SuperAdminTenants = lazy(() => import("./pages/SuperAdminTenants"));
const SuperAdminPartners = lazy(() => import("./pages/SuperAdminPartners"));
const SuperAdminTenantDetail = lazy(() => import("./pages/SuperAdminTenantDetail"));
const SuperAdminStatistics = lazy(() => import("./pages/SuperAdminStatistics"));
const SuperAdminBilling = lazy(() => import("./pages/SuperAdminBilling"));
const SuperAdminLicenses = lazy(() => import("./pages/SuperAdminLicenses"));
const SuperAdminSupport = lazy(() => import("./pages/SuperAdminSupport"));
const SuperAdminModulePricing = lazy(() => import("./pages/SuperAdminModulePricing"));
const SuperAdminBundles = lazy(() => import("./pages/SuperAdminBundles"));
const SuperAdminUsers = lazy(() => import("./pages/SuperAdminUsers"));
const SuperAdminRoles = lazy(() => import("./pages/SuperAdminRoles"));
const MobileApp = lazy(() => import("./pages/MobileApp"));
const GettingStarted = lazy(() => import("./pages/GettingStarted"));
const ChargingPoints = lazy(() => import("./pages/ChargingPoints"));
const OcppIntegration = lazy(() => import("./pages/OcppIntegration"));
const ChargingSettings = lazy(() => import("./pages/ChargingSettings"));
const ChargePointDetail = lazy(() => import("./pages/ChargePointDetail"));
const ChargingBilling = lazy(() => import("./pages/ChargingBilling"));
const ChargingUsersPage = lazy(() => import("./pages/ChargingUsersPage"));
const Automation = lazy(() => import("./pages/Automation"));
const EmailTemplates = lazy(() => import("./pages/EmailTemplates"));
const LiveValues = lazy(() => import("./pages/LiveValues"));
const Tasks = lazy(() => import("./pages/Tasks"));
const NetworkInfrastructure = lazy(() => import("./pages/NetworkInfrastructure"));
const SuperAdminOcppIntegrations = lazy(() => import("./pages/SuperAdminOcppIntegrations"));
const SuperAdminOcppControl = lazy(() => import("./pages/SuperAdminOcppControl"));
const SuperAdminOcppFirmware = lazy(() => import("./pages/SuperAdminOcppFirmware"));
const SuperAdminSimulators = lazy(() => import("./pages/SuperAdminSimulators"));

const SuperAdminChargePointOnboarding = lazy(() => import("./pages/SuperAdminChargePointOnboarding"));
const ChargingApp = lazy(() => import("./pages/ChargingApp"));
const ChargingAppAdmin = lazy(() => import("./pages/ChargingAppAdmin"));
const ArbitrageTrading = lazy(() => import("./pages/ArbitrageTrading"));
const PeakShaving = lazy(() => import("./pages/PeakShaving"));
const Copilot = lazy(() => import("./pages/Copilot"));
const TenantElectricity = lazy(() => import("./pages/TenantElectricity"));
const EnergySharing = lazy(() => import("./pages/EnergySharing"));
const EnergySharingMemberDetail = lazy(() => import("./pages/EnergySharingMemberDetail"));
const MarketplacePublic = lazy(() => import("./pages/MarketplacePublic"));
const MarketplaceListingDetail = lazy(() => import("./pages/MarketplaceListingDetail"));
const SharingLogin = lazy(() => import("./pages/sharing/SharingLogin"));
const SharingDashboard = lazy(() => import("./pages/sharing/SharingDashboard"));
const SharingInvoices = lazy(() => import("./pages/sharing/SharingInvoices"));
const SharingOnboarding = lazy(() => import("./pages/sharing/SharingOnboarding"));
const SharingInstall = lazy(() => import("./pages/sharing/SharingInstall"));
const SharingSetPassword = lazy(() => import("./pages/sharing/SharingSetPassword"));

const TenantEnergyApp = lazy(() => import("./pages/TenantEnergyApp"));
const Demo = lazy(() => import("./pages/Demo"));
const SuperAdminMap = lazy(() => import("./pages/SuperAdminMap"));
const SuperAdminSettings = lazy(() => import("./pages/SuperAdminSettings"));
const SuperAdminMonitoring = lazy(() => import("./pages/SuperAdminMonitoring"));
const SuperAdminGatewayFleet = lazy(() => import("./pages/SuperAdminGatewayFleet"));
const SuperAdminWallboxTemplates = lazy(() => import("./pages/SuperAdminWallboxTemplates"));
const SuperAdminSalesCatalog = lazy(() => import("./pages/SuperAdminSalesCatalog"));
const SuperAdminSalesRules = lazy(() => import("./pages/SuperAdminSalesRules"));
const SalesProjects = lazy(() => import("./pages/SalesProjects"));
const SalesProjectNew = lazy(() => import("./pages/SalesProjectNew"));
const SalesProjectEdit = lazy(() => import("./pages/SalesProjectEdit"));
const SalesProjectDetail = lazy(() => import("./pages/SalesProjectDetail"));
const EmbedPitchDashboard = lazy(() => import("./pages/EmbedPitchDashboard"));
const EnergyReport = lazy(() => import("./pages/EnergyReport"));
const LegalPageView = lazy(() => import("./pages/LegalPageView"));
const PublicSalesQuote = lazy(() => import("./pages/PublicSalesQuote"));
const PublicChargeStatus = lazy(() => import("./pages/PublicChargeStatus"));
const BoardHome = lazy(() => import("./pages/board/BoardHome"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Stufe 1: Beim Ein-/Austritt aus der Remote-Support-Sicht alle React-Query-
// Caches verwerfen, damit niemals Daten der falschen Tenant-Sicht angezeigt
// werden (siehe .lovable/plan.md – Audit „Remote-Support zeigt falsche Tenant-Daten").
import { onImpersonationChanged } from "@/lib/supportView";
onImpersonationChanged(() => {
  queryClient.clear();
});

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
            <UserPreferencesProvider>
              <TranslationProvider>
                <ThemeProvider>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <ConfirmDialogHost />
                  <RecoveryGuard />
                  <MustChangePasswordGuard />
                  <SalesHostGuard />
                  <BoardHostGuard />
                  <UpdateBanner />
                  <SupportSessionBanner />
                  <SuperAdminImpersonationBar />
                  {!window.location.pathname.startsWith("/public/") && <CookieConsent />}
                  <TenantStatusGuard>
                  <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                    <Routes>
                      {/* Demo routes */}
                      <Route path="/demo" element={<Demo />} />
                      <Route path="/demo/locations" element={<Locations />} />
                      <Route path="/demo/energy-data" element={<EnergyData />} />
                      <Route path="/demo/meters" element={<MetersOverview />} />
                      <Route path="/demo/live-values" element={<LiveValues />} />
                      <Route path="/demo/charging/points" element={<ChargingPoints />} />
                      <Route path="/demo/charging/billing" element={<ChargingBilling />} />
                      <Route path="/demo/charging/users" element={<ChargingUsersPage />} />
                      <Route path="/demo/charging/app" element={<ChargingAppAdmin />} />
                      <Route path="/demo/charging/ocpp-integration" element={<OcppIntegration />} />
                      <Route path="/demo/charging/settings" element={<ChargingSettings />} />
                      
                      <Route path="/demo/automation" element={<Automation />} />
                      <Route path="/demo/arbitrage" element={<ArbitrageTrading />} />
                      <Route path="/demo/copilot" element={<Copilot />} />
                      <Route path="/demo/tenant-electricity" element={<TenantElectricity />} />
                      <Route path="/demo/network" element={<NetworkInfrastructure />} />
                      <Route path="/demo/tasks" element={<Tasks />} />
                      <Route path="/demo/admin" element={<Admin />} />
                      <Route path="/demo/roles" element={<Roles />} />
                      <Route path="/demo/settings" element={<Settings />} />
                      <Route path="/demo/settings/branding" element={<Settings />} />
                      <Route path="/demo/settings/email-templates" element={<EmailTemplates />} />
                      <Route path="/demo/integrations" element={<Integrations />} />
                      <Route path="/demo/help" element={<Help />} />
                      <Route path="/demo/profile" element={<Profile />} />
                      <Route path="/demo/locations/:id" element={<LocationDetail />} />
                      <Route path="/demo/charging/points/:id" element={<ChargePointDetail />} />

                      {/* Regular routes */}
                      <Route path="/" element={<Index />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/admin" element={<Admin />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/settings/branding" element={<M><Settings /></M>} />
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
                      <Route path="/super-admin/partners" element={<SA><SuperAdminPartners /></SA>} />
                      <Route path="/super-admin/statistics" element={<SA><SuperAdminStatistics /></SA>} />
                      <Route path="/super-admin/users" element={<SA><SuperAdminUsers /></SA>} />
                      <Route path="/super-admin/roles" element={<SA><SuperAdminRoles /></SA>} />
                      <Route path="/super-admin/billing" element={<SA><SuperAdminBilling /></SA>} />
                      <Route path="/super-admin/licenses" element={<SA><SuperAdminLicenses /></SA>} />
                      <Route path="/super-admin/module-pricing" element={<SA><SuperAdminModulePricing /></SA>} />
                      <Route path="/super-admin/bundles" element={<SA><SuperAdminBundles /></SA>} />
                      <Route path="/super-admin/support" element={<SA><SuperAdminSupport /></SA>} />
                      <Route path="/super-admin/settings" element={<SA><SuperAdminSettings /></SA>} />
                      <Route path="/super-admin/monitoring" element={<SA><SuperAdminMonitoring /></SA>} />
                      <Route path="/super-admin/gateways" element={<SA><SuperAdminGatewayFleet /></SA>} />
                      <Route path="/super-admin/wallbox-templates" element={<SA><SuperAdminWallboxTemplates /></SA>} />
                      <Route path="/super-admin/ocpp/integrations" element={<SA><SuperAdminOcppIntegrations /></SA>} />
                      <Route path="/super-admin/ocpp/control" element={<SA><SuperAdminOcppControl /></SA>} />
                      <Route path="/super-admin/ocpp/firmware" element={<SA><SuperAdminOcppFirmware /></SA>} />
                      <Route path="/super-admin/ocpp/simulators" element={<SA><SuperAdminSimulators /></SA>} />
                      
                      <Route path="/super-admin/ocpp/onboarding" element={<SA><SuperAdminChargePointOnboarding /></SA>} />
                      <Route path="/super-admin/map" element={<SA><SuperAdminMap /></SA>} />
                      <Route path="/super-admin/sales/catalog" element={<SA><SuperAdminSalesCatalog /></SA>} />
                      <Route path="/super-admin/sales/rules" element={<SA><SuperAdminSalesRules /></SA>} />
                      <Route path="/sales" element={<SalesProjects />} />
                      <Route path="/sales/new" element={<SalesProjectNew />} />
                      <Route path="/sales/quote/:token" element={<PublicSalesQuote />} />
                      <Route path="/sales/:id/edit" element={<SalesProjectEdit />} />
                      <Route path="/sales/:id" element={<SalesProjectDetail />} />
                      <Route path="/charging/points" element={<M><ChargingPoints /></M>} />
                      <Route path="/charging/points/:id" element={<M><ChargePointDetail /></M>} />
                      <Route path="/charging/billing" element={<M><ChargingBilling /></M>} />
                      <Route path="/charging/users" element={<M><ChargingUsersPage /></M>} />
                      <Route path="/charging/app" element={<M><ChargingAppAdmin /></M>} />
                      <Route path="/charging/ocpp-integration" element={<M><OcppIntegration /></M>} />
                      <Route path="/charging/settings" element={<M><ChargingSettings /></M>} />
                      
                      <Route path="/automation" element={<M><Automation /></M>} />
                      <Route path="/tasks" element={<M><Tasks /></M>} />
                      <Route path="/network" element={<M><NetworkInfrastructure /></M>} />
                      <Route path="/arbitrage" element={<M><ArbitrageTrading /></M>} />
                      <Route path="/peak-shaving" element={<M><PeakShaving /></M>} />
                      <Route path="/demo/peak-shaving" element={<PeakShaving />} />
                      <Route path="/copilot" element={<M><Copilot /></M>} />
                      <Route path="/energy-report" element={<M><EnergyReport /></M>} />
                      <Route path="/energy-sharing" element={<M><EnergySharing /></M>} />
                      <Route path="/energy-sharing/members/:memberId" element={<M><EnergySharingMemberDetail /></M>} />
                      <Route path="/sharing/marktplatz" element={<MarketplacePublic />} />
                      <Route path="/sharing/marktplatz/:slug" element={<MarketplaceListingDetail />} />
                      <Route path="/mein-sharing" element={<SharingDashboard />} />
                      <Route path="/mein-sharing/login" element={<SharingLogin />} />
                      <Route path="/mein-sharing/set-password" element={<SharingSetPassword />} />
                      <Route path="/mein-sharing/dashboard" element={<SharingDashboard />} />
                      <Route path="/mein-sharing/rechnungen" element={<SharingInvoices />} />
                      <Route path="/mein-sharing/onboarding" element={<SharingOnboarding />} />
                      <Route path="/mein-sharing/install" element={<SharingInstall />} />

                      <Route path="/tenant-electricity" element={<M><TenantElectricity /></M>} />
                      <Route path="/ppa" element={<M><PPA /></M>} />
                      <Route path="/ppa/onsite" element={<M><PPA type="onsite" /></M>} />
                      <Route path="/ppa/offsite" element={<M><PPA type="offsite" /></M>} />
                      <Route path="/ppa/new" element={<M><PPAWizard /></M>} />
                      <Route path="/ppa/:id" element={<M><PPADetail /></M>} />
                      <Route path="/ev" element={<ChargingApp />} />
                      <Route path="/te" element={<TenantEnergyApp />} />
                      <Route path="/m" element={<MobileApp />} />
                      <Route path="/getting-started" element={<GettingStarted />} />
                      <Route path="/embed/pitch-dashboard" element={<EmbedPitchDashboard />} />
                      <Route path="/public/charge-status/:token" element={<PublicChargeStatus />} />
                      <Route path="/datenschutz" element={<LegalPageView pageKey="datenschutz" />} />
                      <Route path="/impressum" element={<LegalPageView pageKey="impressum" />} />
                      <Route path="/agb" element={<LegalPageView pageKey="agb" />} />

                      {/* Stufe 2: Partner-Portal (partner.aicono.org → /partner/*) */}
                      <Route path="/partner" element={<PartnerLayout><PartnerDashboard /></PartnerLayout>} />
                      <Route path="/partner/tenants" element={<PartnerLayout><PartnerTenants /></PartnerLayout>} />
                      <Route path="/partner/tenants/:tenantId" element={<PartnerLayout><PartnerTenantDetail /></PartnerLayout>} />
                      <Route path="/partner/reporting" element={<PartnerLayout><PartnerReporting /></PartnerLayout>} />
                      <Route path="/partner/billing" element={<PartnerLayout><PartnerBilling /></PartnerLayout>} />
                      <Route path="/partner/branding" element={<PartnerLayout><PartnerBranding /></PartnerLayout>} />
                      <Route path="/partner/members" element={<PartnerLayout><PartnerMembers /></PartnerLayout>} />
                      <Route path="/partner/sales/catalog" element={<PartnerLayout><PartnerSalesCatalog /></PartnerLayout>} />
                      <Route path="/partner/sales/rules" element={<PartnerLayout><PartnerSalesRules /></PartnerLayout>} />
                      {/* Stufe 3: C-Level Dashboard (board.aicono.org → /board) */}
                      <Route path="/board" element={<BoardHome />} />

                      {/* Sales Scout: gemeinsam genutzt unter /sales (Partner-Member sehen ihre eigene Org via RLS) */}


                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  </TenantStatusGuard>
                </TooltipProvider>
              </ThemeProvider>
            </TranslationProvider>
            </UserPreferencesProvider>
          </TenantProvider>
        </AuthProvider>
      </DemoModeDetector>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
