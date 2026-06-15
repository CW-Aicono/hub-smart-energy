import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, LogOut, Briefcase, Users, Receipt, Cpu, ListChecks, Palette, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";

export default function PartnerSidebar() {
  const { user, signOut } = useAuth();
  const { partnerName, partnerLogoUrl, isPartnerAdmin, permissions } = usePartnerAccess();
  const navigate = useNavigate();
  const initials = (partnerName || user?.email || "P").substring(0, 2).toUpperCase();

  const NAV: Array<{ to: string; icon: any; label: string; end?: boolean; show: boolean }> = [
    { to: "/partner", icon: LayoutDashboard, label: "Übersicht", end: true, show: true },
    { to: "/partner/tenants", icon: Building2, label: "Meine Tenants", show: true },
    { to: "/partner/reporting", icon: BarChart3, label: "Reporting", show: isPartnerAdmin || permissions.viewReporting || permissions.viewBilling },
    { to: "/partner/billing", icon: Receipt, label: "Abrechnung", show: isPartnerAdmin || permissions.viewBilling },
    { to: "/partner/branding", icon: Palette, label: "Branding", show: isPartnerAdmin || permissions.manageBranding },
    { to: "/partner/members", icon: Users, label: "Partner-User", show: isPartnerAdmin || permissions.manageMembers },
    { to: "/partner/sales/catalog", icon: Cpu, label: "Geräte-Katalog", show: permissions.manageSalesCatalog },
    { to: "/partner/sales/rules", icon: ListChecks, label: "Auswahl-Regeln", show: permissions.manageSalesCatalog },
    { to: "/sales", icon: Briefcase, label: "Sales Scout", show: permissions.useSalesScout },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 border-r bg-card sticky top-0 h-screen">
      <div className="p-4 border-b flex items-center gap-3">
        {partnerLogoUrl ? (
          <img src={partnerLogoUrl} alt={partnerName ?? "Partner"} className="h-8 w-8 rounded object-contain" />
        ) : (
          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground leading-none">Partner-Portal</p>
          <p className="text-sm font-semibold truncate">{partnerName ?? "AICONO Partner"}</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.filter((i) => i.show).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.email}</p>
          <p className="text-xs text-muted-foreground">{isPartnerAdmin ? "Partner-Admin" : "Partner-User"}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={async () => {
            await signOut();
            navigate("/auth", { replace: true });
          }}
          aria-label="Abmelden"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
