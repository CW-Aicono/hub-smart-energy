import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Download,
  Loader2,
  Plus,
  Share2,
  Eye,
  Pencil,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { buildQuoteBom, bomToCsv, downloadCsv, type BomFilter } from "@/lib/salesQuoteBom";

interface Quote {
  id: string;
  version: number;
  status: string;
  total_einmalig: number;
  modul_summe_monatlich: number;
  pdf_storage_path: string | null;
  signed_at: string | null;
  rejected_at: string | null;
  viewed_at: string | null;
  public_token: string | null;
  signer_name: string | null;
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
  const [bomBusy, setBomBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_quotes")
      .select(
        "id, version, status, total_einmalig, modul_summe_monatlich, pdf_storage_path, signed_at, rejected_at, viewed_at, public_token, signer_name, created_at",
      )
      .eq("project_id", projectId)
      .order("status", { ascending: true })
      .order("version", { ascending: false });
    if (!error) setQuotes((data ?? []) as Quote[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const openPdf = async (q: Quote) => {
    if (!q.pdf_storage_path) {
      toast.error("Kein PDF vorhanden");
      return;
    }
    setDownloading(q.id);
    try {
      const { data, error } = await supabase.storage
        .from("sales-quotes")
        .createSignedUrl(q.pdf_storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Öffnen fehlgeschlagen", { description: String(e) });
    } finally {
      setDownloading(null);
    }
  };

  const openCustomerView = (q: Quote) => {
    if (!q.public_token) {
      toast.error("Kein Kundenlink verfügbar");
      return;
    }
    const url = `${window.location.origin}/sales/quote/${q.public_token}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const share = async (q: Quote) => {
    if (!q.public_token) {
      toast.error("Kein Token verfügbar");
      return;
    }
    const url = `${window.location.origin}/sales/quote/${q.public_token}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AICONO-Angebot", text: "Ihr persönliches Angebot", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link kopiert", { description: url });
      }
    } catch {
      // user cancelled
    }
  };

  const downloadBom = async (q: Quote, filter: BomFilter) => {
    setBomBusy(q.id);
    try {
      const rows = await buildQuoteBom(q.id, filter);
      if (rows.length === 0) {
        toast.info("Stückliste ist leer", {
          description: "Für die gewählte Kategorie liegen keine Positionen vor.",
        });
        return;
      }
      const csv = bomToCsv(rows);
      const suffix =
        filter === "hardware" ? "hardware" : filter === "licenses" ? "lizenzen" : "gesamt";
      const label = q.status === "draft" ? "entwurf" : `v${q.version}`;
      downloadCsv(`stueckliste_${label}_${suffix}.csv`, csv);
    } catch (e) {
      toast.error("Export fehlgeschlagen", { description: String(e) });
    } finally {
      setBomBusy(null);
    }
  };

  const statusBadge = (q: Quote) => {
    if (q.status === "draft")
      return (
        <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
          <Pencil className="h-3 w-3 mr-1" />
          Entwurf
        </Badge>
      );
    if (q.signed_at)
      return <Badge className="text-[10px]">✓ Signiert von {q.signer_name}</Badge>;
    if (q.rejected_at)
      return (
        <Badge variant="destructive" className="text-[10px]">
          Abgelehnt
        </Badge>
      );
    if (q.viewed_at)
      return (
        <Badge variant="secondary" className="text-[10px]">
          <Eye className="h-3 w-3 mr-1" />
          Angesehen
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-[10px]">
        Versendbar
      </Badge>
    );
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
        quotes.map((q) => {
          const isDraft = q.status === "draft";
          return (
            <div
              key={q.id}
              className={`flex items-center justify-between gap-2 rounded-md border p-2 ${
                isDraft ? "bg-muted/50 border-dashed" : "bg-card/50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText
                  className={`h-4 w-4 shrink-0 ${isDraft ? "text-muted-foreground" : "text-primary"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {isDraft ? "Aktiver Entwurf" : `Version ${q.version}`}
                    {statusBadge(q)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Number(q.total_einmalig).toFixed(0)} € einmalig ·{" "}
                    {Number(q.modul_summe_monatlich).toFixed(0)} € / Monat
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {/* Stückliste als CSV — für Entwurf UND finalisierte Angebote */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Stückliste als CSV"
                      disabled={bomBusy === q.id}
                    >
                      {bomBusy === q.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Stückliste (CSV / Excel)</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => downloadBom(q, "all")}>
                      Alle Artikel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadBom(q, "hardware")}>
                      Nur Hardware
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadBom(q, "licenses")}>
                      Nur AICONO-Lizenzen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {isDraft ? (
                  <Button size="sm" variant="outline" onClick={onCreate}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Weiter bearbeiten
                  </Button>
                ) : (
                  <>
                    {/* Kundenansicht öffnen — funktioniert auch für signierte / abgelehnte Angebote */}
                    {q.public_token && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openCustomerView(q)}
                        title="Angebot in Kundenansicht öffnen"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {!q.signed_at && !q.rejected_at && q.public_token && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => share(q)}
                        title="An Kunden senden"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={!q.pdf_storage_path || downloading === q.id}
                      onClick={() => openPdf(q)}
                      title="PDF öffnen"
                    >
                      {downloading === q.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
      <Button size="sm" variant="outline" className="w-full" onClick={onCreate}>
        <Plus className="h-4 w-4 mr-1" /> Neue Angebots-Version
      </Button>
    </div>
  );
}
