import { useState, useEffect, lazy, Suspense } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTranslation } from "@/hooks/useTranslation";
import { DashboardFilterProvider } from "@/hooks/useDashboardFilter";

// Heavy dashboard content is lazy-loaded – not fetched until user is authenticated
const DashboardContent = lazy(() => import("./DashboardContent"));

const Index = () => {
  const { user, loading, isRecovery } = useAuth();
  const { isSuperAdmin, loading: superAdminLoading } = useSuperAdmin();
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
    const checkOnboarding = async () => {
      const { data } = await (await import("@/integrations/supabase/client")).supabase
        .from("user_preferences")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      setOnboardingChecked(true);
      if (data && !(data as any).onboarding_completed) {
        navigate("/getting-started", { replace: true });
      }
    };
    checkOnboarding();
  }, [user, onboardingChecked, navigate]);

  if (loading || superAdminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Super-Admins have no tenant context — redirect them to their dedicated area
  if (isSuperAdmin) return <Navigate to="/super-admin" replace />;

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
