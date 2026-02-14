import { useState, useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, Shield, Settings, Users, ChevronDown, ChevronRight, MapPin, PanelLeftClose, PanelLeft, UserCircle, Key, HelpCircle, Plug, Palette, Database, Gauge, Download, Car, PlugZap, Receipt, Cpu, Activity, Mail, Smartphone, Network } from "lucide-react";
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
  
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === "true";
  });

  const [openMenus, setOpenMenus] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Auto-open parent menu if child is active
  useEffect(() => {
    if (location.pathname === "/admin" || location.pathname === "/roles") {
      setOpenMenus((prev) => prev.includes("/admin") ? prev : [...prev, "/admin"]);
    }
    if (location.pathname === "/settings" || location.pathname === "/settings/branding" || location.pathname === "/settings/email-templates" || location.pathname === "/integrations") {
      setOpenMenus((prev) => prev.includes("/settings") ? prev : [...prev, "/settings"]);
    }
   if (location.pathname === "/energy-data" || location.pathname === "/meters" || location.pathname === "/live-values") {
      setOpenMenus((prev) => prev.includes("/energy-data") ? prev : [...prev, "/energy-data"]);
    }
    if (location.pathname.startsWith("/charging")) {
      setOpenMenus((prev) => prev.includes("/charging/points") ? prev : [...prev, "/charging/points"]);
    }
  }, [location.pathname]);

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
      ]
    },
    { to: "/automation", icon: Cpu, labelKey: "nav.multiLocationAutomation" as TranslationKey },
    { to: "/network", icon: Network, labelKey: "nav.networkInfrastructure" as TranslationKey },
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

  const userInitials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "??";

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.to;
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openMenus.includes(item.to);
    const isChildActive = hasChildren && item.children?.some((child) => location.pathname === child.to);

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
              const isChildItemActive = location.pathname === child.to;
              return (
                <NavLink
                  key={child.to}
                  to={child.to}
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
            {item.children?.map((child) => (
              <DropdownMenuItem key={child.to} asChild>
                <NavLink to={child.to} className="flex items-center gap-2 cursor-pointer">
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
        to={item.to}
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
    <aside 
      className={cn(
        "hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0 z-30 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
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
                  <p className="text-sm font-medium truncate">{user?.email}</p>
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
              <a href="/profile" className="flex items-center cursor-pointer">
                <UserCircle className="h-4 w-4 mr-2" />
                {t("nav.myProfile")}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              {t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
