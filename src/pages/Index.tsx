import { useState, useEffect, Suspense } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { DashboardFilterProvider } from "@/hooks/useDashboardFilter";
import { getSupportViewTenantId } from "@/lib/supportView";
import DashboardContent from "./DashboardContent";

const Index = () => {
  const { user, loading, isRecovery } = useAuth();
  const { isSuperAdmin, loading: superAdminLoading } = useSuperAdmin();
  const { tenant, loading: tenantLoading } = useTenant();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // If user is in recovery mode, force them to /set-password
  useEffect(() => {
    if (isRecovery && user) {
      navigate("/set-password", { replace: true });
    }
  }, [isRecovery, user, navigate]);

  useEffect(() => {
    if (!user || onboardingChecked) return;
    // Onboarding-Status hängt am Tenant, nicht am User:
    // Der Wizard wird nur einmal pro Mandant gezeigt (vom Erst-Nutzer).
    if (tenantLoading) return;
    setOnboardingChecked(true);
    if (tenant && !(tenant as any).onboarding_completed) {
      navigate("/getting-started", { replace: true });
    }
  }, [user, onboardingChecked, navigate, tenant, tenantLoading]);

  if (loading || superAdminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Super-Admins have no tenant context — redirect them to their dedicated area,
  // UNLESS they are actively viewing a tenant via Remote-Support (impersonation).
  if (isSuperAdmin && !getSupportViewTenantId()) return <Navigate to="/super-admin" replace />;

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
