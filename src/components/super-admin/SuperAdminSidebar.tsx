import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, LogOut, Building2, BarChart3, Receipt, HeadsetIcon,
  ChevronDown, PanelLeftClose, PanelLeft, Users, ShieldCheck, Map,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";

const SA_SIDEBAR_KEY = "sa-sidebar-collapsed";

const navItems = [
  { to: "/super-admin", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/super-admin/tenants", icon: Building2, label: "Mandanten" },
  { to: "/super-admin/users", icon: Users, label: "Benutzer" },
  { to: "/super-admin/roles", icon: ShieldCheck, label: "Rollen & Rechte" },
  { to: "/super-admin/map", icon: Map, label: "Karte" },
  { to: "/super-admin/statistics", icon: BarChart3, label: "Statistiken" },
  { to: "/super-admin/billing", icon: Receipt, label: "Abrechnung" },
  { to: "/super-admin/support", icon: HeadsetIcon, label: "Support" },
];

export default function SuperAdminSidebar() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SA_SIDEBAR_KEY) === "true");

  useEffect(() => { localStorage.setItem(SA_SIDEBAR_KEY, String(collapsed)); }, [collapsed]);

  const userInitials = user?.email?.substring(0, 2).toUpperCase() ?? "SA";

  return (
    <aside className={cn(
      "hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0 transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className={cn("border-b border-sidebar-border flex items-center", collapsed ? "p-3 justify-center" : "p-4 justify-between")}>
        {!collapsed && <span className="font-bold text-sm text-sidebar-foreground">Super-Admin</span>}
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50">
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "p-2" : "p-4")}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || (item.to !== "/super-admin" && location.pathname.startsWith(item.to));
          const link = (
            <NavLink
              key={item.to}
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

      {/* User */}
      <div className={cn("border-t border-sidebar-border mt-auto", collapsed ? "p-2" : "p-4")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-full h-10 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50">
                    <Avatar className="h-8 w-8"><AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{userInitials}</AvatarFallback></Avatar>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover">{user?.email}</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" className="w-full justify-start gap-3 px-3 py-6 h-auto text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50">
                <Avatar className="h-8 w-8"><AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{userInitials}</AvatarFallback></Avatar>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                  <p className="text-xs text-sidebar-foreground/50">Super-Admin</p>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align={collapsed ? "center" : "end"} side="top" className="w-56 bg-popover">
            <DropdownMenuItem asChild>
              <a href="/" className="cursor-pointer">← Zum Kunden-Dashboard</a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" /> Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
