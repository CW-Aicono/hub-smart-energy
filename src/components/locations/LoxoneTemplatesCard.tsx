import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Puzzle, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface InstalledTemplate {
  id: string;
  template_key: string;
  instance_id: string | null;
  version: string | null;
  last_discovered_at: string | null;
  registry?: {
    label: string | null;
    category: string | null;
    latest_version: string | null;
  } | null;
}

interface LoxoneTemplatesCardProps {
  locationId: string;
}

export const LoxoneTemplatesCard = ({ locationId }: LoxoneTemplatesCardProps) => {
  const { locationIntegrations } = useLocationIntegrations(locationId);
  const loxoneIntegration = locationIntegrations.find(
    (li) => li.is_enabled && li.integration?.type === "loxone",
  );

  const [templates, setTemplates] = useState<InstalledTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("location_loxone_templates")
      .select("id, template_key, instance_id, version, last_discovered_at, registry:loxone_template_registry(label, category, latest_version)")
      .eq("location_id", locationId)
      .order("template_key");
    if (error) {
      toast.error("Templates konnten nicht geladen werden: " + error.message);
    } else {
      setTemplates((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (loxoneIntegration) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loxoneIntegration?.id]);

  const handleDiscover = async () => {
    if (!loxoneIntegration) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("loxone-template-sync", {
        body: { action: "discover", location_integration_id: loxoneIntegration.id },
      });
      if (error) throw error;
      const found = (data as any)?.discovered ?? (data as any)?.count ?? 0;
      toast.success(`Discovery abgeschlossen – ${found} Template-Instanz(en) erkannt`);
      await load();
    } catch (e: any) {
      toast.error("Discovery fehlgeschlagen: " + (e?.message || "Unbekannt"));
    } finally {
      setScanning(false);
    }
  };

  if (!loxoneIntegration) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Loxone-Templates
            {templates.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {templates.length} installiert
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            AICONO-Templates, die lokal auf dem Miniserver laufen. „Neu scannen" liest die
            AICO_*-Bausteine aus <code className="text-xs">LoxAPP3.json</code> ein.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleDiscover} disabled={scanning}>
          <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
          Neu scannen
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Templates entdeckt. Nach dem Einspielen der AICO_*-Bausteine in Loxone Config
            einmal „Neu scannen" ausführen.
          </p>
        ) : (
          <div className="divide-y">
            {templates.map((tpl) => {
              const latest = tpl.registry?.latest_version;
              const outdated = latest && tpl.version && latest !== tpl.version;
              return (
                <div key={tpl.id} className="flex items-center justify-between py-2.5 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {tpl.registry?.label || tpl.template_key}
                      </span>
                      {tpl.instance_id && (
                        <Badge variant="outline" className="text-[10px]">#{tpl.instance_id}</Badge>
                      )}
                      {tpl.registry?.category && (
                        <Badge variant="secondary" className="text-[10px]">{tpl.registry.category}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tpl.template_key}
                      {tpl.last_discovered_at && (
                        <> · erkannt {formatDistanceToNow(new Date(tpl.last_discovered_at), { addSuffix: true, locale: de })}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tpl.version && (
                      <Badge variant={outdated ? "destructive" : "outline"} className="text-[10px]">
                        v{tpl.version}
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
