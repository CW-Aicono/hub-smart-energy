import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Impressum = () => (
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

      <h1 className="text-3xl font-bold mb-8">Impressum</h1>

      <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">Angaben gemäß § 5 TMG</h2>
          <p>
            [Firma / Name des Betreibers]<br />
            [Rechtsform, z.&nbsp;B. GmbH]<br />
            [Straße, Hausnummer]<br />
            [PLZ, Ort]
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Vertreten durch</h2>
          <p>[Geschäftsführer / Vorstand]</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Kontakt</h2>
          <p>
            Telefon: [Telefonnummer]<br />
            E-Mail: [E-Mail-Adresse]<br />
            Website: [URL]
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Registereintrag</h2>
          <p>
            Registergericht: [Amtsgericht]<br />
            Registernummer: [HRB-Nummer]
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Umsatzsteuer-ID</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:<br />
            [USt-IdNr.]
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
          <p>
            [Name]<br />
            [Adresse]
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Haftungsausschluss</h2>

          <h3 className="text-base font-medium text-foreground mt-4">Haftung für Inhalte</h3>
          <p>
            Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit,
            Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen
            Seiten nach den allgemeinen Gesetzen verantwortlich.
          </p>

          <h3 className="text-base font-medium text-foreground mt-4">Haftung für Links</h3>
          <p>
            Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir
            keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine
            Gewähr übernehmen.
          </p>
        </section>

        <div className="pt-6 border-t border-border text-xs text-muted-foreground">
          <p>
            <strong>Hinweis:</strong> Dieses Impressum ist ein Platzhalter und muss mit Ihren
            tatsächlichen Unternehmensdaten ausgefüllt werden.
          </p>
          <p className="mt-2">Stand: März 2026</p>
        </div>
      </div>
    </div>
  </div>
);

export default Impressum;
