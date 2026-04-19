import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, FileText, XCircle, Briefcase, Download } from "lucide-react";
import { SignaturePad } from "@/components/sales/SignaturePad";
import { toast } from "sonner";

interface PublicQuote {
  id: string;
  version: number;
  geraete_summe: number;
  installation_summe: number;
  total_einmalig: number;
  modul_summe_monatlich: number;
  signed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  signer_name: string | null;
  created_at: string;
  sales_projects: {
    kunde_name: string;
    kontakt_name: string | null;
    adresse: string | null;
    kunde_typ: string;
  };
}

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export default function PublicSalesQuote() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // signature form
  const [showSign, setShowSign] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [sigData, setSigData] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    document.title = "Ihr AICONO-Angebot";
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("sales-public-quote", {
          method: "GET",
          // @ts-expect-error supabase-js v2 supports query but typing is loose
          headers: {},
        });
        // Workaround: invoke doesn't pass query params well via GET; use direct fetch
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-public-quote?token=${encodeURIComponent(token)}`;
        const resp = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || "Angebot nicht gefunden");
        setQuote(json.quote);
        setPdfUrl(json.pdf_url);
      } catch (e: any) {
        setError(e.message || "Angebot konnte nicht geladen werden");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const reload = async () => {
    if (!token) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-public-quote?token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    const json = await resp.json();
    if (resp.ok) {
      setQuote(json.quote);
      setPdfUrl(json.pdf_url);
    }
  };

  const submitSign = async () => {
    if (!signerName.trim() || !signerEmail.trim() || !sigData) {
      toast.error("Bitte Name, E-Mail und Unterschrift ausfüllen");
      return;
    }
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-sign-quote`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          token,
          action: "sign",
          signer_name: signerName,
          signer_email: signerEmail,
          signature_data: sigData,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Fehler beim Unterzeichnen");
      toast.success("Vielen Dank! Ihre Unterschrift wurde erfasst.");
      setShowSign(false);
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitReject = async () => {
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-sign-quote`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ token, action: "reject", rejection_reason: rejectReason }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Fehler beim Ablehnen");
      toast.success("Ihre Antwort wurde übermittelt.");
      setShowReject(false);
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 p-4">
        <div className="max-w-2xl mx-auto space-y-4 pt-8">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-semibold">Angebot nicht verfügbar</h1>
            <p className="text-muted-foreground text-sm">{error || "Der Link ist ungültig oder abgelaufen."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSigned = !!quote.signed_at;
  const isRejected = !!quote.rejected_at;
  const isFinal = isSigned || isRejected;

  return (
    <div className="min-h-screen bg-muted/30 pb-12">
      {/* Branded header */}
      <header className="bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          <Briefcase className="h-7 w-7 text-primary" />
          <div>
            <div className="font-bold text-lg">AICONO</div>
            <div className="text-xs text-muted-foreground">Ihr persönliches Angebot</div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Status banner */}
        {isSigned && (
          <Alert className="border-primary bg-primary/5">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <AlertTitle>Angebot angenommen</AlertTitle>
            <AlertDescription>
              Vielen Dank, {quote.signer_name}! Wir melden uns in Kürze für die nächsten Schritte.
            </AlertDescription>
          </Alert>
        )}
        {isRejected && (
          <Alert variant="destructive">
            <XCircle className="h-5 w-5" />
            <AlertTitle>Angebot abgelehnt</AlertTitle>
            <AlertDescription>
              {quote.rejection_reason ? `Grund: ${quote.rejection_reason}` : "Wir haben Ihre Rückmeldung erhalten."}
            </AlertDescription>
          </Alert>
        )}

        {/* Greeting */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">Hallo {quote.sales_projects.kontakt_name || quote.sales_projects.kunde_name}!</CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  Hier ist Ihr individuelles Angebot für{" "}
                  <span className="font-medium text-foreground">{quote.sales_projects.kunde_name}</span>
                </p>
              </div>
              <Badge variant="outline">v{quote.version}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {quote.sales_projects.adresse && (
              <p className="text-sm text-muted-foreground">📍 {quote.sales_projects.adresse}</p>
            )}
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hardware</span>
                <span className="font-medium">{fmt(quote.geraete_summe)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Installation</span>
                <span className="font-medium">{fmt(quote.installation_summe)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Einmalig (netto)</span>
                <span className="font-bold text-primary">{fmt(quote.total_einmalig)}</span>
              </div>
              {quote.modul_summe_monatlich > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monatliche Module</span>
                  <span className="font-medium">{fmt(quote.modul_summe_monatlich)} / Monat</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PDF */}
        {pdfUrl && (
          <Card>
            <CardContent className="pt-6">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition"
              >
                <FileText className="h-8 w-8 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">Vollständiges Angebot (PDF)</div>
                  <div className="text-xs text-muted-foreground">Mit allen Details und Konditionen</div>
                </div>
                <Download className="h-4 w-4 text-muted-foreground" />
              </a>
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        {!isFinal && !showSign && !showReject && (
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" onClick={() => setShowSign(true)}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Annehmen
            </Button>
            <Button size="lg" variant="outline" onClick={() => setShowReject(true)}>
              Ablehnen
            </Button>
          </div>
        )}

        {/* Sign form */}
        {showSign && !isFinal && (
          <Card>
            <CardHeader>
              <CardTitle>Angebot rechtsverbindlich annehmen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="signer_name">Vollständiger Name *</Label>
                <Input
                  id="signer_name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Max Mustermann"
                />
              </div>
              <div>
                <Label htmlFor="signer_email">E-Mail *</Label>
                <Input
                  id="signer_email"
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="max@firma.de"
                />
              </div>
              <div>
                <Label>Unterschrift *</Label>
                <SignaturePad onChange={setSigData} />
              </div>
              <p className="text-xs text-muted-foreground">
                Mit Ihrer Unterschrift bestätigen Sie das Angebot rechtsverbindlich. IP-Adresse und Zeitstempel werden zu Beweiszwecken gespeichert.
              </p>
              <div className="flex gap-2">
                <Button onClick={submitSign} disabled={submitting} className="flex-1">
                  {submitting ? "Wird übermittelt..." : "Verbindlich annehmen"}
                </Button>
                <Button variant="outline" onClick={() => setShowSign(false)} disabled={submitting}>
                  Abbrechen
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reject form */}
        {showReject && !isFinal && (
          <Card>
            <CardHeader>
              <CardTitle>Angebot ablehnen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="reject_reason">Grund (optional)</Label>
                <Textarea
                  id="reject_reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Was hat Sie an unserem Angebot gestört?"
                  rows={4}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={submitReject} disabled={submitting} className="flex-1">
                  {submitting ? "Wird übermittelt..." : "Angebot ablehnen"}
                </Button>
                <Button variant="outline" onClick={() => setShowReject(false)} disabled={submitting}>
                  Abbrechen
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by AICONO Energy Hub · Sicherer Link · Keine Anmeldung erforderlich
        </p>
      </div>
    </div>
  );
}
