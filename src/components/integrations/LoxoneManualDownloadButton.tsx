import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2 } from "lucide-react";
import { SNIPPET_BY_KEY } from "@/lib/loxone/snippetsCatalog";
import {
  buildManualSkeleton,
  downloadManualPdf,
  type ManualDoc,
  type ManualImage,
} from "@/lib/loxone/generateManualPdf";

interface Props {
  locationId: string;
  triggerVariant?: "icon" | "button";
}

/**
 * Zeigt eine Liste der auf DIESEM Miniserver-Standort erkannten AICO_-Bausteine
 * und bietet pro Baustein eine PDF-Anleitung zum Download.
 */
export function LoxoneManualDownloadButton({ locationId, triggerVariant = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [installedKeys, setInstalledKeys] = useState<string[]>([]);
  const [manuals, setManuals] = useState<Record<string, ManualDoc>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: installed } = await supabase
        .from("location_loxone_templates")
        .select("template_key")
        .eq("location_id", locationId);
      const keys = Array.from(new Set((installed ?? []).map((r: any) => r.template_key as string)));
      setInstalledKeys(keys);

      if (keys.length > 0) {
        const { data: rows } = await supabase
          .from("loxone_snippet_manuals")
          .select("*")
          .in("template_key", keys);
        const map: Record<string, ManualDoc> = {};
        for (const row of (rows ?? []) as ManualDoc[]) map[row.template_key] = row;
        setManuals(map);
      } else {
        setManuals({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadData();
  }, [open, locationId]);

  const download = (key: string) => {
    const doc = manuals[key];
    if (doc) {
      downloadManualPdf(doc);
      return;
    }
    // Fallback: Wenn Super-Admin noch keine Anleitung gepflegt hat, PDF aus Katalog-Skelett erzeugen
    const skel = buildManualSkeleton(key);
    downloadManualPdf({ ...skel, updated_at: new Date().toISOString() });
  };

  return (
    <>
      {triggerVariant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          title="Bedienungsanleitungen für erkannte Bausteine"
        >
          <FileText className="h-4 w-4" />
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <FileText className="h-3.5 w-3.5 mr-1.5" /> Anleitungen
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Baustein-Anleitungen</DialogTitle>
            <DialogDescription>
              Bedienungsanleitungen (PDF) für die auf diesem Miniserver erkannten AICO_-Bausteine.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Lade…
            </div>
          ) : installedKeys.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Noch keine AICO_-Bausteine auf diesem Miniserver erkannt.
              <br />
              Bitte zuerst das Puzzle-Icon 🧩 zum Scannen nutzen.
            </div>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {installedKeys.map((key) => {
                const snippet = SNIPPET_BY_KEY[key];
                const manual = manuals[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {snippet?.title ?? key}
                        </span>
                        {manual ? (
                          <Badge variant="secondary" className="text-[10px]">v{manual.version}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Entwurf</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground pl-6">{key}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => download(key)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> PDF
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
