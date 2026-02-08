import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Zap, LayoutDashboard, LogOut, User } from "lucide-react";

const DashboardSidebar = () => {
  const { signOut, user } = useAuth();

  return (
    <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 p-6 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
          <Zap className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <span className="text-lg font-display font-bold text-sidebar-foreground">Energy Hub</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground text-sm font-medium">
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </div>
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
