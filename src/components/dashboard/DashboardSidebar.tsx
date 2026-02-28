import { useState, useEffect, useMemo, Fragment, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import { useDemoMode, useDemoPath } from "@/contexts/DemoMode";
import { Button } from "@/components/ui/button";
import { MobileHeader } from "@/components/dashboard/MobileSidebar";
import { LayoutDashboard, LogOut, Shield, Settings, Users, ChevronDown, ChevronRight, MapPin, PanelLeftClose, PanelLeft, UserCircle, Key, HelpCircle, Plug, Palette, Database, Gauge, Download, Car, PlugZap, Receipt, Cpu, Activity, Mail, Smartphone, Network, ListChecks, TrendingUp, Home, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { TenantLogo } from "@/components/tenant/TenantLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TranslationKey } from "@/i18n/translations";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  labelKey: TranslationKey;
  children?: { to: string; icon: typeof Users; labelKey: TranslationKey }[];
}

const DashboardSidebar = () => {
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const location = useLocation();
  const { isNavItemVisible } = useModuleGuard();
  const isDemo = useDemoMode();
  const demoPath = useDemoPath();
  const [displayName, setDisplayName] = useState<string | null>(isDemo ? "Demo Benutzer" : null);
  
  const [isTablet, setIsTablet] = useState(() => {
    const w = window.innerWidth;
    return w >= 768 && w < 1280;
  });

  useEffect(() => {
    const mql768 = window.matchMedia("(min-width: 768px)");
    const mql1280 = window.matchMedia("(min-width: 1280px)");
    const check = () => {
      const tablet = mql768.matches && !mql1280.matches;
      setIsTablet(tablet);
      if (tablet) setCollapsed(true);
    };
    mql768.addEventListener("change", check);
    mql1280.addEventListener("change", check);
    return () => {
      mql768.removeEventListener("change", check);
      mql1280.removeEventListener("change", check);
    };
  }, []);

  const [collapsed, setCollapsed] = useState(() => {
    if (isTablet) return true;
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) return stored === "true";
    return false;
  });

  useEffect(() => {
    if (!user || isDemo) return;
    supabase
      .from("profiles")
      .select("contact_person")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setDisplayName(data?.contact_person || null);
      });
  }, [user, isDemo]);

  const [openMenus, setOpenMenus] = useState<string[]>([]);

  useEffect(() => {
    if (!isTablet) {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    }
  }, [collapsed, isTablet]);

  // On tablet, collapse after navigating
  const handleTabletNavClick = useCallback((e?: React.MouseEvent) => {
    if (isTablet) setCollapsed(true);
    if (isDemo && isTablet) setCollapsed(true);
  }, [isTablet, isDemo]);

  // Auto-open parent menu if child is active
  const currentPath = isDemo ? location.pathname.replace(/^\/demo/, "") || "/" : location.pathname;
  useEffect(() => {
    if (currentPath === "/admin" || currentPath === "/roles") {
      setOpenMenus((prev) => prev.includes("/admin") ? prev : [...prev, "/admin"]);
    }
    if (currentPath === "/settings" || currentPath === "/settings/branding" || currentPath === "/settings/email-templates" || currentPath === "/integrations") {
      setOpenMenus((prev) => prev.includes("/settings") ? prev : [...prev, "/settings"]);
    }
   if (currentPath === "/energy-data" || currentPath === "/meters" || currentPath === "/live-values") {
      setOpenMenus((prev) => prev.includes("/energy-data") ? prev : [...prev, "/energy-data"]);
    }
    if (currentPath.startsWith("/charging")) {
      setOpenMenus((prev) => prev.includes("/charging/points") ? prev : [...prev, "/charging/points"]);
    }
  }, [currentPath]);

  const toggleMenu = (to: string) => {
    setOpenMenus((prev) =>
      prev.includes(to) ? prev.filter((m) => m !== to) : [...prev, to]
    );
  };

  const navItems: NavItem[] = [
    { to: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
    { to: "/locations", icon: MapPin, labelKey: "nav.locations" },
    { 
      to: "/energy-data", 
      icon: Database, 
      labelKey: "nav.energyData" as TranslationKey,
      children: [
        { to: "/live-values", icon: Activity, labelKey: "nav.liveValues" as TranslationKey },
        { to: "/meters", icon: Gauge, labelKey: "nav.meters" as TranslationKey },
        { to: "/energy-data", icon: Download, labelKey: "nav.exports" as TranslationKey },
      ]
    },
    {
      to: "/charging/points",
      icon: Car,
      labelKey: "nav.charging" as TranslationKey,
      children: [
        { to: "/charging/points", icon: PlugZap, labelKey: "nav.chargingPoints" as TranslationKey },
        { to: "/charging/billing", icon: Receipt, labelKey: "nav.chargingBilling" as TranslationKey },
        { to: "/charging/app", icon: Smartphone, labelKey: "nav.chargingApp" as TranslationKey },
        { to: "/charging/ocpp-integration", icon: BookOpen, labelKey: "nav.ocppIntegration" as TranslationKey },
      ]
    },
    { to: "/automation", icon: Cpu, labelKey: "nav.multiLocationAutomation" as TranslationKey },
    { to: "/arbitrage", icon: TrendingUp, labelKey: "nav.arbitrageTrading" as TranslationKey },
    { to: "/tenant-electricity", icon: Home, labelKey: "nav.tenantElectricity" as TranslationKey },
    { to: "/network", icon: Network, labelKey: "nav.networkInfrastructure" as TranslationKey },
    { to: "/tasks", icon: ListChecks, labelKey: "nav.tasks" as TranslationKey },
    ...(isAdmin ? [
      { 
        to: "/admin", 
        icon: Shield, 
        labelKey: "nav.userManagement" as TranslationKey,
        children: [
          { to: "/admin", icon: Users, labelKey: "nav.users" as TranslationKey },
          { to: "/roles", icon: Key, labelKey: "nav.rolesAndPermissions" as TranslationKey },
        ]
      },
      { 
        to: "/settings", 
        icon: Settings, 
        labelKey: "nav.settings" as TranslationKey,
        children: [
          { to: "/settings/branding", icon: Palette, labelKey: "nav.branding" as TranslationKey },
          { to: "/settings/email-templates", icon: Mail, labelKey: "nav.emailTemplates" as TranslationKey },
          { to: "/integrations", icon: Plug, labelKey: "nav.integrations" as TranslationKey },
        ]
      },
    ] : []),
    { to: "/help", icon: HelpCircle, labelKey: "nav.helpAndSupport" as TranslationKey },
  ];

  // Filter nav items based on active modules
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

  const userDisplayName = isDemo ? "Demo Benutzer" : (displayName || user?.email || "");
  const userInitials = isDemo ? "DB" : (displayName
    ? displayName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "??");

  const renderNavItem = (item: NavItem) => {
    const isActive = currentPath === item.to;
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openMenus.includes(item.to);
    const isChildActive = hasChildren && item.children?.some((child) => currentPath === child.to);
    const linkTo = (path: string) => demoPath(path);

    if (hasChildren && !collapsed) {
      return (
        <Collapsible key={item.to} open={isOpen} onOpenChange={() => toggleMenu(item.to)}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "flex items-center w-full rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2.5",
                isActive || isChildActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{t(item.labelKey)}</span>
              <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 mt-1 space-y-1">
            {/* Children */}
            {item.children?.map((child) => {
              const isChildItemActive = currentPath === child.to;
              return (
                <NavLink
                  key={child.to}
                  to={linkTo(child.to)}
                  onClick={handleTabletNavClick}
                  className={cn(
                    "flex items-center rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2",
                    isChildItemActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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

    // For collapsed sidebar with children, show dropdown
    if (hasChildren && collapsed) {
      return (
        <DropdownMenu key={item.to}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors justify-center p-2.5 w-full",
                isActive || isChildActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-48 bg-popover">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t(item.labelKey)}</div>
            {item.children?.map((child) => (
              <DropdownMenuItem key={child.to} asChild>
                <NavLink to={linkTo(child.to)} onClick={() => { if (isTablet) setCollapsed(true); }} className="flex items-center gap-2 cursor-pointer">
                  <child.icon className="h-4 w-4" />
                  {t(child.labelKey)}
                </NavLink>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    // Regular nav item
    const linkContent = (
      <NavLink
        to={linkTo(item.to)}
        onClick={handleTabletNavClick}
        className={cn(
          "flex items-center rounded-lg text-sm font-medium transition-colors",
          collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{t(item.labelKey)}</span>}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.to} delayDuration={0}>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-popover">
            {t(item.labelKey)}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.to}>{linkContent}</div>;
  };

  return (
    <Fragment>
      <MobileHeader />
      {/* Backdrop overlay for tablet when sidebar is expanded */}
      {isTablet && !collapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:block hidden"
          onClick={() => setCollapsed(true)}
        />
      )}
      {/* Spacer div to reserve space in flow on tablet (sidebar is fixed) */}
      {isTablet && <div className="hidden md:block w-16 shrink-0" />}
      <aside 
        className={cn(
          "hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen z-40 transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          isTablet ? "fixed top-0 left-0" : "sticky top-0"
        )}
      >
      {/* Logo & Collapse Toggle */}
      <div className={cn(
        "border-b border-sidebar-border flex items-center",
        collapsed ? "p-3 justify-center" : "p-4 justify-between"
      )}>
        {!collapsed && <TenantLogo size="sm" />}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Nav - scrollable */}
      <nav className={cn(
        "flex-1 space-y-1 overflow-y-auto scrollbar-hide",
        collapsed ? "p-2" : "p-4"
      )} style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {filteredNavItems.map(renderNavItem)}
      </nav>

      {/* User section - fixed at bottom */}
      <div className={cn(
        "border-t border-sidebar-border mt-auto",
        collapsed ? "p-2" : "p-4"
      )}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <Button
                variant="ghost"
                size="icon"
                className="w-full h-10 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 px-3 py-6 h-auto text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium truncate">{userDisplayName}</p>
                  <p className="text-xs text-sidebar-foreground/50">
                    {isAdmin ? t("users.admin") : t("users.userRole")}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align={collapsed ? "center" : "end"} 
            side="top" 
            className="w-56 bg-popover"
          >
            <DropdownMenuItem asChild>
              <NavLink to={demoPath("/profile")} className="flex items-center cursor-pointer">
                <UserCircle className="h-4 w-4 mr-2" />
                {t("nav.myProfile")}
              </NavLink>
            </DropdownMenuItem>
            {!isDemo && (
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                {t("nav.logout")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
    </Fragment>
  );
};

export default DashboardSidebar;
