import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Puzzle, RefreshCw, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { downloadGroupPackage } from "@/lib/loxone/snippetDownload";
import { SNIPPET_GROUPS } from "@/lib/loxone/snippetsCatalog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

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
  const [scanning, setScanning] = useState(false);

  const load = async () => {
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
    if (instErr) toast.error("Templates konnten nicht geladen werden: " + instErr.message);
    if (regErr) toast.error("Katalog konnte nicht geladen werden: " + regErr.message);
    setTemplates((instData as any) || []);
    const map: Record<string, RegistryEntry> = {};
    ((regData as any[]) || []).forEach((r) => { map[r.template_key] = r; });
    setRegistry(map);
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
        <div className="flex gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" title="Loxone-Snippet-Pakete inkl. PDF-Kurzanleitung">
                <Download className="h-4 w-4 mr-2" /> Snippet-Pakete
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Gruppe wählen</DropdownMenuLabel>
              {SNIPPET_GROUPS.map((g) => (
                <DropdownMenuItem key={g.key} onClick={() => downloadGroupPackage(g.key)}>
                  <div className="flex flex-col">
                    <span className="text-sm">{g.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {g.snippets.length} Bausteine · {g.zipName}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={handleDiscover} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
            Neu scannen
          </Button>
        </div>
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
