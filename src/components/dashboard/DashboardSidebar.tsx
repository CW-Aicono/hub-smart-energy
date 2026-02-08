import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, User, Shield, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { TenantLogo } from "@/components/tenant/TenantLogo";

const DashboardSidebar = () => {
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const location = useLocation();

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    ...(isAdmin ? [
      { to: "/admin", icon: Shield, label: "Admin" },
      { to: "/settings", icon: Settings, label: "Einstellungen" },
    ] : []),
  ];

  return (
    <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <TenantLogo />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/70">
          <User className="h-4 w-4" />
          <span className="truncate">{user?.email}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Abmelden
        </Button>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
