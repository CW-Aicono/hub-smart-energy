
# Super-Admin: Firmware-Katalog & Rollout

## Ziel
Plattform-Administrator kann zentral Firmware-Pakete für Wallbox-Modelle pflegen und an Ladepunkte ausrollen — als Ergänzung zur bereits gelieferten MVP-Lösung (Schritte 1+2+4).

## Neue Seite: `SuperAdminOcppFirmware.tsx` (Route `/super-admin/ocpp/firmware`)

Drei Bereiche in einem Tab-Layout:

### Tab 1 — Firmware-Katalog
- Tabelle aller Einträge aus `cp_firmware_artifacts`
- Spalten: Hersteller, Modell, Version, Format, Größe, Eichrecht-Zertifikat (Badge), hochgeladen von, hochgeladen am
- Filter (Suchfeld) für Hersteller + Modell
- Aktionen pro Zeile: Release-Notes ansehen, löschen (mit Bestätigung — löscht Eintrag UND Datei aus Bucket)

### Tab 2 — Upload
Dialog mit Formular:
- Pflicht: Hersteller, Modell, Version (frei eingebbar; Datalist-Vorschläge aus bestehenden `charge_points` mit Vendor/Model)
- Pflicht: Datei-Upload (max. 100 MB), Format-Dropdown (`bin` / `zip` / `fwu` / `tar` / `other`)
- SHA-256 wird client-seitig per `crypto.subtle.digest` berechnet und gespeichert
- Optional: Release-Notes (Textarea)
- Pflicht-Checkbox **„Eichrecht-Freigabe vorhanden"** — falls aktiviert: Pflicht-Textfeld für Referenz (z. B. Konformitätsbescheinigungs-Nummer / Link)
- Upload-Ablauf:
  1. Datei nach `cp-firmware/{vendor}/{model}/{version}-{timestamp}.{ext}` via `supabase.storage`
  2. Eintrag in `cp_firmware_artifacts` anlegen
  3. Bei Fehler: Datei zurückrollen

### Tab 3 — Bulk-Rollout
- Artefakt auswählen (Dropdown)
- Liste aller passenden Ladepunkte (Vendor + Model match, ohne Tenant-Filter, mit Tenant-Name) mit Checkboxen, Spalten: Tenant, Ladepunkt-Name, aktuelle Firmware-Version, Status (online/offline)
- „Alle auswählen / online auswählen"
- `retrieveDate`-Picker (Default: kommende Nacht 02:00 Europe/Berlin)
- Eichrecht-Bestätigungs-Checkbox (Pflicht falls Artefakt eichrechtzertifiziert)
- Button **„Rollout starten"** → ruft bestehende Edge-Function `ocpp-firmware-control` mit Action `enqueue_job` pro Ladepunkt parallel (Promise.all) auf
- Fortschrittsanzeige + Zusammenfassung (Erfolg / Fehler je CP)

## Anbindung
- Route in `src/App.tsx` ergänzen (lazy import, `<SA>`-Wrapper wie bestehende Super-Admin-Routen)
- Eintrag in `src/components/super-admin/SuperAdminSidebar.tsx` im OCPP-Submenü (z. B. unter „OCPP Control"): „Firmware-Katalog" mit Icon `Upload`

## Keine neuen Backend-Tabellen
Nutzt vollständig die in MVP angelegten Tabellen + den `cp-firmware`-Bucket + die Edge-Function `ocpp-firmware-control`. RLS-Policies erlauben super_admin bereits Insert/Update/Delete auf Artefakte und Bucket-Uploads.

## Out of Scope (separat)
- Auto-Detect des passenden Formats anhand Dateiendung
- Vendor/Model-Normalisierung über alle Wallboxen (z. B. „ABB" vs. „ABB EV Infrastructure")
- Watchdog/pg_cron (Schritt 5 aus Original-Plan)

## Aufwand
~½ Tag.
