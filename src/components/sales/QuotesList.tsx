import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface Quote {
  id: string;
  version: number;
  total_einmalig: number;
  modul_summe_monatlich: number;
  pdf_storage_path: string | null;
  signed_at: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
  onCreate: () => void;
  reloadKey?: number;
}

export function QuotesList({ projectId, onCreate, reloadKey = 0 }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_quotes")
      .select("id, version, total_einmalig, modul_summe_monatlich, pdf_storage_path, signed_at, created_at")
      .eq("project_id", projectId)
      .order("version", { ascending: false });
    if (!error) setQuotes((data ?? []) as Quote[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const download = async (q: Quote) => {
    if (!q.pdf_storage_path) return;
    setDownloading(q.id);
    try {
      const { data, error } = await supabase.storage
        .from("sales-quotes")
        .createSignedUrl(q.pdf_storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e) {
      toast.error("Download fehlgeschlagen", { description: String(e) });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-muted-foreground py-2">Lädt Angebote…</div>
      ) : quotes.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-3">
          Noch keine Angebots-Version. Erstelle die erste.
        </div>
      ) : (
        quotes.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-2 rounded-md border p-2 bg-card/50">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  Version {q.version}
                  {q.signed_at && <Badge variant="secondary" className="text-[10px]">Signiert</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {Number(q.total_einmalig).toFixed(0)} € einmalig · {Number(q.modul_summe_monatlich).toFixed(0)} € / Monat
                </div>
              </div>
            </div>
            <Button size="icon" variant="ghost" disabled={!q.pdf_storage_path || downloading === q.id} onClick={() => download(q)}>
              {downloading === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </div>
        ))
      )}
      <Button size="sm" variant="outline" className="w-full" onClick={onCreate}>
        <Plus className="h-4 w-4 mr-1" /> Neue Angebots-Version
      </Button>
    </div>
  );
}
