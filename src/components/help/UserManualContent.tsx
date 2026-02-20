import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowRight, 
  MapPin, 
  LayoutDashboard, 
  Building2, 
  Zap,
  Gauge,
  Smartphone,
  QrCode,
  Camera,
  WifiOff,
  Cpu,
  RefreshCw,
  Link,
  TrendingUp,
  Battery,
} from "lucide-react";

interface UserManualContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: "gettingStarted" | "locationManagement" | "floorManagement" | "energyAnalysis" | "meterManagement" | "mobileApp" | "automation" | "evCharging" | "integrations" | "arbitrageTrading";
}

const UserManualContent = ({ open, onOpenChange, chapter }: UserManualContentProps) => {
  const { t } = useTranslation();

  const chapters = {
    gettingStarted: {
      title: t("help.gettingStarted"),
      icon: <LayoutDashboard className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              Willkommen bei Smart Energy Hub
            </h3>
            <p className="text-muted-foreground mb-4">
              Smart Energy Hub ist Ihre zentrale Plattform für das Energiemanagement Ihrer Gebäude und Standorte. 
              Diese Anleitung hilft Ihnen beim Einstieg.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Erste Schritte (Einrichtungsassistent)</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Beim ersten Login werden Sie durch einen interaktiven Einrichtungsassistenten geführt:
            </p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Firmenprofil einrichten (Name, Kontaktdaten)</li>
              <li>Erste Liegenschaft anlegen</li>
              <li>Ersten Zähler hinzufügen</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-2">
              Jeden Schritt können Sie überspringen und den Assistenten jederzeit über 
              <strong> Hilfe & Support → Erste Schritte</strong> erneut aufrufen.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">1. Dashboard verstehen</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Nach dem Login landen Sie auf dem Dashboard. Hier sehen Sie:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Energieverbrauchsdiagramme mit Tages- und Wochenübersicht</li>
              <li>Kostenübersicht für Strom, Gas, Wärme und Wasser</li>
              <li>Wetterdaten für Ihre Standorte</li>
              <li>Grundrisspläne mit Echtzeit-Sensordaten</li>
              <li>Aktuelle Alerts und Benachrichtigungen</li>
              <li>Jahresverbrauchsprognose und CO₂-Bilanzierung</li>
              <li>Sankey- und Pie-Chart-Widgets für Energieflüsse</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">2. Navigation</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Die Seitenleiste links enthält alle wichtigen Bereiche:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Dashboard:</strong> Übersicht und anpassbare Widgets</li>
              <li><strong>Standorte:</strong> Gebäude und Bereiche verwalten</li>
              <li><strong>Messstellen:</strong> Zähler und Zählerstände verwalten</li>
              <li><strong>Integrationen:</strong> Externe Systeme und Gateways verbinden</li>
              <li><strong>Benutzerverwaltung:</strong> Benutzer und Rollen verwalten</li>
              <li><strong>Einstellungen:</strong> Profil, Branding und System konfigurieren</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">3. Dashboard anpassen</h4>
            <p className="text-sm text-muted-foreground">
              Klicken Sie auf "Dashboard anpassen" oben rechts, um Widgets ein- oder auszublenden 
              und die Anordnung nach Ihren Wünschen zu ändern. Widgets können in drei Größen 
              dargestellt werden (1/3, 2/3, volle Breite).
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">4. Sprache und Theme wechseln</h4>
            <p className="text-sm text-muted-foreground">
              Unter "Mein Profil" können Sie die Sprache (Deutsch, Englisch, Spanisch, Niederländisch) 
              und das Farbschema (Hell, Dunkel, System) ändern.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">5. Mandantenfähigkeit</h4>
            <p className="text-sm text-muted-foreground">
              Smart Energy Hub ist mandantenfähig. Jeder Mandant hat seine eigenen Standorte, 
              Benutzer, Rollen und Branding-Einstellungen. Super-Admins können alle Mandanten 
              zentral verwalten.
            </p>
          </section>
        </div>
      ),
    },
    locationManagement: {
      title: t("help.locationManagement"),
      icon: <MapPin className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Standortverwaltung
            </h3>
            <p className="text-muted-foreground mb-4">
              Verwalten Sie alle Ihre Gebäude und Standorte in einer hierarchischen Struktur.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Standort anlegen</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Navigieren Sie zu <strong>Standorte</strong> in der Seitenleiste</li>
              <li>Klicken Sie auf <strong>"Standort anlegen"</strong> oben rechts</li>
              <li>Wählen Sie den Standorttyp:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong>Einzelgebäude:</strong> Ein einzelnes Gebäude</li>
                  <li><strong>Gebäudekomplex:</strong> Mehrere zusammengehörige Gebäude</li>
                  <li><strong>Sonstiges:</strong> Andere Arten von Standorten</li>
                </ul>
              </li>
              <li>Füllen Sie die Grunddaten aus (Name, Adresse, Kontakt)</li>
              <li>Optional: Fügen Sie einen übergeordneten Standort hinzu für Hierarchien</li>
              <li>Klicken Sie auf <strong>"Speichern"</strong></li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Standort bearbeiten</h4>
            <p className="text-sm text-muted-foreground">
              Klicken Sie auf einen Standort in der Übersicht, um zur Detailseite zu gelangen. 
              Dort können Sie alle Informationen bearbeiten, Kontaktdaten anpassen und 
              die zugehörigen Etagen verwalten.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Hierarchien nutzen</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Standorte können hierarchisch organisiert werden:
            </p>
            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>Hauptstandort Berlin</span>
              </div>
              <div className="ml-6 mt-1 flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Gebäude A</span>
              </div>
              <div className="ml-6 mt-1 flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>Gebäude B</span>
              </div>
            </div>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Kartenansicht</h4>
            <p className="text-sm text-muted-foreground">
              Aktivieren Sie "Auf Karte anzeigen" bei einem Standort, um ihn auf der 
              interaktiven Übersichtskarte darzustellen. Die Koordinaten werden 
              automatisch aus der Adresse ermittelt.
            </p>
          </section>
        </div>
      ),
    },
    floorManagement: {
      title: t("help.floorManagement" as any),
      icon: <Building2 className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Etagenverwaltung
            </h3>
            <p className="text-muted-foreground mb-4">
              Verwalten Sie Etagen innerhalb Ihrer Gebäude und laden Sie Grundrisspläne hoch, 
              um Sensoren visuell zu positionieren.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Etage anlegen</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Öffnen Sie die Detailseite eines Standorts</li>
              <li>Scrollen Sie zum Bereich <strong>"Etagen"</strong></li>
              <li>Klicken Sie auf <strong>"Etage hinzufügen"</strong></li>
              <li>Geben Sie Name, Etagennummer und optional die Fläche ein</li>
              <li>Speichern Sie die Etage</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Grundrissplan hochladen</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Klicken Sie bei einer Etage auf das <strong>Bild-Symbol</strong></li>
              <li>Wählen Sie eine Bilddatei (PNG, JPG) aus</li>
              <li>Der Grundriss wird automatisch hochgeladen und angezeigt</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Sensoren auf dem Grundriss platzieren</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Öffnen Sie den Grundriss über das <strong>Grundriss-Symbol</strong></li>
              <li>Wechseln Sie zum Tab <strong>"Messgeräte bearbeiten"</strong></li>
              <li>Wählen Sie einen Sensor aus der Liste rechts</li>
              <li>Ziehen Sie ihn per Drag & Drop auf die gewünschte Position</li>
              <li>Bereits platzierte Sensoren können verschoben werden</li>
              <li>Zum Löschen: Fahren Sie über einen Sensor und klicken Sie auf das X</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Grundriss im Dashboard</h4>
            <p className="text-sm text-muted-foreground">
              Im Dashboard wird der Grundriss mit den aktuellen Messwerten angezeigt. 
              Sie können zoomen und schwenken, um Details zu sehen. Die Sensordaten 
              werden alle 5 Minuten automatisch aktualisiert.
            </p>
          </section>
        </div>
      ),
    },
    energyAnalysis: {
      title: t("help.energyAnalysis"),
      icon: <Zap className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Energieanalyse
            </h3>
            <p className="text-muted-foreground mb-4">
              Analysieren Sie Ihren Energieverbrauch und identifizieren Sie Einsparpotenziale.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Energietypen</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Das System unterscheidet vier Energiearten:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Strom:</strong> Elektrische Energie in kWh</li>
              <li><strong>Gas:</strong> Gasverbrauch in m³</li>
              <li><strong>Wärme:</strong> Fernwärme in kWh</li>
              <li><strong>Wasser:</strong> Wasserverbrauch in m³</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Verbrauchsdiagramme</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Das Energiediagramm im Dashboard zeigt:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Tägliche und wöchentliche Verbräuche</li>
              <li>Farbcodierte Balken für jeden Energietyp</li>
              <li>Vergleich mit Vorperioden</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Kostenübersicht</h4>
            <p className="text-sm text-muted-foreground">
              Die Kostenkachel zeigt die geschätzten Kosten basierend auf aktuellen 
              Tarifen. Positive/negative Trends werden farblich hervorgehoben.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Standortfilter</h4>
            <p className="text-sm text-muted-foreground">
              Wählen Sie im Dashboard einen spezifischen Standort aus, um nur dessen 
              Daten anzuzeigen. Alternativ können Sie "Alle Standorte" wählen für 
              eine aggregierte Ansicht.
            </p>
          </section>

           <section>
            <h4 className="font-semibold mb-2">Datenexport</h4>
            <p className="text-sm text-muted-foreground">
              Exportieren Sie Energiedaten über die Export-Funktion unter "Energiedaten". 
              Verfügbare Formate: CSV für Tabellenkalkulationen und PDF für druckfertige Berichte.
              Filtern Sie nach Standort, Energieart und Zeitraum.
            </p>
          </section>
        </div>
      ),
    },
    meterManagement: {
      title: "Messstellen",
      icon: <Gauge className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              Messstellenverwaltung
            </h3>
            <p className="text-muted-foreground mb-4">
              Verwalten Sie alle Zähler zentral – unabhängig vom Hersteller. Zähler können 
              manuell oder automatisch über Gateways erfasst werden.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Zähler anlegen</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Navigieren Sie zu <strong>Standorte → Standort-Detail</strong> oder zur <strong>Messstellen-Übersicht</strong></li>
              <li>Klicken Sie auf <strong>"Zähler anlegen"</strong></li>
              <li>Wählen Sie die Erfassungsart:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong>Manuell:</strong> Zählerstand wird von Hand eingegeben</li>
                  <li><strong>Automatisch:</strong> Zählerstand wird über ein Gateway/Sensor ausgelesen</li>
                </ul>
              </li>
              <li>Füllen Sie Name, Zählernummer, Energieart und Einheit aus</li>
              <li>Speichern Sie den Zähler</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Zähler bearbeiten</h4>
            <p className="text-sm text-muted-foreground">
              Über das Stift-Symbol in der Zähler-Tabelle können Sie Name, Zählernummer, 
              Energieart, Einheit und Erfassungsart ändern. Bei automatischer Erfassung 
              wählen Sie das Gateway und den Sensor aus.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Zähler archivieren</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Statt einen Zähler zu löschen, können Sie ihn archivieren:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Klicken Sie auf das <strong>Archiv-Symbol</strong> neben dem Zähler</li>
              <li>Archivierte Zähler sind über den Toggle <strong>"Archiv anzeigen"</strong> sichtbar</li>
              <li>Archivierte Zähler können wiederhergestellt oder endgültig gelöscht werden</li>
              <li>Bestehende Messwerte bleiben bei der Archivierung erhalten</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">QR-Codes für Zähler</h4>
            <p className="text-sm text-muted-foreground">
              Für jeden Zähler kann ein QR-Code generiert werden. Nutzen Sie die Funktionen 
              "Herunterladen" oder "Drucken", um den QR-Code auszudrucken und an den 
              physischen Zähler zu kleben. Die mobile App erkennt den Zähler dann 
              automatisch per Kamerascan.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Alarmregeln</h4>
            <p className="text-sm text-muted-foreground">
              Definieren Sie Schwellenwerte pro Standort und Energieart. Das System benachrichtigt 
              Sie, wenn ein Verbrauchswert den definierten Grenzwert über- oder unterschreitet.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Filter in der Übersicht</h4>
            <p className="text-sm text-muted-foreground">
              Die Messstellen-Übersicht bietet drei Filter: Liegenschaft, Energieart 
              und Erfassungsart. Kombinieren Sie diese, um schnell den gewünschten 
              Zähler zu finden.
            </p>
          </section>
        </div>
      ),
    },
    mobileApp: {
      title: "Mobile App (Meter Mate)",
      icon: <Smartphone className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              Mobile Zählerablesung
            </h3>
            <p className="text-muted-foreground mb-4">
              Die mobile App ermöglicht die Zählerablesung direkt vor Ort – per manuelle Eingabe, 
              QR-Code-Scan oder KI-Bilderkennung.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Zugang zur App</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Die App ist unter <strong>/m</strong> erreichbar und für Smartphones optimiert. 
              Sie können sie als PWA auf Ihrem Homescreen installieren:
            </p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Öffnen Sie die App-URL im Browser</li>
              <li>Tippen Sie auf "Zum Startbildschirm hinzufügen"</li>
              <li>Die App läuft dann wie eine native App</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Camera className="h-4 w-4" />
              KI-Bilderkennung
            </h4>
            <p className="text-sm text-muted-foreground">
              Fotografieren Sie den Zählerstand mit der Kamera. Die KI erkennt automatisch 
              die Zählernummer und den aktuellen Stand. Sie können das Ergebnis vor dem 
              Speichern überprüfen und korrigieren. Ein Konfidenzwert zeigt an, wie 
              sicher die Erkennung ist.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              QR-Code-Scan
            </h4>
            <p className="text-sm text-muted-foreground">
              Scannen Sie den QR-Code-Sticker am Zähler. Der Zähler wird automatisch 
              erkannt und Sie können direkt den Stand eingeben. Nutzen Sie die 
              QR-Code-Funktion in der Messstellen-Übersicht, um die Sticker zu drucken.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Unbekannte Zähler</h4>
            <p className="text-sm text-muted-foreground">
              Erkennt die KI eine Zählernummer, die nicht im System hinterlegt ist, können 
              Sie den Zähler direkt in der App anlegen – inklusive Standortzuordnung, 
              Energieart (Strom, Gas, Wasser, Wärme), Foto und erstem Zählerstand.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <WifiOff className="h-4 w-4" />
              Offline-Funktion
            </h4>
            <p className="text-sm text-muted-foreground">
              Die App funktioniert auch ohne Internetverbindung. Erfasste Zählerstände 
              werden lokal gespeichert und automatisch übermittelt, sobald die Verbindung 
              wiederhergestellt ist. Ein Banner zeigt die Anzahl ausstehender Ablesungen.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Plausibilitätsprüfung</h4>
            <p className="text-sm text-muted-foreground">
              Bei jeder Erfassung wird geprüft, ob der neue Zählerstand plausibel ist. 
              Ist der Wert niedriger als der letzte gespeicherte Stand, wird eine 
              Warnung angezeigt. Sie können den Wert dennoch speichern.
            </p>
          </section>
        </div>
      ),
    },
    automation: {
      title: "Gebäudeautomation",
      icon: <Cpu className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              Gebäudeautomation
            </h3>
            <p className="text-muted-foreground mb-4">
              Steuern Sie Aktoren des Loxone Miniservers direkt aus Smart Energy Hub heraus. 
              Erstellen Sie komplexe Automationsregeln mit Bedingungen und mehreren Aktionen.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Übersicht</h4>
            <p className="text-sm text-muted-foreground">
              Die Automationsverwaltung finden Sie in der Detailansicht eines Standorts unter 
              dem Abschnitt <strong>„Automation"</strong>. Dort sehen Sie alle gespeicherten 
              Automationen, deren Status und die letzte Ausführung.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Verfügbare Aktoren</h4>
            <p className="text-sm text-muted-foreground">
              Über den Button <strong>„Verfügbare Aktoren"</strong> sehen Sie alle steuerbaren 
              Aktoren (Schalter, Dimmer, Jalousien etc.) des verbundenen Loxone Miniservers, 
              gruppiert nach Räumen mit aktuellem Status.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Automation erstellen</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Klicken Sie auf <strong>„Automation hinzufügen"</strong></li>
              <li>Vergeben Sie einen Namen und eine optionale Beschreibung</li>
              <li>Fügen Sie <strong>Bedingungen</strong> hinzu (optional):
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong>Sensorwert:</strong> z.B. Temperatur &gt; 25°C</li>
                  <li><strong>Uhrzeit:</strong> Zeitfenster (Von–Bis)</li>
                  <li><strong>Wochentage:</strong> z.B. nur Mo–Fr</li>
                  <li><strong>Aktor-Status:</strong> z.B. wenn Schalter X eingeschaltet ist</li>
                </ul>
              </li>
              <li>Wählen Sie die <strong>Verknüpfung</strong> zwischen Bedingungen (UND/ODER) – individuell pro Bedingung einstellbar</li>
              <li>Fügen Sie eine oder mehrere <strong>Aktionen</strong> hinzu (Aktor + Befehl)</li>
              <li>Klicken Sie auf <strong>„Erstellen"</strong></li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Aktionstypen</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Pulse (Taster):</strong> Sendet einen kurzen Impuls</li>
              <li><strong>Einschalten:</strong> Schaltet den Aktor dauerhaft ein</li>
              <li><strong>Ausschalten:</strong> Schaltet den Aktor dauerhaft aus</li>
              <li><strong>Umschalten (Toggle):</strong> Wechselt den aktuellen Zustand</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Automation ausführen</h4>
            <p className="text-sm text-muted-foreground">
              Gespeicherte Automationen können jederzeit manuell über den <strong>▶-Button</strong> ausgeführt werden. 
              Mehrere Aktionen innerhalb einer Automation werden nacheinander abgearbeitet. 
              Die letzte Ausführungszeit wird automatisch protokolliert.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Berechtigungen</h4>
            <p className="text-sm text-muted-foreground">
              Unter <strong>Benutzerverwaltung → Rollen</strong> können folgende Automationsrechte 
              vergeben werden: Anzeigen, Erstellen, Bearbeiten, Löschen und Ausführen.
            </p>
          </section>
        </div>
      ),
    },
    evCharging: {
      title: "Ladeinfrastruktur (E-Mobilität)",
      icon: <Zap className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Ladeinfrastruktur verwalten
            </h3>
            <p className="text-muted-foreground mb-4">
              Verwalten Sie Ihre Ladepunkte, Tarife und Abrechnungen zentral. Nutzer können 
              über die mobile Lade-App (SmartCharge) Ladevorgänge starten und ihre Historie einsehen.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Ladepunkte anlegen</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Navigieren Sie zu <strong>Ladeinfrastruktur → Ladepunkte</strong></li>
              <li>Klicken Sie auf <strong>„Ladepunkt anlegen"</strong></li>
              <li>Geben Sie Name, OCPP-ID, Standort, Leistung und Steckertyp ein</li>
              <li>Der Ladepunkt verbindet sich automatisch per OCPP 1.6J</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Ladepunkt-Details</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Auf der Detailseite eines Ladepunkts finden Sie:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Performance-Statistiken:</strong> Verfügbarkeit, Auslastung, Sessions und Energie</li>
              <li><strong>Remote-Steuerung:</strong> Ladevorgang per Klick starten</li>
              <li><strong>Ladehistorie:</strong> Alle vergangenen Ladevorgänge mit Dauer und Energie</li>
              <li><strong>OCPP-Protokoll:</strong> Live-Nachrichtenlog mit Pause-Funktion und Timeout-Erkennung</li>
              <li><strong>Foto-Management:</strong> Bild des Ladepunkts hochladen</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Tarife und Abrechnung</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Unter <strong>Ladeinfrastruktur → Abrechnung</strong> verwalten Sie:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Tarife:</strong> Grundgebühr, Preis/kWh und Blockiergebühr (Idle Fee nach Freizeitraum)</li>
              <li><strong>Rechnungen:</strong> Automatischer monatlicher Versand gebrandeter Rechnungen</li>
              <li><strong>Ladenutzer:</strong> Nutzergruppen, RFID-Tags und App-Zugänge</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Mobile Lade-App (SmartCharge)</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Die App ist unter <strong>/ev</strong> erreichbar und als PWA installierbar:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Karte:</strong> Fullscreen-Karte mit allen verfügbaren Ladepunkten und Statusfiltern</li>
              <li><strong>QR-Scan:</strong> Ladepunkt per QR-Code identifizieren und Ladevorgang starten</li>
              <li><strong>Historie:</strong> Übersicht aller Ladevorgänge mit aktiven Sessions oben</li>
              <li><strong>Rechnungen:</strong> Einsicht in alle Abrechnungen</li>
              <li><strong>Navigation:</strong> Direkte Routenführung zum Ladepunkt (Apple Maps / Google Maps)</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Status-Farbschema</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><span className="text-green-600 font-medium">Grün:</span> Verfügbar</li>
              <li><span className="text-blue-600 font-medium">Blau:</span> Lädt</li>
              <li><span className="text-red-600 font-medium">Rot:</span> Fehler</li>
              <li><span className="text-yellow-600 font-medium">Gelb:</span> Nicht verfügbar</li>
              <li><span className="text-orange-600 font-medium">Orange:</span> Offline</li>
            </ul>
          </section>
        </div>
      ),
    },
    integrations: {
      title: "Integrationen & Datensynchronisation",
      icon: <Link className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Link className="h-4 w-4 text-primary" />
              Integrationen & Datensynchronisation
            </h3>
            <p className="text-muted-foreground mb-4">
              Verbinden Sie externe Systeme und synchronisieren Sie Zähler- und Verbrauchsdaten 
              automatisch mit Drittplattformen wie BrightHub.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Gateway-Integrationen</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Unter <strong>Integrationen</strong> verwalten Sie Ihre Gateways und externen Systeme:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Loxone Miniserver:</strong> Sensoren, Aktoren und Gebäudeautomation</li>
              <li><strong>Shelly:</strong> Smart-Home-Schalter und Energiemessung</li>
              <li><strong>Tuya:</strong> IoT-Geräte und Smart Plugs</li>
              <li><strong>Siemens / ABB:</strong> Industrielle Energiezähler</li>
              <li><strong>HomeMatic:</strong> Heizungs- und Raumsensoren</li>
              <li><strong>TP-Link Omada:</strong> Netzwerkinfrastruktur</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">BrightHub-Synchronisation</h4>
            <p className="text-sm text-muted-foreground mb-2">
              BrightHub ist eine externe Energieplattform, mit der Zähler und Messwerte 
              automatisch synchronisiert werden können.
            </p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Navigieren Sie zu <strong>Einstellungen → BrightHub</strong></li>
              <li>Aktivieren Sie die Integration und hinterlegen Sie den API-Key</li>
              <li>Konfigurieren Sie die Synchronisation</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Zähler-Sync (täglich)</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Einmal täglich (02:00 UTC) werden alle Zähler automatisch synchronisiert:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Neue Zähler werden in BrightHub angelegt</li>
              <li>Umbenennungen werden übernommen (Matching über UUID)</li>
              <li>Nicht mehr vorhandene Zähler werden archiviert</li>
              <li>Manuelle Synchronisation per Button jederzeit möglich</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Messwerte-Sync (alle 15 Min.)</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Neue Messwerte werden alle 15 Minuten automatisch übertragen:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Nur seit dem letzten Sync erfasste Werte werden gesendet</li>
              <li>Sowohl automatische (Sensor) als auch manuelle Ablesungen</li>
              <li>Maximal 1000 Werte pro Übertragung (Batching bei mehr Daten)</li>
              <li>Kosten- und CO₂-Daten werden mitgesendet (falls vorhanden)</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync-Status prüfen
            </h4>
            <p className="text-sm text-muted-foreground">
              In den BrightHub-Einstellungen sehen Sie den Zeitpunkt der letzten Zähler- 
              und Messwerte-Synchronisation. Über die manuellen Sync-Buttons können Sie 
              die Synchronisation jederzeit auslösen und den Status überprüfen.
            </p>
          </section>
        </div>
      ),
    },
    arbitrageTrading: {
      title: "Arbitragehandel",
      icon: <TrendingUp className="h-5 w-5" />,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Arbitragehandel mit Batteriespeichern
            </h3>
            <p className="text-muted-foreground mb-4">
              Nutzen Sie Day-Ahead-Spotpreise (EPEX Spot), um Batteriespeicher wirtschaftlich zu optimieren. 
              Laden Sie bei niedrigen Preisen und entladen Sie bei hohen Preisen.
            </p>
          </section>

          <Separator />

          <section>
            <h4 className="font-semibold mb-2">Dashboard</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Das Arbitrage-Dashboard zeigt auf einen Blick:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Aktueller Spotpreis:</strong> In ct/kWh und €/MWh</li>
              <li><strong>Registrierte Speicher:</strong> Anzahl der verwalteten Batteriespeicher</li>
              <li><strong>Gesamterlös:</strong> Kumulierter Gewinn/Verlust aus allen Trades</li>
              <li><strong>Gehandelte Energie:</strong> Gesamtmenge in kWh</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Spotpreis-Verlauf</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Der Chart zeigt die Spotpreise ab 12 Stunden vor der aktuellen Uhrzeit:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Vergangene Stunden:</strong> Gestrichelte Linie in gedämpfter Farbe</li>
              <li><strong>Zukünftige Stunden:</strong> Durchgezogene Linie in Primärfarbe</li>
              <li><strong>X-Achse:</strong> Zweizeilig – Uhrzeit (oben) und lokalisierter Wochentag + Datum (unten)</li>
              <li><strong>Tageswechsel:</strong> Vertikale Trennlinien markieren den Datumswechsel</li>
              <li><strong>Aktualisierung:</strong> Stündlicher Datenabruf, alle 5 Minuten Refresh im Browser</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Battery className="h-4 w-4" />
              Batteriespeicher verwalten
            </h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Navigieren Sie zu <strong>Arbitragehandel → Speicher</strong></li>
              <li>Klicken Sie auf <strong>„Speicher anlegen"</strong></li>
              <li>Konfigurieren Sie Kapazität (kWh), maximale Lade-/Entladeleistung (kW) und Wirkungsgrad (%)</li>
              <li>Optional: Weisen Sie den Speicher einem Standort zu</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Handelsstrategien</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-4">
              <li>Navigieren Sie zu <strong>Arbitragehandel → Strategien</strong></li>
              <li>Klicken Sie auf <strong>„Strategie anlegen"</strong></li>
              <li>Wählen Sie einen Speicher und definieren Sie die Preisschwellen:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong>Kaufen unter:</strong> Spotpreis-Schwelle für Laden (z.B. 30 €/MWh)</li>
                  <li><strong>Verkaufen über:</strong> Spotpreis-Schwelle für Entladen (z.B. 80 €/MWh)</li>
                </ul>
              </li>
              <li>Aktivieren/deaktivieren Sie Strategien jederzeit per Toggle</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold mb-2">Handelshistorie</h4>
            <p className="text-sm text-muted-foreground">
              Unter <strong>Arbitragehandel → Trades</strong> sehen Sie alle ausgeführten Trades 
              mit Zeitpunkt, Typ (Laden/Entladen), Energiemenge, Preis und Erlös. 
              Der Gesamterlös wird als Badge oben rechts angezeigt.
            </p>
          </section>
        </div>
      ),
    },
  };

  const currentChapter = chapters[chapter];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentChapter.icon}
            {currentChapter.title}
          </DialogTitle>
          <DialogDescription>
            {t("help.userManualDescription")}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          {currentChapter.content}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default UserManualContent;
