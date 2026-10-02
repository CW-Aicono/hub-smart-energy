import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCommunityDataQuality } from "@/hooks/useCommunityOperations";

export default function DataQualityTab({ communityId }: { communityId: string }) {
  const { data, isLoading } = useCommunityDataQuality(communityId);
  if (isLoading) return <p className="text-muted-foreground">Lade …</p>;
  if (!data) return <p className="text-muted-foreground">Keine Daten verfügbar.</p>;

  const cov = Number(data.coverage_pct ?? 0);
  const tone = cov >= 80 ? "default" : cov >= 50 ? "secondary" : "destructive";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card><CardHeader className="pb-2"><CardDescription>Daten-Abdeckung (7 Tage)</CardDescription></CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{cov.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</div>
          <Badge variant={tone as any} className="mt-2">
            {data.members_with_recent_data.toLocaleString("de-DE")} / {data.members_total.toLocaleString("de-DE")} Mitglieder
          </Badge>
        </CardContent>
      </Card>
      <Card><CardHeader className="pb-2"><CardDescription>Letzter Messwert</CardDescription></CardHeader>
        <CardContent>
          <div className="text-lg">{data.last_reading_at ? new Date(data.last_reading_at).toLocaleString("de-DE") : "—"}</div>
        </CardContent>
      </Card>
      <Card><CardHeader className="pb-2"><CardDescription>Letzte Verteilung</CardDescription></CardHeader>
        <CardContent>
          <div className="text-lg">{data.active_run_at ? new Date(data.active_run_at).toLocaleString("de-DE") : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">{data.assets_total.toLocaleString("de-DE")} Anlage(n)</div>
        </CardContent>
      </Card>
    </div>
  );
}
