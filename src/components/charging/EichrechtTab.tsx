import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, RefreshCw, Link as LinkIcon, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { useOcmf } from "@/hooks/useOcmf";
import { toast } from "sonner";

interface EichrechtTabProps {
  sessionId: string;
}

export function EichrechtTab({ sessionId }: EichrechtTabProps) {
  const { data, loading, busy, refresh, finalize, download, getPublicLink, safeUrl, parsed } = useOcmf(sessionId);
  const [publicLink, setPublicLink] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const statusBadge = () => {
    if (!data?.status)
      return (
        <Badge variant="outline" className="gap-1.5">
          <ShieldOff className="h-3.5 w-3.5" /> Noch nicht generiert
        </Badge>
      );
    switch (data.status) {
      case "signed":
        return (
          <Badge className="gap-1.5 bg-green-600 hover:bg-green-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Signiert &amp; geprüft
          </Badge>
        );
      case "invalid":
        return (
          <Badge variant="destructive" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Signatur ungültig
          </Badge>
        );
      case "unsigned":
        return (
          <Badge variant="secondary" className="gap-1.5">
            <ShieldOff className="h-3.5 w-3.5" /> Unsigniert (nicht eichrechtskonform)
          </Badge>
        );
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const onCopyLink = async () => {
    const url = await getPublicLink();
    if (url) {
      setPublicLink(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Endkunden-Link kopiert");
      } catch {
        toast.info("Link erzeugt – bitte manuell kopieren");
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Eichrecht / Transparenz (OCMF)
          </span>
          {statusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Lade Belegstatus …</p>}

        {!loading && !data?.ocmfPayload && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Für diese Ladesitzung wurde noch kein eichrechtskonformer Beleg erzeugt.
            </p>
            <Button onClick={finalize} disabled={busy} size="sm">
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Beleg jetzt erzeugen
            </Button>
          </div>
        )}

        {!loading && data?.ocmfPayload && (
          <>
            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Transaktions-ID:</span>{" "}
                <span className="font-mono">{data.transactionId ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Finalisiert:</span>{" "}
                {data.finalizedAt ? new Date(data.finalizedAt).toLocaleString("de-DE") : "—"}
              </div>
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Public-Key-Fingerprint:</span>{" "}
                <span className="break-all font-mono text-xs">{data.fingerprint ?? "kein Key hinterlegt"}</span>
              </div>
              {parsed?.ok && parsed.header && (
                <>
                  <div>
                    <span className="text-muted-foreground">Wallbox:</span> {parsed.header.MV ?? "—"} {parsed.header.MM ?? ""}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Zähler-Seriennr.:</span> {parsed.header.MS ?? "—"}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md bg-muted/40 p-3">
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">{data.ocmfPayload}</pre>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={download} size="sm">
                <Download className="mr-2 h-4 w-4" /> .ocmf herunterladen
              </Button>
              {safeUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={safeUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> In S.A.F.E. Transparenzsoftware öffnen
                  </a>
                </Button>
              )}
              <Button onClick={onCopyLink} variant="outline" size="sm">
                <LinkIcon className="mr-2 h-4 w-4" /> Endkunden-Link kopieren
              </Button>
              <Button onClick={finalize} variant="ghost" size="sm" disabled={busy}>
                <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                Neu erzeugen
              </Button>
            </div>

            {publicLink && (
              <div className="rounded-md border bg-card p-3 text-xs">
                <p className="mb-1 font-medium">Öffentlicher Download-Link für den Endkunden:</p>
                <p className="break-all font-mono">{publicLink}</p>
              </div>
            )}

            {data.status === "unsigned" && (
              <p className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-900 dark:text-yellow-200">
                Dieser Beleg trägt keine prüfbare Hersteller-Signatur. Er dient nur der Transparenz und ist <strong>nicht</strong>{" "}
                eichrechtskonform i. S. v. MessEG/MessEV. Hinterlegen Sie den Hersteller-Public-Key in der Ladepunkt-Konfiguration,
                damit signierte Belege geprüft werden können.
              </p>
            )}
            {data.status === "invalid" && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                Die Hersteller-Signatur konnte nicht verifiziert werden. Bitte prüfen Sie, ob der hinterlegte Public-Key zur
                Wallbox passt.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
