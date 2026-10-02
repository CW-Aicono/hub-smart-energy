import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Save, Trash2, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Draft {
  id: string;
  report_year: number;
  profile_code: string | null;
  texts: Record<string, string>;
  updated_at: string;
}

interface Props {
  tenantId?: string;
  onOpen: (year: number) => void;
}

export function DraftsList({ tenantId, onOpen }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("energy_report_drafts")
      .select("id, report_year, profile_code, texts, updated_at")
      .eq("tenant_id", tenantId)
      .order("report_year", { ascending: false });
    if (!error) setDrafts((data ?? []) as Draft[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const remove = async (id: string) => {
    if (!confirm("Entwurf wirklich löschen?")) return;
    const { error } = await supabase.from("energy_report_drafts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Entwurf gelöscht");
      load();
    }
  };

  const sectionsCount = (t: Record<string, string>) =>
    ["vorwort", "einleitung", "ausblick"].filter((k) => t?.[k]?.trim()).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Save className="h-5 w-5" />
          Entwürfe
        </CardTitle>
        <CardDescription>
          Zwischengespeicherte Berichtstexte je Berichtsjahr. Öffnen Sie einen Entwurf, um ihn weiter zu bearbeiten oder als PDF zu finalisieren.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Noch keine Entwürfe gespeichert. Generieren Sie KI-Texte in der Vorschau und klicken Sie auf „Entwurf speichern".
          </p>
        ) : (
          <div className="space-y-3">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Berichtsjahr {d.report_year}</p>
                  <p className="text-sm text-muted-foreground">
                    {sectionsCount(d.texts)} von 3 Abschnitten · zuletzt bearbeitet {new Date(d.updated_at).toLocaleString("de-DE")}
                    {d.profile_code ? ` · Profil ${d.profile_code}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpen(d.report_year)}>
                    <FileText className="h-4 w-4 mr-1" />
                    Öffnen
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
