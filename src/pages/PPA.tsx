import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePpaContracts } from "@/hooks/usePpaContracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, AlertTriangle } from "lucide-react";
import { priceModelLabel } from "@/lib/ppa/priceFormula";
import type { PpaContract, PpaStatus } from "@/lib/ppa/types";

const statusBadge: Record<PpaStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  active: { label: "Aktiv", variant: "default" },
  suspended: { label: "Ausgesetzt", variant: "outline" },
  expired: { label: "Abgelaufen", variant: "destructive" },
  terminated: { label: "Beendet", variant: "destructive" },
};

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function ContractCard({ c }: { c: PpaContract }) {
  const s = statusBadge[c.status];
  const totalDays = Math.max(1, Math.ceil((new Date(c.contract_end).getTime() - new Date(c.contract_start).getTime()) / 86400000));
  const elapsed = Math.max(0, Math.min(totalDays, Math.ceil((Date.now() - new Date(c.contract_start).getTime()) / 86400000)));
  const pct = Math.round((elapsed / totalDays) * 100);
  const remaining = daysUntil(c.contract_end);
  return (
    <Link to={`/ppa/${c.id}`}>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{c.producer_name} → {c.offtaker_name}</CardTitle>
            <Badge variant={s.variant}>{s.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{priceModelLabel(c.price_model)}</span>
            <span>{c.contracted_volume_kwh_pa ? `${c.contracted_volume_kwh_pa.toLocaleString("de-DE")} kWh/a` : "—"}</span>
          </div>
          <div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>{new Date(c.contract_start).toLocaleDateString("de-DE")}</span>
              <span>{remaining > 0 ? `noch ${remaining.toLocaleString("de-DE")} Tage` : "abgelaufen"}</span>
              <span>{new Date(c.contract_end).toLocaleDateString("de-DE")}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

type Filter = "all" | "active" | "expiring" | "draft";

function PpaList({ type }: { type: "onsite" | "offsite" }) {
  const { data: contracts = [], isLoading } = usePpaContracts(type);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (filter === "active") return c.status === "active";
      if (filter === "draft") return c.status === "draft";
      if (filter === "expiring") {
        const d = daysUntil(c.contract_end);
        return c.status === "active" && d > 0 && d <= c.notice_period_days;
      }
      return true;
    });
  }, [contracts, filter]);

  const expiringSoon = contracts.filter((c) => {
    const d = daysUntil(c.contract_end);
    return c.status === "active" && d > 0 && d <= c.notice_period_days;
  });

  return (
    <div className="space-y-4">
      {expiringSoon.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
          <div>
            <strong>{expiringSoon.length.toLocaleString("de-DE")}</strong> Vertrag/Verträge laufen innerhalb der Kündigungsfrist aus.
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(["all", "active", "expiring", "draft"] as Filter[]).map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "all" ? "Alle" : f === "active" ? "Aktiv" : f === "expiring" ? "Auslaufend" : "Entwurf"}
          </Button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Lade…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
            Keine Verträge vorhanden.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => <ContractCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}

export default function PPA() {
  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PPA-Management</h1>
          <p className="text-muted-foreground text-sm">Power Purchase Agreements verwalten</p>
        </div>
        <Button asChild>
          <Link to="/ppa/new"><Plus className="h-4 w-4 mr-2" />Neuen PPA anlegen</Link>
        </Button>
      </div>
      <Tabs defaultValue="onsite">
        <TabsList>
          <TabsTrigger value="onsite">On-site PPAs</TabsTrigger>
          <TabsTrigger value="offsite">Off-site PPAs</TabsTrigger>
        </TabsList>
        <TabsContent value="onsite" className="mt-4"><PpaList type="onsite" /></TabsContent>
        <TabsContent value="offsite" className="mt-4"><PpaList type="offsite" /></TabsContent>
      </Tabs>
    </div>
  );
}
