import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useDemoMode, useDemoPath } from "@/contexts/DemoMode";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TenantLogo } from "@/components/tenant/TenantLogo";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, LogOut, Shield, Settings, Users, ChevronRight,
  MapPin, UserCircle, Key, HelpCircle, Plug, Palette, Database, Gauge, Download,
  Car, PlugZap, Receipt, Cpu, Activity, Mail, Smartphone, Network, ListChecks,
  TrendingUp, Home, Menu,
} from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TranslationKey } from "@/i18n/translations";
import { useMemo } from "react";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  labelKey: TranslationKey;
  children?: { to: string; icon: typeof Users; labelKey: TranslationKey }[];
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const location = useLocation();
  const { isNavItemVisible } = useModuleGuard();
  const isDemo = useDemoMode();
  const demoPath = useDemoPath();
  const [openMenus, setOpenMenus] = useState<string[]>([]);

  const toggleMenu = (to: string) => {
    setOpenMenus((prev) =>
      prev.includes(to) ? prev.filter((m) => m !== to) : [...prev, to]
    );
  };

  const navItems: NavItem[] = [
    { to: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
    { to: "/locations", icon: MapPin, labelKey: "nav.locations" },
    {
      to: "/energy-data", icon: Database, labelKey: "nav.energyData" as TranslationKey,
      children: [
        { to: "/live-values", icon: Activity, labelKey: "nav.liveValues" as TranslationKey },
        { to: "/meters", icon: Gauge, labelKey: "nav.meters" as TranslationKey },
        { to: "/energy-data", icon: Download, labelKey: "nav.exports" as TranslationKey },
      ]
    },
    {
      to: "/charging/points", icon: Car, labelKey: "nav.charging" as TranslationKey,
      children: [
        { to: "/charging/points", icon: PlugZap, labelKey: "nav.chargingPoints" as TranslationKey },
        { to: "/charging/billing", icon: Receipt, labelKey: "nav.chargingBilling" as TranslationKey },
        { to: "/charging/app", icon: Smartphone, labelKey: "nav.chargingApp" as TranslationKey },
      ]
    },
    { to: "/automation", icon: Cpu, labelKey: "nav.multiLocationAutomation" as TranslationKey },
    { to: "/arbitrage", icon: TrendingUp, labelKey: "nav.arbitrageTrading" as TranslationKey },
    { to: "/copilot", icon: Sparkles, labelKey: "nav.copilot" as TranslationKey },
    { to: "/tenant-electricity", icon: Home, labelKey: "nav.tenantElectricity" as TranslationKey },
    { to: "/network", icon: Network, labelKey: "nav.networkInfrastructure" as TranslationKey },
    { to: "/tasks", icon: ListChecks, labelKey: "nav.tasks" as TranslationKey },
    ...(isAdmin ? [
      {
        to: "/admin", icon: Shield, labelKey: "nav.userManagement" as TranslationKey,
        children: [
          { to: "/admin", icon: Users, labelKey: "nav.users" as TranslationKey },
          { to: "/roles", icon: Key, labelKey: "nav.rolesAndPermissions" as TranslationKey },
        ]
      },
      {
        to: "/settings", icon: Settings, labelKey: "nav.settings" as TranslationKey,
        children: [
          { to: "/settings/branding", icon: Palette, labelKey: "nav.branding" as TranslationKey },
          { to: "/settings/email-templates", icon: Mail, labelKey: "nav.emailTemplates" as TranslationKey },
          { to: "/integrations", icon: Plug, labelKey: "nav.integrations" as TranslationKey },
        ]
      },
    ] : []),
    { to: "/help", icon: HelpCircle, labelKey: "nav.helpAndSupport" as TranslationKey },
  ];

  const filteredNavItems = useMemo(() => {
    return navItems
      .filter((item) => isNavItemVisible(item.to))
      .map((item) => {
        if (item.children) {
          const filteredChildren = item.children.filter((child) => isNavItemVisible(child.to));
          if (filteredChildren.length === 0) return null;
          return { ...item, children: filteredChildren };
        }
        return item;
      })
      .filter(Boolean) as NavItem[];
  }, [navItems, isNavItemVisible]);

  const userInitials = isDemo ? "DB" : (user?.email?.substring(0, 2).toUpperCase() ?? "??");
  const currentPath = isDemo ? location.pathname.replace(/^\/demo/, "") || "/" : location.pathname;

  return (
    <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b bg-sidebar px-3 py-2">
      <TenantLogo size="sm" />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-sidebar-foreground">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <div className="border-b border-sidebar-border p-4">
            <TenantLogo size="sm" />
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1" style={{ maxHeight: "calc(100vh - 140px)" }}>
            {filteredNavItems.map((item) => {
              const isActive = currentPath === item.to;
              const hasChildren = item.children && item.children.length > 0;
              const isOpen = openMenus.includes(item.to);
              const isChildActive = hasChildren && item.children?.some((child) => currentPath === child.to);
              const linkTo = (path: string) => demoPath(path);

              if (hasChildren) {
                return (
                  <Collapsible key={item.to} open={isOpen} onOpenChange={() => toggleMenu(item.to)}>
                    <CollapsibleTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center w-full rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2.5",
                          isActive || isChildActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">{t(item.labelKey)}</span>
                        <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4 mt-1 space-y-1">
                      {item.children?.map((child) => {
                        const isChildItemActive = currentPath === child.to;
                        return (
                          <NavLink
                            key={child.to}
                            to={linkTo(child.to)}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-center rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2",
                              isChildItemActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                            )}
                          >
                            <child.icon className="h-4 w-4 shrink-0" />
                            <span>{t(child.labelKey)}</span>
                          </NavLink>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={linkTo(item.to)}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2.5",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              );
            })}
          </nav>
          {/* User footer */}
          <div className="border-t border-sidebar-border p-3 mt-auto">
            {isDemo ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                    DB
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">Demo Benutzer</span>
              </div>
            ) : (
              <>
                <NavLink
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{user?.email}</span>
                </NavLink>
                <button
                  onClick={() => { setOpen(false); signOut(); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 w-full"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{t("nav.logout")}</span>
                </button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
