import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Briefcase, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";

interface Stats {
  tenants: number;
  members: number;
}

export default function PartnerDashboard() {
  const { partnerId, partnerName } = usePartnerAccess();
  const [stats, setStats] = useState<Stats>({ tenants: 0, members: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partnerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [tenantsRes, membersRes] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
        supabase.from("partner_members").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
      ]);
      if (cancelled) return;
      setStats({
        tenants: tenantsRes.count ?? 0,
        members: membersRes.count ?? 0,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const cards = [
    { label: "Eigene Tenants", value: stats.tenants, icon: Building2 },
    { label: "Partner-User", value: stats.members, icon: Users },
    { label: "Sales-Projekte", value: "—", icon: Briefcase },
    { label: "Offene Abrechnung", value: "—", icon: Receipt },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{partnerName ?? "Partner-Portal"}</h1>
        <p className="text-muted-foreground">Übersicht über deine Tenants und Aktivitäten</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{loading ? "…" : c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}
