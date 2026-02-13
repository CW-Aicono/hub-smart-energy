import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { EmailTemplateSettings } from "@/components/settings/EmailTemplateSettings";

const EmailTemplates = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { t } = useTranslation();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-display font-bold">Mailvorlagen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            E-Mail-Vorlagen für automatische Benachrichtigungen verwalten
          </p>
        </header>
        <div className="p-6 space-y-6">
          <EmailTemplateSettings />
        </div>
      </main>
    </div>
  );
};

export default EmailTemplates;
