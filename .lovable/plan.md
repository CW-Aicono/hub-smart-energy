# Bolan: beide Widgets ohne Werte, Änderungsprotokoll auf Live, Modulvergabe

## 1. Beide Widgets (Prozessionsweg und Keplerweg) bleiben leer
**Was feststeht:** Beide Zähler sind richtig zugeordnet, das Gateway ist online, und der Live-Wert (z. B. 1.600 W) kommt an. Dieser Live-Wert kommt direkt vom Gerät und wird nur angezeigt. Die Widgets lesen dagegen nur **gespeicherte** Werte. Die werden von einer Abholung alle 5 Minuten geschrieben. Bleiben beide Grafiken den ganzen Tag leer, speichert diese Abholung auf Live für Bolan nichts.

**Mögliche Ursachen, noch nicht bestätigt:** Bolan gibt es nur auf Live, deshalb kann ich dort nicht selbst nachsehen.
- Die zeitgesteuerte Abholung läuft auf Live nicht oder ist pausiert.
- Die Abholung läuft, findet aber den Sensor nicht. Dann überspringt sie den Zähler, ohne einen Fehler zu melden.
- Der Sensor liefert eine Einheit, die die Abholung nicht als Leistung erkennt.

**Schritt 1, prüfen (2 Minuten, vor dem Deploy):** Ich gebe dir einen fertigen Prüfbefehl für den Live-Server. Er zeigt:
- ob die Abholung eingeplant ist und wann sie zuletzt lief, mit Ergebnis
- ob sie pausiert ist
- für beide Bolan-Zähler den eingetragenen Sensor und den letzten gespeicherten Wert

Dann behebe ich genau die Ursache, die sich dort zeigt.

**Schritt 2, damit es nicht wieder still passiert:**
- Die Abholung meldet künftig einen sichtbaren Integrationsfehler „Sensor nicht gefunden / keine Leistung“, statt den Zähler stumm zu überspringen.
- „Gerät bearbeiten“ zeigt **„Letzter gespeicherter Wert: … (vor X Min.)“**. Fehlt er, erscheint eine rote Warnung.
- Hat ein Widget-Zähler keine gespeicherten Daten, zeigt das Widget **„seit … keine gespeicherten Werte“** statt einer leeren Grafik.

## 2. Änderungsprotokoll auf Live fehlt
**Was feststeht:** Die Meldung „noch nicht eingerichtet“ erscheint nur, wenn die Datenbank die nötigen Felder für das Protokoll nicht kennt. Diese Felder kommen mit einer Datenbank-Änderung von heute Morgen. Auf Live ist sie offenbar nicht angekommen.
- Der Prüfbefehl aus Schritt 1 zeigt zusätzlich, ob diese Felder und die Änderung auf Live vorhanden sind.
- Fehlen sie, wird die Änderung so nachgeliefert, dass sie mehrfach ausgeführt werden kann. Außerdem prüfe ich, warum der Deploy sie übersprungen hat, und behebe das.
- Die Anzeige nennt dann künftig das konkret fehlende Feld statt eines allgemeinen Hinweises.

## 3. Modulvergabe ohne Umweg
Problem: Module für Bolan kann nur ESB vergeben. Auf Live kommst du noch nicht in ESB.
- Der Zugang zu ESB wird mit dem bereits vorbereiteten Fix (Heimat-Mandant) behoben, sobald der Deploy läuft.
- **Neu:** Portal-Admins setzen die Module eines Kunden im AICONO Portal direkt, auch wenn der Kunde zu einem Partner gehört. Das Partner-Portfolio wird dabei automatisch ergänzt. Jede Änderung wird protokolliert. Die Rechte der Partner-Admins bleiben unverändert.
- Module sperren nur Menüseiten. Auf die Messwerte haben sie keinen Einfluss.

## Danach
Version v1.6.3, Changelog, Release Notes, Handbuch (4 Sprachen), Roadmap-Board und roadmap.md mit den neuen Punkten. Danach Build und Tests prüfen, anschließend Live-Deploy.

## Technische Details
- Live-Prüf-SQL: `cron.job`/`cron.job_run_details` für `ems-gateway-periodic-sync`; `worker_controls` (`gateway_periodic_sync`, `shelly_periodic_sync`); Bolan-`meters` → `location_integration_id`, `sensor_uuid`, `source_unit_power`, `max(recorded_at)` aus `meter_power_readings`; `information_schema.columns` für `audit_logs.support_session_id`/`entity_label`; `drizzle.__drizzle_migrations` für 0002.
- `shelly-periodic-sync`: kein Sensor-Treffer bzw. keine Leistungseinheit → `integration_errors` (`error_type='sensor_missing'`), idempotent je Zähler. Prüfen, ob `gateway-periodic-sync` für `shelly_cloud` den Aufruf an `shelly-periodic-sync` korrekt weitergibt (interner Auth-Header).
- RemoteSupportHistory: Fehlercode und Spaltenname im Hinweis anzeigen; idempotente Nachlieferung der Spalten (`ADD COLUMN IF NOT EXISTS`) als neue Migration.
- Modulvergabe: Edge Function `portal-set-tenant-module` (`can_portal_write('commercial')`, `partner_modules` idempotent ergänzen, `tenant_modules` und `audit_logs`). `TenantModulesDialog` umstellen und die AGENTS.md-Regel ergänzen.
