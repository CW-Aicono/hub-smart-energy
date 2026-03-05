import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLegalPage } from "@/hooks/useLegalPages";
import DOMPurify from "dompurify";

const DEFAULTS: Record<string, { title: string; html: string }> = {
  datenschutz: {
    title: "Datenschutzerklärung",
    html: `<h2>1. Verantwortlicher</h2>
<p>[Name / Firma]<br/>[Straße, Hausnummer]<br/>[PLZ, Ort]<br/>E-Mail: [E-Mail-Adresse]</p>
<h2>2. Erhebung und Speicherung personenbezogener Daten</h2>
<p>Beim Besuch unserer Plattform werden automatisch Daten erhoben, die technisch erforderlich sind (IP-Adresse, Browsertyp, Zeitpunkt).</p>
<h2>3. Cookies</h2>
<p>Wir verwenden technisch notwendige Cookies sowie mit Ihrer Einwilligung Analyse-Cookies.</p>
<h2>4. Ihre Rechte</h2>
<p>Sie haben Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung und Datenübertragbarkeit gemäß DSGVO.</p>
<p><em>Hinweis: Diese Datenschutzerklärung ist ein Platzhalter und muss rechtlich angepasst werden.</em></p>`,
  },
  impressum: {
    title: "Impressum",
    html: `<h2>Angaben gemäß § 5 TMG</h2>
<p>[Firma / Name des Betreibers]<br/>[Rechtsform]<br/>[Straße, Hausnummer]<br/>[PLZ, Ort]</p>
<h2>Kontakt</h2>
<p>Telefon: [Telefonnummer]<br/>E-Mail: [E-Mail-Adresse]</p>
<h2>Registereintrag</h2>
<p>Registergericht: [Amtsgericht]<br/>Registernummer: [HRB-Nummer]</p>
<h2>Umsatzsteuer-ID</h2>
<p>[USt-IdNr.]</p>
<p><em>Hinweis: Dieses Impressum ist ein Platzhalter und muss mit Ihren Unternehmensdaten ausgefüllt werden.</em></p>`,
  },
  agb: {
    title: "Nutzungsbedingungen (AGB)",
    html: `<h2>1. Geltungsbereich</h2>
<p>Diese Nutzungsbedingungen gelten für die Nutzung der Energiemanagement-Plattform. Mit der Nutzung erkennen Sie diese Bedingungen an.</p>
<h2>2. Leistungsbeschreibung</h2>
<p>Die Plattform stellt Werkzeuge zur Erfassung, Auswertung und Visualisierung von Energiedaten bereit. KI-gestützte Analysen, Anomalie-Erkennungen und Handelsempfehlungen dienen ausschließlich der Orientierung.</p>
<h2>3. Haftungsbeschränkung</h2>
<p>Die Plattform übernimmt keine Haftung für die Richtigkeit, Vollständigkeit oder Aktualität der bereitgestellten Daten, Analysen und Empfehlungen. Insbesondere:</p>
<ul>
<li>KI-basierte Analysen und Anomalie-Erkennungen können fehlerhaft sein und ersetzen keine fachliche Prüfung.</li>
<li>Arbitrage- und Handelsempfehlungen stellen keine Finanzberatung dar. Entscheidungen auf Basis dieser Empfehlungen erfolgen auf eigenes Risiko.</li>
<li>Schwellenwert-Alarme und automatisierte Benachrichtigungen können verzögert, unvollständig oder fehlerhaft sein.</li>
<li>Automatisierte Schaltvorgänge und Steuerungen erfolgen ohne Gewähr. Der Betreiber haftet nicht für Schäden durch fehlerhafte Automatisierungen.</li>
</ul>
<p>Die Haftung für indirekte Schäden, entgangenen Gewinn oder Folgeschäden ist – soweit gesetzlich zulässig – ausgeschlossen.</p>
<h2>4. Datenschutz</h2>
<p>Informationen zur Datenverarbeitung finden Sie in unserer <a href="/datenschutz">Datenschutzerklärung</a>.</p>
<h2>5. Änderungen</h2>
<p>Wir behalten uns vor, diese Nutzungsbedingungen jederzeit anzupassen. Änderungen werden über die Plattform bekannt gegeben.</p>
<p><em>Hinweis: Diese AGB sind ein Platzhalter und müssen rechtlich an Ihr Unternehmen angepasst werden.</em></p>`,
  },
};

interface LegalPageViewProps {
  pageKey: "datenschutz" | "impressum" | "agb";
}

const LegalPageView = ({ pageKey }: LegalPageViewProps) => {
  const { data: page, isLoading } = useLegalPage(pageKey);

  const fallback = DEFAULTS[pageKey];
  const title = page?.title || fallback?.title || pageKey;
  const contentHtml = page?.content_html || fallback?.html || "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Link>
          </Button>
        </div>

        <h1 className="text-3xl font-bold mb-8">{title}</h1>

        {isLoading ? (
          <div className="animate-pulse text-muted-foreground">Laden…</div>
        ) : (
          <div
            className="prose prose-sm max-w-none text-muted-foreground
              [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-6 [&_h2]:mb-3
              [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-foreground [&_h3]:mt-4
              [&_p]:leading-relaxed [&_p]:mb-3
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1
              [&_em]:text-xs [&_em]:opacity-70"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contentHtml) }}
          />
        )}

        <div className="pt-6 mt-8 border-t border-border text-xs text-muted-foreground">
          Stand: {page?.updated_at ? new Date(page.updated_at).toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : "März 2026"}
        </div>
      </div>
    </div>
  );
};

export default LegalPageView;
