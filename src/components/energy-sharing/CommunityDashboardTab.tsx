import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCommunityMembers, useCommunityAssets, useCommunityTariffs } from "@/hooks/useEnergyCommunities";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

const STATUS_LABELS: Record<string, string> = {
  invited: "Eingeladen",
  pending_idents: "Wartet auf IDs",
  pending_msb: "Wartet auf MSB",
  active: "Aktiv",
  suspended: "Gesperrt",
  left: "Ausgetreten",
  pending: "Wartend",
};

const STATUS_COLORS: Record<string, string> = {
  invited: "hsl(220 70% 60%)",
  pending_idents: "hsl(38 90% 55%)",
  pending_msb: "hsl(28 90% 50%)",
  active: "hsl(152 55% 42%)",
  suspended: "hsl(0 70% 55%)",
  left: "hsl(220 10% 55%)",
  pending: "hsl(220 30% 55%)",
};

const fmt = (n: number, frac = 0) =>
  n.toLocaleString("de-DE", { maximumFractionDigits: frac, minimumFractionDigits: frac });

export default function CommunityDashboardTab({ communityId }: { communityId: string }) {
  const { members } = useCommunityMembers(communityId);
  const { assets } = useCommunityAssets(communityId);
  const { tariffs } = useCommunityTariffs(communityId);

  const { data: signatureCount = 0 } = useQuery({
    queryKey: ["community-signatures-count", communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_member_signatures")
        .select("member_id")
        .eq("community_id", communityId);
      if (error) throw error;
      const unique = new Set((data ?? []).map((r: any) => r.member_id));
      return unique.size;
    },
  });

  const stats = useMemo(() => {
    const active = members.filter((m) => m.status === "active").length;
    const totalKw = assets.reduce((s, a) => s + Number(a.capacity_kw || 0), 0);
    const securedShare = members
      .filter((m) => m.status === "active")
      .reduce((s, m) => s + Number(m.share_kw || 0), 0);
    return { active, total: members.length, totalKw, securedShare };
  }, [members, assets]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    members.forEach((m) => {
      counts[m.status] = (counts[m.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, value]) => ({
      status,
      label: STATUS_LABELS[status] ?? status,
      value,
    }));
  }, [members]);

  const funnelData = useMemo(() => {
    const counts = {
      invited: 0,
      pending_idents: 0,
      pending_msb: 0,
      active: 0,
    };
    members.forEach((m) => {
      if (m.status in counts) (counts as any)[m.status] += 1;
      // active als Endstufe immer mitzählen
    });
    return [
      { stage: "Eingeladen", count: counts.invited + counts.pending_idents + counts.pending_msb + counts.active },
      { stage: "IDs erfasst", count: counts.pending_msb + counts.active },
      { stage: "MSB bereit", count: counts.active },
      { stage: "Aktiv", count: counts.active },
    ];
  }, [members]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Mitglieder (aktiv / gesamt)</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats.active)} <span className="text-sm text-muted-foreground">/ {fmt(stats.total)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Anlagen</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(assets.length)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Installierte Leistung</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(stats.totalKw, 1)} kW</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gesicherter Anteil (aktive)</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(stats.securedShare, 2)} kW</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Aktive Tarife</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(tariffs.length)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Unterzeichnete Verträge</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(signatureCount)}</div></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Status-Verteilung</CardTitle></CardHeader>
          <CardContent className="h-72">
            {statusData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Noch keine Mitglieder.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(e) => `${e.label}: ${fmt(Number(e.value))}`}
                  >
                    {statusData.map((s) => (
                      <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "hsl(220 10% 55%)"} />
                    ))}
                  </Pie>
                  <ReTooltip formatter={(v: any) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Onboarding-Funnel</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => fmt(Number(v))} />
                <YAxis type="category" dataKey="stage" width={110} />
                <ReTooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
                <Bar dataKey="count" name="Mitglieder" fill="hsl(186 65% 45%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
