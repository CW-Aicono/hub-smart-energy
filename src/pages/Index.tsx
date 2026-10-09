import { useState, useEffect, Suspense } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePortalMember as useSuperAdmin } from "@/hooks/usePortalAccess";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { DashboardFilterProvider } from "@/hooks/useDashboardFilter";
import { isImpersonating } from "@/lib/supportView";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { isPartnerHost, isSalesHost } from "@/lib/hostname";
import { getAreaPreference, type AppArea } from "@/lib/areaPreference";
import AreaChooser from "@/components/common/AreaChooser";
import DashboardContent from "./DashboardContent";

const Index = () => {
  const { user, loading, isRecovery } = useAuth();
  const { isSuperAdmin, loading: superAdminLoading } = useSuperAdmin();
  const { tenant, loading: tenantLoading } = useTenant();
  const { isPartnerMember, partnerName, loading: partnerLoading } = usePartnerAccess();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // If user is in recovery mode OR must change password (e.g. master-recovery OTP), force /set-password
  useEffect(() => {
    if (!user) return;
    if (isRecovery || (user as any)?.user_metadata?.must_change_password === true) {
      navigate("/set-password", { replace: true });
    }
  }, [isRecovery, user, navigate]);


  useEffect(() => {
    if (!user || onboardingChecked) return;
    // Onboarding-Status hängt am Tenant, nicht am User:
    // Der Wizard wird nur einmal pro Mandant gezeigt (vom Erst-Nutzer).
    if (tenantLoading) return;
    setOnboardingChecked(true);
    let dismissed = false;
    try { dismissed = !!tenant && sessionStorage.getItem(`onboarding_dismissed:${tenant.id}`) === "1"; } catch { /* ignore */ }
    if (tenant && !(tenant as any).onboarding_completed && !dismissed) {
      navigate("/getting-started", { replace: true });
    }
  }, [user, onboardingChecked, navigate, tenant, tenantLoading]);

  if (loading || superAdminLoading || partnerLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Sales-Scout-Subdomain (sales.aicono.org) leitet auf die mobile PWA /sales.
  if (isSalesHost()) return <Navigate to="/sales" replace />;

  // Stufe 2: Partner-Subdomain (partner.aicono.org) zeigt ausschließlich das Partner-Portal.
  // Auch wenn der eingeloggte User Super-Admin oder Tenant-Admin ist, soll auf dieser
  // Subdomain das Partner-Portal greifen.
  if (isPartnerHost()) return <Navigate to="/partner" replace />;

  // Mehrere Bereiche (Super-Admin / Partner / eigener Mandant):
  // gespeicherte Präferenz bzw. einmalige Auswahl. Die Präferenz ist nur
  // Navigationshilfe – jeder Bereich hat seinen eigenen Rechte-Guard.
  if ((isPartnerMember || isSuperAdmin) && !isImpersonating()) {
    if (tenantLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
        </div>
      );
    }
    const areas: AppArea[] = [];
    if (isSuperAdmin) areas.push("super_admin");
    if (isPartnerMember) areas.push("partner");
    if (tenant) areas.push("ems");

    if (areas.length === 1) {
      if (areas[0] === "super_admin") return <Navigate to="/super-admin" replace />;
      if (areas[0] === "partner") return <Navigate to="/partner" replace />;
    } else if (areas.length > 1) {
      const pref = getAreaPreference();
      const valid = pref && areas.includes(pref) ? pref : null;
      if (valid === "super_admin") return <Navigate to="/super-admin" replace />;
      if (valid === "partner") return <Navigate to="/partner" replace />;
      if (!valid) return <AreaChooser partnerName={partnerName} tenantName={tenant?.name} areas={areas} />;
    }
  }

  if (!onboardingChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <DashboardFilterProvider>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </DashboardFilterProvider>
  );
};

export default Index;
