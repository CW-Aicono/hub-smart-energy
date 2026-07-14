import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useTenant } from "@/hooks/useTenant";
import { useTenantModules } from "@/hooks/useTenantModules";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { BackupSettings } from "@/components/settings/BackupSettings";
import { WeekStartSetting } from "@/components/settings/WeekStartSetting";
import { ManualMetersSetting } from "@/components/settings/ManualMetersSetting";
import { AutoLogoutSetting } from "@/components/settings/AutoLogoutSetting";
import { TenantInfoSettings } from "@/components/settings/TenantInfoSettings";
import { WidgetDesigner } from "@/components/settings/WidgetDesigner";
import { BoardThemesSettings } from "@/components/settings/BoardThemesSettings";
import { TaskSettings } from "@/components/settings/TaskSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, HardDrive, Building2, LayoutGrid, LayoutDashboard, ListChecks } from "lucide-react";

const Settings = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { tenant } = useTenant();
  const { isModuleEnabled } = useTenantModules(tenant?.id ?? null);
  const cLevelEnabled = isModuleEnabled("c_level_dashboard");
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
              <TabsTrigger value="widget-designer" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                Widget-Designer
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2">
                <ListChecks className="h-4 w-4" />
                Aufgaben
              </TabsTrigger>
              {cLevelEnabled && (
                <TabsTrigger value="board-themes" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  C-Level Dashboard
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="tenant-info">
              <TenantInfoSettings />
            </TabsContent>
            <TabsContent value="branding" className="space-y-6">
              <WeekStartSetting />
              <AutoLogoutSetting />
              <ManualMetersSetting />
              <BrandingSettings />
            </TabsContent>
            <TabsContent value="backup">
              <BackupSettings />
            </TabsContent>
            <TabsContent value="widget-designer">
              <WidgetDesigner />
            </TabsContent>
            <TabsContent value="tasks">
              <TaskSettings />
            </TabsContent>
            {cLevelEnabled && (
              <TabsContent value="board-themes">
                <BoardThemesSettings />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Settings;
