import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSAPreferences, SAColorPreset, SAThemeMode } from "@/hooks/useSuperAdminPreferences";
import { useSATranslation } from "@/hooks/useSATranslation";
import { saColorPresetNames, SALanguage } from "@/i18n/superAdminTranslations";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, LogOut, Building2, BarChart3, Receipt, HeadsetIcon,
  ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, Users, ShieldCheck, Shield, Euro,
  Sun, Moon, Monitor, Globe, Palette, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState, useEffect } from "react";

const SA_SIDEBAR_KEY = "sa-sidebar-collapsed";

const LANGUAGE_LABELS: Record<SALanguage, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  pl: "Polski",
};

const PRESET_COLORS: Record<SAColorPreset, string> = {
  default: "bg-emerald-500",
  ocean: "bg-sky-500",
  forest: "bg-green-700",
  sunset: "bg-orange-500",
  lavender: "bg-purple-500",
  slate: "bg-slate-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
};

export default function SuperAdminSidebar() {
  const { signOut, user } = useAuth();
  const { t, language } = useSATranslation();
  const { colorPreset, themeMode, setColorPreset, setThemeMode, setLanguage } = useSAPreferences();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SA_SIDEBAR_KEY) === "true");
  const [openMenus, setOpenMenus] = useState<string[]>([]);

  useEffect(() => { localStorage.setItem(SA_SIDEBAR_KEY, String(collapsed)); }, [collapsed]);

  const navItems = [
    { to: "/super-admin", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/super-admin/tenants", icon: Building2, label: t("nav.tenants") },
    { to: "/super-admin/statistics", icon: BarChart3, label: t("nav.statistics") },
    { to: "/super-admin/billing", icon: Receipt, label: t("nav.billing") },
    { to: "/super-admin/module-pricing", icon: Euro, label: t("nav.module_pricing") },
    {
      to: "/super-admin/users",
      icon: Shield,
      label: t("nav.user_management"),
      children: [
        { to: "/super-admin/users", icon: Users, label: t("nav.users") },
        { to: "/super-admin/roles", icon: ShieldCheck, label: t("nav.roles_permissions") },
      ],
    },
    { to: "/super-admin/support", icon: HeadsetIcon, label: t("nav.support") },
  ];

  // Auto-open parent if child is active
  useEffect(() => {
    if (location.pathname === "/super-admin/users" || location.pathname === "/super-admin/roles") {
      setOpenMenus((prev) => prev.includes("/super-admin/users") ? prev : [...prev, "/super-admin/users"]);
    }
  }, [location.pathname]);

  const toggleMenu = (to: string) => {
    setOpenMenus((prev) => prev.includes(to) ? prev.filter((m) => m !== to) : [...prev, to]);
  };

  const userInitials = user?.email?.substring(0, 2).toUpperCase() ?? "SA";

  const themeModeIcon = themeMode === "dark" ? Moon : themeMode === "light" ? Sun : Monitor;
  const ThemeModeIcon = themeModeIcon;

  return (
    <aside className={cn(
      "hidden md:flex flex-col border-r h-screen sticky top-0 z-30 transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )} style={{
      backgroundColor: `hsl(var(--sa-sidebar-bg))`,
      color: `hsl(var(--sa-sidebar-fg))`,
      borderColor: `hsl(var(--sa-sidebar-border))`,
    }}>
      {/* Header */}
      <div className={cn("border-b flex items-center", collapsed ? "p-3 justify-center" : "p-4 justify-between")} style={{ borderColor: `hsl(var(--sa-sidebar-border))` }}>
        {!collapsed && <span className="font-bold text-sm">{t("nav.super_admin")}</span>}
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-8 w-8 opacity-70 hover:opacity-100">
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "p-2" : "p-4")}>
        {navItems.map((item) => {
          const hasChildren = item.children && item.children.length > 0;
          const isActive = location.pathname === item.to || (item.to !== "/super-admin" && location.pathname.startsWith(item.to));
          const isChildActive = hasChildren && item.children?.some((child) => location.pathname === child.to);
          const isOpen = openMenus.includes(item.to);

          if (hasChildren && !collapsed) {
            return (
              <Collapsible key={item.to} open={isOpen} onOpenChange={() => toggleMenu(item.to)}>
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center w-full rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2.5",
                      isActive || isChildActive
                        ? "text-white"
                        : "opacity-70 hover:opacity-100"
                    )}
                    style={isActive || isChildActive ? { backgroundColor: `hsl(var(--sa-sidebar-accent))` } : {}}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 mt-1 space-y-1">
                  {item.children?.map((child) => {
                    const isChildItemActive = location.pathname === child.to;
                    return (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={cn(
                          "flex items-center rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2",
                          isChildItemActive ? "text-white" : "opacity-70 hover:opacity-100"
                        )}
                        style={isChildItemActive ? { backgroundColor: `hsl(var(--sa-sidebar-accent))` } : {}}
                      >
                        <child.icon className="h-4 w-4 shrink-0" />
                        <span>{child.label}</span>
                      </NavLink>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          }

          if (hasChildren && collapsed) {
            return (
              <DropdownMenu key={item.to}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-colors justify-center p-2.5 w-full",
                      isActive || isChildActive ? "text-white" : "opacity-70 hover:opacity-100"
                    )}
                    style={isActive || isChildActive ? { backgroundColor: `hsl(var(--sa-sidebar-accent))` } : {}}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-48 bg-popover">
                  {item.children?.map((child) => (
                    <DropdownMenuItem key={child.to} asChild>
                      <NavLink to={child.to} className="flex items-center gap-2 cursor-pointer">
                        <child.icon className="h-4 w-4" />
                        {child.label}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                isActive ? "text-white" : "opacity-70 hover:opacity-100"
              )}
              style={isActive ? { backgroundColor: `hsl(var(--sa-sidebar-accent))` } : {}}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.to} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="bg-popover">{item.label}</TooltipContent>
              </Tooltip>
            );
          }
          return <div key={item.to}>{link}</div>;
        })}
      </nav>

      {/* User + Settings */}
      <div className={cn("border-t mt-auto", collapsed ? "p-2" : "p-4")} style={{ borderColor: `hsl(var(--sa-sidebar-border))` }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-full h-10 opacity-70 hover:opacity-100">
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs" style={{ backgroundColor: `hsl(var(--sa-primary))`, color: `hsl(var(--sa-primary-foreground))` }}>{userInitials}</AvatarFallback></Avatar>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover">{user?.email}</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" className="w-full justify-start gap-3 px-3 py-6 h-auto opacity-70 hover:opacity-100">
                <Avatar className="h-8 w-8"><AvatarFallback className="text-xs" style={{ backgroundColor: `hsl(var(--sa-primary))`, color: `hsl(var(--sa-primary-foreground))` }}>{userInitials}</AvatarFallback></Avatar>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                  <p className="text-xs opacity-50">{t("nav.super_admin")}</p>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align={collapsed ? "center" : "end"} side="top" className="w-64 bg-popover">
            {/* Color Preset */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="h-4 w-4 mr-2" />
                {t("settings.color_preset")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                {(Object.keys(PRESET_COLORS) as SAColorPreset[]).map((preset) => (
                  <DropdownMenuItem key={preset} onClick={() => setColorPreset(preset)} className="gap-2">
                    <span className={cn("h-3 w-3 rounded-full shrink-0", PRESET_COLORS[preset])} />
                    {saColorPresetNames[preset]?.[language] ?? preset}
                    {colorPreset === preset && <Check className="h-3 w-3 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Theme Mode */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ThemeModeIcon className="h-4 w-4 mr-2" />
                {t("settings.theme_mode")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                {([
                  { mode: "light" as SAThemeMode, icon: Sun, label: t("settings.light") },
                  { mode: "dark" as SAThemeMode, icon: Moon, label: t("settings.dark") },
                  { mode: "system" as SAThemeMode, icon: Monitor, label: t("settings.system") },
                ]).map(({ mode, icon: Icon, label }) => (
                  <DropdownMenuItem key={mode} onClick={() => setThemeMode(mode)} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                    {themeMode === mode && <Check className="h-3 w-3 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Language */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Globe className="h-4 w-4 mr-2" />
                {t("settings.language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                {(Object.entries(LANGUAGE_LABELS) as [SALanguage, string][]).map(([lang, label]) => (
                  <DropdownMenuItem key={lang} onClick={() => setLanguage(lang)} className="gap-2">
                    {label}
                    {language === lang && <Check className="h-3 w-3 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" /> {t("nav.sign_out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
