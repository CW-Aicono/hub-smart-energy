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
  Settings, 
  MapPin, 
  LayoutDashboard, 
  Building2, 
  Zap,
  Users,
  FileText
} from "lucide-react";

interface UserManualContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: "gettingStarted" | "locationManagement" | "floorManagement" | "energyAnalysis";
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
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">2. Navigation</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Die Seitenleiste links enthält alle wichtigen Bereiche:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li><strong>Dashboard:</strong> Übersicht und Widgets</li>
              <li><strong>Standorte:</strong> Gebäude und Bereiche verwalten</li>
              <li><strong>Integrationen:</strong> Externe Systeme verbinden</li>
              <li><strong>Einstellungen:</strong> Profil und System konfigurieren</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-2">3. Dashboard anpassen</h4>
            <p className="text-sm text-muted-foreground">
              Klicken Sie auf "Dashboard anpassen" oben rechts, um Widgets ein- oder auszublenden 
              und die Anordnung nach Ihren Wünschen zu ändern.
            </p>
          </section>

          <section>
            <h4 className="font-semibold mb-2">4. Sprache und Theme wechseln</h4>
            <p className="text-sm text-muted-foreground">
              Unter "Mein Profil" können Sie die Sprache (Deutsch, Englisch, Spanisch, Niederländisch) 
              und das Farbschema (Hell, Dunkel, System) ändern.
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
              Exportieren Sie Energiedaten über die Export-Funktion in den Widgets. 
              Verfügbare Formate: CSV für Tabellenkalkulationen.
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
