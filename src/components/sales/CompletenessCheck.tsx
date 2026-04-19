import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Issue {
  severity: "warning" | "info";
  message: string;
  fix?: () => Promise<void>;
  fixLabel?: string;
}

interface Props {
  projectId: string;
  onFixed: () => void;
}

export function CompletenessCheck({ projectId, onFixed }: Props) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState<number | null>(null);

  const analyse = async () => {
    setLoading(true);
    const found: Issue[] = [];

    const { data: dists } = await supabase
      .from("sales_distributions").select("id").eq("project_id", projectId);
    const distIds = (dists ?? []).map((d) => d.id);
    if (distIds.length === 0) {
      setIssues([]); setLoading(false); return;
    }
    const { data: pts } = await supabase
      .from("sales_measurement_points").select("id").in("distribution_id", distIds);
    const ptIds = (pts ?? []).map((p) => p.id);
    if (ptIds.length === 0) {
      setIssues([]); setLoading(false); return;
    }

    const { data: recs } = await supabase
      .from("sales_recommended_devices")
      .select("id, device_catalog_id, geraete_klasse, parent_recommendation_id, measurement_point_id, device_catalog:device_catalog_id(geraete_klasse, benoetigt_klassen, hersteller, modell)")
      .in("measurement_point_id", ptIds)
      .eq("ist_alternativ", false);

    const allRecs = (recs ?? []) as any[];
    const allClasses = new Set<string>(
      allRecs.map((r) => r.device_catalog?.geraete_klasse ?? r.geraete_klasse).filter(Boolean),
    );

    // Per-main-device required-class check
    for (const r of allRecs) {
      if (r.parent_recommendation_id) continue;
      const required = (r.device_catalog?.benoetigt_klassen ?? []) as string[];
      if (!required.length) continue;
      const childKlassen = new Set(
        allRecs
          .filter((c) => c.parent_recommendation_id === r.id)
          .map((c) => c.device_catalog?.geraete_klasse ?? c.geraete_klasse),
      );
      for (const need of required) {
        if (!childKlassen.has(need)) {
          found.push({
            severity: "warning",
            message: `${r.device_catalog?.hersteller} ${r.device_catalog?.modell} benötigt ein "${need}" – nicht ausgewählt.`,
          });
        }
      }
    }

    // Network switch check: >4 IP-devices but no switch
    const ipDevices = allRecs.filter((r) =>
      ["gateway", "router"].includes(r.device_catalog?.geraete_klasse ?? r.geraete_klasse),
    ).length;
    if (ipDevices > 4 && !allClasses.has("network_switch")) {
      found.push({
        severity: "info",
        message: `${ipDevices} IP-Geräte aber kein Netzwerk-Switch – empfohlen ab >4 Ports.`,
      });
    }

    // Gateway without power supply (global)
    const hasGateway = allClasses.has("gateway");
    const hasPSU = allClasses.has("power_supply");
    if (hasGateway && !hasPSU) {
      found.push({
        severity: "warning",
        message: "Gateway ohne Netzteil im Angebot.",
      });
    }

    setIssues(found);
    setLoading(false);
  };

  useEffect(() => { analyse(); }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Prüfe Vollständigkeit…
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
        <CheckCircle2 className="h-4 w-4" />
        Vollständigkeitsprüfung bestanden
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium flex items-center gap-1">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Vollständigkeitsprüfung ({issues.length})
      </div>
      {issues.map((iss, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
            iss.severity === "warning"
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-muted bg-muted/30"
          }`}
        >
          <AlertTriangle
            className={`h-4 w-4 mt-0.5 shrink-0 ${
              iss.severity === "warning" ? "text-amber-500" : "text-muted-foreground"
            }`}
          />
          <div className="flex-1">{iss.message}</div>
        </div>
      ))}
    </div>
  );
}
