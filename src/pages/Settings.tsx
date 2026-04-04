import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { BackupSettings } from "@/components/settings/BackupSettings";
import { WeekStartSetting } from "@/components/settings/WeekStartSetting";
import { ManualMetersSetting } from "@/components/settings/ManualMetersSetting";
import { TenantInfoSettings } from "@/components/settings/TenantInfoSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, HardDrive, Building2 } from "lucide-react";

const Settings = () => {
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
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-display font-bold">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("settings.subtitle")}
          </p>
        </header>
        <div className="p-3 md:p-6">
          <Tabs defaultValue="tenant-info">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="tenant-info" className="gap-2">
                <Building2 className="h-4 w-4" />
                {t("settings.tabTenant" as any)}
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-2">
                <Palette className="h-4 w-4" />
                {t("settings.title")}
              </TabsTrigger>
              <TabsTrigger value="backup" className="gap-2">
                <HardDrive className="h-4 w-4" />
                {t("backup.title")}
              </TabsTrigger>
              <TabsTrigger value="api" className="gap-2">
                <Globe className="h-4 w-4" />
                {t("api.title")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="tenant-info">
              <TenantInfoSettings />
            </TabsContent>
            <TabsContent value="branding" className="space-y-6">
              <WeekStartSetting />
              <ManualMetersSetting />
              <BrandingSettings />
            </TabsContent>
            <TabsContent value="backup">
              <BackupSettings />
            </TabsContent>
            <TabsContent value="api">
              <ApiSettings />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Settings;