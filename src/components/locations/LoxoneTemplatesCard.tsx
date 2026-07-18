// Read-only Status-Karte für erkannte AICO_-Bausteine auf dem Miniserver.
// Discovery-Scan läuft ausschließlich über das Puzzle-Icon auf der
// Miniserver-Integrationskachel (IntegrationCard). Snippet-Downloads gibt es
// nicht mehr — Bausteine werden zentral via Loxone Multiplikator-Projekt
// ausgerollt (siehe Super-Admin → Loxone-Templates → Master-Projekt).

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Puzzle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface InstalledTemplate {
  id: string;
  template_key: string;
  instance_id: string | null;
  installed_version: string | null;
  last_seen_at: string | null;
  discovered_at: string | null;
}

interface RegistryEntry {
  template_key: string;
  title: string;
  category: string;
  version: string;
}

interface LoxoneTemplatesCardProps {
  locationId: string;
}

export const LoxoneTemplatesCard = ({ locationId }: LoxoneTemplatesCardProps) => {
  const { locationIntegrations } = useLocationIntegrations(locationId);
  const loxoneIntegration = locationIntegrations.find(
    (li) =>
      li.is_enabled &&
      (li.integration?.type === "loxone" || li.integration?.type === "loxone_miniserver"),
  );

  const [templates, setTemplates] = useState<InstalledTemplate[]>([]);
  const [registry, setRegistry] = useState<Record<string, RegistryEntry>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loxoneIntegration) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: instData, error: instErr }, { data: regData, error: regErr }] = await Promise.all([
        supabase
          .from("location_loxone_templates")
          .select("id, template_key, instance_id, installed_version, last_seen_at, discovered_at")
          .eq("location_id", locationId)
          .order("template_key"),
        supabase
          .from("loxone_template_registry")
          .select("template_key, title, category, version")
          .eq("is_active", true),
      ]);
      if (cancelled) return;
      if (instErr) toast.error("Templates konnten nicht geladen werden: " + instErr.message);
      if (regErr) toast.error("Katalog konnte nicht geladen werden: " + regErr.message);
      setTemplates((instData as any) || []);
      const map: Record<string, RegistryEntry> = {};
      ((regData as any[]) || []).forEach((r) => { map[r.template_key] = r; });
      setRegistry(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loxoneIntegration?.id, locationId]);

  // Karte nur einblenden, wenn a) eine Loxone-Integration existiert UND
  // b) bereits mindestens ein AICO_-Baustein erkannt wurde. Ansonsten zeigt
  // die Miniserver-Kachel selbst schon den Scan-Button (Puzzle-Icon).
  if (!loxoneIntegration) return null;
  if (!loading && templates.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Puzzle className="h-5 w-5" />
          Loxone-Bausteine
          {templates.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {templates.length} erkannt
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Auf diesem Miniserver aktive AICO_-Bausteine aus dem AICONO Multiplikator-Projekt.
          Ein erneuter Scan läuft über das Puzzle-Icon auf der Miniserver-Kachel unter „Integrationen".
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <div className="divide-y">
            {templates.map((tpl) => {
              const reg = registry[tpl.template_key];
              const latest = reg?.version;
              const installed = tpl.installed_version;
              const outdated = !!(latest && installed && latest !== installed);
              const seenAt = tpl.last_seen_at || tpl.discovered_at;
              return (
                <div key={tpl.id} className="flex items-center justify-between py-2.5 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {reg?.title || tpl.template_key}
                      </span>
                      {tpl.instance_id && (
                        <Badge variant="outline" className="text-[10px]">#{tpl.instance_id}</Badge>
                      )}
                      {reg?.category && (
                        <Badge variant="secondary" className="text-[10px]">{reg.category}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tpl.template_key}
                      {seenAt && (
                        <> · erkannt {formatDistanceToNow(new Date(seenAt), { addSuffix: true, locale: de })}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {installed && (
                      <Badge variant={outdated ? "destructive" : "outline"} className="text-[10px]">
                        v{installed}
                      </Badge>
                    )}
                    {outdated ? (
                      <Badge variant="destructive" className="text-[10px]">Update v{latest}</Badge>
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
