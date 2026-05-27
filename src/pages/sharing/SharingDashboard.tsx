import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Download } from "lucide-react";
import { SharingLayout } from "@/components/sharing/SharingLayout";
import { SharingMemberGuard } from "@/components/sharing/SharingMemberGuard";
import { useMyMembership } from "@/hooks/useMyMembership";
import { useMyAllocations } from "@/hooks/useMyAllocations";

const fmt = (n: number, digits = 1) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function DashboardContent() {
  const { data } = useMyMembership();
  const member = data?.active;
  const { data: alloc, isLoading } = useMyAllocations(member?.id);

  useEffect(() => {
    document.title = "Übersicht — Meine Energie-Community";
  }, []);

  const monthLabel = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <SharingLayout title={`Hallo${member?.display_name ? `, ${member.display_name}` : ""}`}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Eingebrachte Leistung</div>
          <div className="text-2xl font-semibold mt-1">
            {member?.share_kw != null ? fmt(member.share_kw, 1) : "—"}{" "}
            <span className="text-sm text-muted-foreground">kW</span>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Heute alloziert</div>
          <div className="text-2xl font-semibold mt-1">
            {alloc ? fmt(alloc.todayTotalKwh, 1) : "—"}{" "}
            <span className="text-sm text-muted-foreground">kWh</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Bezogen ({monthLabel})</div>
          <div className="text-lg font-semibold mt-1">
            {alloc ? fmt(alloc.monthAllocatedKwh, 1) : "—"}{" "}
            <span className="text-xs text-muted-foreground">kWh</span>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Eingespeist ({monthLabel})</div>
          <div className="text-lg font-semibold mt-1">
            {alloc ? fmt(alloc.monthFeedInKwh, 1) : "—"}{" "}
            <span className="text-xs text-muted-foreground">kWh</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm font-medium mb-2">Tagesverlauf (heute)</div>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
            Lade Daten …
          </div>
        ) : !alloc?.todayHourly.some((p) => p.kw > 0) ? (
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            Noch keine Allokationsdaten für heute vorhanden.
          </div>
        ) : (
          <div className="h-48 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={alloc.todayHourly} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="kwGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={3}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => fmt(v, 1)}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${fmt(v, 2)} kWh`, "Allokation"]}
                  labelFormatter={(l) => `Uhrzeit ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="kw"
                  stroke="hsl(var(--primary))"
                  fill="url(#kwGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-4 text-center">
        <Link
          to="/mein-sharing/install"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Download className="h-3.5 w-3.5" /> App auf Handy installieren
        </Link>
      </div>
    </SharingLayout>
  );
}

export default function SharingDashboard() {
  return (
    <SharingMemberGuard>
      <DashboardContent />
    </SharingMemberGuard>
  );
}
