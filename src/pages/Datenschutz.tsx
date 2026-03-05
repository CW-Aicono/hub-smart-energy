import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Datenschutz = () => (
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

      <h1 className="text-3xl font-bold mb-8">Datenschutzerklärung</h1>

      <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Verantwortlicher</h2>
          <p>
            [Name / Firma]<br />
            [Straße, Hausnummer]<br />
            [PLZ, Ort]<br />
            E-Mail: [E-Mail-Adresse]<br />
            Telefon: [Telefonnummer]
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Erhebung und Speicherung personenbezogener Daten</h2>
          <p>
            Beim Besuch unserer Plattform werden automatisch folgende Daten erhoben, die technisch
            erforderlich sind, um Ihnen die Nutzung zu ermöglichen:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>IP-Adresse</li>
            <li>Datum und Uhrzeit der Anfrage</li>
            <li>Browsertyp und -version</li>
            <li>Verwendetes Betriebssystem</li>
            <li>Referrer-URL</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Cookies</h2>
          <p>
            Wir verwenden technisch notwendige Cookies, um die Funktionsfähigkeit unserer Plattform
            sicherzustellen (z.&nbsp;B. Authentifizierung, Sitzungsverwaltung). Darüber hinaus setzen
            wir mit Ihrer Einwilligung Analyse-Cookies ein, um die Nutzung unserer Plattform
            zu verstehen und zu verbessern.
          </p>
          <p>
            Sie können Ihre Einwilligung jederzeit über den Cookie-Banner widerrufen.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Zweck der Datenverarbeitung</h2>
          <p>
            Die Verarbeitung personenbezogener Daten erfolgt zur Bereitstellung unserer
            Energiemanagement-Plattform, insbesondere:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Benutzerkonten und Authentifizierung</li>
            <li>Speicherung und Analyse von Energiedaten</li>
            <li>Benachrichtigungen und Alarme</li>
            <li>Abrechnung von Ladeleistungen (bei Nutzung des Lademoduls)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Rechtsgrundlage</h2>
          <p>
            Die Verarbeitung erfolgt auf Grundlage von Art.&nbsp;6 Abs.&nbsp;1 DSGVO:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Lit. a)</strong> Einwilligung (z.&nbsp;B. Analyse-Cookies)</li>
            <li><strong>Lit. b)</strong> Vertragserfüllung (Bereitstellung der Plattform)</li>
            <li><strong>Lit. f)</strong> Berechtigtes Interesse (IT-Sicherheit, Fehlerbehebung)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Ihre Rechte</h2>
          <p>Sie haben gemäß DSGVO folgende Rechte:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Recht auf Auskunft (Art.&nbsp;15 DSGVO)</li>
            <li>Recht auf Berichtigung (Art.&nbsp;16 DSGVO)</li>
            <li>Recht auf Löschung (Art.&nbsp;17 DSGVO)</li>
            <li>Recht auf Einschränkung der Verarbeitung (Art.&nbsp;18 DSGVO)</li>
            <li>Recht auf Datenübertragbarkeit (Art.&nbsp;20 DSGVO)</li>
            <li>Widerspruchsrecht (Art.&nbsp;21 DSGVO)</li>
          </ul>
          <p>
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte an die oben genannte Kontaktadresse.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Auftragsverarbeitung</h2>
          <p>
            Für den Betrieb der Plattform nutzen wir Dienste von Drittanbietern (z.&nbsp;B. Hosting,
            Datenbankbetrieb). Mit diesen Anbietern bestehen Auftragsverarbeitungsverträge gemäß
            Art.&nbsp;28 DSGVO.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. Datensicherheit</h2>
          <p>
            Wir setzen technische und organisatorische Maßnahmen ein, um Ihre Daten gegen
            Verlust, Zerstörung, Zugriff und Veränderung durch Unbefugte zu schützen.
            Die Datenübertragung erfolgt verschlüsselt (TLS/SSL).
          </p>
        </section>

        <div className="pt-6 border-t border-border text-xs text-muted-foreground">
          <p>
            <strong>Hinweis:</strong> Diese Datenschutzerklärung ist ein Platzhalter und muss von
            einem Rechtsanwalt an Ihre konkreten Verarbeitungstätigkeiten angepasst werden.
          </p>
          <p className="mt-2">Stand: März 2026</p>
        </div>
      </div>
    </div>
  </div>
);

export default Datenschutz;
