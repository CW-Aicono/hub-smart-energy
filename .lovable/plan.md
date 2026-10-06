# Bolan: keine Werte im Widget + Modulvergabe

## Was ich bisher gesehen habe
- **Auffällig auf deinen Screenshots:** Im Widget „Strom Hausanschluss Keplerweg“ ist nur der Zähler **Keplerweg** angehakt. Der Zähler, der gerade 1.600 W zeigt, ist aber **Prozessionsweg**. Prozessionsweg ist im Widget nicht ausgewählt.
- Die 1.600 W in der Zählerliste kommen direkt vom Gerät. Sie werden dort nur angezeigt. Das Widget liest dagegen nur **gespeicherte** Werte. Die Abholung läuft alle 5 Minuten und speichert nur Zähler mit gültiger Sensor-Zuordnung.
- Bolan gibt es nur auf Live, nicht im Testsystem. Ob dort Werte gespeichert werden, kann ich deshalb nicht selbst nachsehen.

## Schritt 1: Prüfen statt raten (vor dem Deploy, 2 Minuten)
Ich gebe dir einen fertigen Prüfbefehl für Live. Er zeigt für beide Bolan-Zähler:
- Gateway und Sensor, die eingetragen sind
- ob die Abholung auf Live zeitgesteuert läuft und wann sie zuletzt lief
- wann der letzte gespeicherte Wert kam

Mögliche Ergebnisse:
- **Prozessionsweg hat Werte, Keplerweg nicht:** Es fehlt nur der Haken im Widget, oder der Zähler Keplerweg ist noch nicht richtig verknüpft (dort dieselbe Prüfung wie bei Prozessionsweg).
- **Keine gespeicherten Werte:** Die Abholung läuft auf Live nicht, oder der Sensor passt nicht. Das behebe ich gezielt.

## Schritt 2: Sichtbar machen, damit das nicht wieder passiert
- Im Dialog „Gerät bearbeiten“ erscheint ein Feld **„Letzter gespeicherter Wert: … (vor X Min.)“**. Gibt es keinen, steht dort eine rote Warnung mit Ursache, z. B. „Sensor liefert keinen Leistungswert“.
- Das Widget zeigt bei Zählern ohne gespeicherte Daten **„Zähler X: seit … keine gespeicherten Werte“** statt einer leeren Grafik.
- In der Zählerliste wird der Live-Wert grau, wenn er nur vom Gerät kommt und nicht gespeichert wird.

## Schritt 3: Modulvergabe ohne Umweg
Problem: Module für Bolan kann nur ESB vergeben. Du kommst auf Live noch nicht in ESB, deshalb hat Bolan keine Module.
- Der Zugang zu ESB auf Live ist mit dem letzten Fix (Heimat-Mandant) erledigt, sobald er deployt ist.
- **Neu:** Portal-Admins können im AICONO Portal unter Kunden → Mandant die Module eines Kunden **direkt** setzen, auch wenn der Kunde zu einem Partner gehört. Das Partner-Portfolio wird dabei automatisch ergänzt, damit die Freigabe gültig bleibt. Jede Änderung wird mit Benutzer und Zeit protokolliert.
- Partner-Admins bleiben wie bisher auf ihr Portfolio beschränkt. An ihren Rechten ändert sich nichts.
- Hinweis: Module sperren nur Menüseiten. Das Speichern der Messwerte hängt nicht an Modulen. Am Widget-Problem ändern sie also nichts.

## Danach
Version v1.6.3, Changelog, Release Notes, Handbuch (4 Sprachen) und Roadmap werden gepflegt. Danach Build und Tests prüfen und den Live-Deploy freigeben.

## Technische Details
- Live-SQL: `meters` (name ilike '%Hausanschluss%', tenant Bolan) → `location_integration_id`, `sensor_uuid`, `capture_type`, `is_archived`; `max(recorded_at)` aus `meter_power_readings`, `max(bucket)` aus `meter_power_readings_5min`; `cron.job` + `cron.job_run_details` für `ems-gateway-periodic-sync`; `worker_controls` für `gateway_periodic_sync`/`shelly_periodic_sync`.
- `shelly-periodic-sync` schreibt nur bei `sensorMap.get(meter.sensor_uuid)` mit Leistungseinheit. Fehlende Treffer werden künftig als `integration_errors` (`error_type='sensor_missing'`) protokolliert statt still übersprungen.
- EditMeterDialog: Abfrage des letzten Werts (`meter_power_readings` limit 1, Fallback 5min). CustomWidget: Hinweis je `powerMeterId` ohne Zeilen.
- Modulvergabe: Edge Function `portal-set-tenant-module` (prüft `can_portal_write('commercial')`, ergänzt `partner_modules` idempotent, schreibt `tenant_modules` + `audit_logs`). `TenantModulesDialog` darauf umstellen. Die Regel in AGENTS.md („nur über partner-set-tenant-module“) wird um den Portal-Admin-Weg ergänzt.
