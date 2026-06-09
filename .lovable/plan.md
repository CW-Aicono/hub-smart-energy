## Befund (Antwort auf deine Fragen)

**Die täglichen 6,4-KB-Einträge sind KEINE Datensicherung deines Mandanten.**
Sie sind ein Nebenprodukt aus `gateway-ingest` (Funktion `handleGatewayBackup`): Wenn ein HA-Add-on seinen lokalen Zustand hochlädt, wird ein Eintrag mit `backup_type = 'gateway'` und fest verdrahtetem `tables_count = 0, rows_count = 0` angelegt. Es werden also weder Mandantendaten noch Messwerte gesichert – nur ein kleiner Statusdump des Gateways.

**Die Sicherung vom 27.02.2026 (243 KB, 30 Tabellen, 594 Zeilen) ist ein echter manueller Snapshot** (Button „Snapshot erstellen"). Sie wurde von `tenant-backup` erzeugt und enthält laut Konfiguration auch die Messdaten-Tabellen (`meter_period_totals`, `meter_readings`, `energy_readings`). Damals war das Datenvolumen klein. Heute steht der Stand bei: `meter_period_totals` 5.343 Zeilen / 1,8 MB, `energy_readings` 0, `meter_readings` 10, `charging_sessions` 43. Eine neue Sicherung wäre also deutlich größer – wird aber aktuell nirgends automatisch ausgelöst.

**Es gibt heute keine Wiederherstellungs-Funktion.** Snapshots können nur als JSON heruntergeladen, aber nicht zurück in die Datenbank eingespielt werden. Storage-Dateien (Grundrisse, Logos, Zählerfotos) werden nur als Dateinamen-Liste mitgesichert, nicht als Inhalt.

---

## Ziel

1. Tägliche, vollständige Cloud-Sicherung pro Mandant, die wirklich alle Konfigurations-, Stamm- und Messdaten enthält.
2. Sichtbare, korrekte Anzeige in „Vorhandene Sicherungen" (Tabellen-/Zeilenanzahl, echte Größe).
3. Storage-Inhalte (nicht nur Dateinamen) mitsichern.
4. Restore-Funktion mit Vorschau und Schutz vor versehentlichem Überschreiben.

---

## Plan

### 1. Aufräumen der Anzeige

- Die 6,4-KB-„gateway"-Einträge nicht mehr unter „Vorhandene Sicherungen" listen. Stattdessen Filter auf `backup_type IN ('manual','scheduled')`. Optional eigener Tab „Gateway-Statusdumps" für Support.
- `handleGatewayBackup` umbenennen / Eintrag in eine andere Tabelle (`gateway_state_dumps`) verschieben, damit `backup_snapshots` nur noch echte Mandantensicherungen enthält.

### 2. Tägliche Mandanten-Sicherung (echt)

- Neue Edge-Funktion `tenant-backup-scheduled` (Wiederverwendung der Logik aus `tenant-backup`), aufgerufen per `pg_cron` einmal täglich (z. B. 02:30 Europe/Berlin) für jeden aktiven Mandanten.
- `backup_type = 'scheduled'`, Aufbewahrung 30 Tage (wie heute), zusätzlich „letzte 4 Wochensicherungen" und „letzte 6 Monatssicherungen" behalten (rollende Großvater-Vater-Sohn-Logik).
- Messdaten werden in Chunks (pro Tabelle, 50k Zeilen) geladen und ggf. als gzip-komprimierte JSON-Bytes in Storage abgelegt, statt komplett in das `data`-jsonb-Feld – sonst sprengt es bei größeren Mandanten die Zeilengröße.

### 3. Storage-Inhalte mitsichern

- Pro Snapshot ein Ordner in Bucket `tenant-backups/<tenant_id>/<snapshot_id>/`:
  - `db.json.gz` – alle Tabellendaten
  - `storage/<bucket>/<datei>` – Kopien der Dateien aus `meter-photos`, `tenant-assets`, `floor-plans`, `floor-3d-models`
  - `manifest.json` – Versions-, Tabellen-, Datei-, Hash-Info
- `backup_snapshots.size_bytes` = Summe aus DB + Storage.

### 4. Restore-Funktion

- Neue Edge-Funktion `tenant-restore` (nur Rolle `admin`/`super_admin` desselben Mandanten).
- Ablauf in 3 Schritten im UI:
  1. **Snapshot wählen** (Liste oder JSON-Upload).
  2. **Vorschau**: Liste „X Tabellen, Y Zeilen, Z Dateien werden eingespielt; A Tabellen werden überschrieben". Auswahl pro Bereich (Konfiguration / Stammdaten / Messdaten / Storage).
  3. **Bestätigung** mit Eingabe des Mandantennamens (wie bei „Mandant löschen").
- Modi: `merge` (Upsert nach Primärschlüssel, keine Löschung) oder `replace` (vorher Tabelleninhalte des Mandanten löschen). Default: `merge`.
- Schreibt vor dem Restore automatisch einen „Sicherheits-Snapshot" (`backup_type = 'pre-restore'`), damit der Restore selbst rückgängig gemacht werden kann.
- Restore läuft serverseitig in der richtigen FK-Reihenfolge (Eltern vor Kindern), mit Transaktion pro Tabelle und Fortschritts-Log in einer neuen Tabelle `backup_restore_jobs`.

### 5. UI-Erweiterungen (`BackupSettings.tsx`)

- Pro Snapshot-Zeile: Buttons **Herunterladen**, **Wiederherstellen**, **Löschen**, **Details** (Tabellenliste + Zeilenzahlen).
- Banner mit Status der letzten geplanten Sicherung („Letzte automatische Sicherung: 09.06.2026 02:30, 1,9 MB, 31 Tabellen ✅").
- Hinweistext aktualisieren: erklärt klar, dass Messdaten enthalten sind und dass Restore verfügbar ist.

### 6. Technisches / Sicherheit

- Neuer Bucket `tenant-backups` (privat, RLS: nur `service_role`, Zugriff ausschließlich über Edge-Funktion mit signierten URLs).
- Neue Tabellen:
  - `backup_restore_jobs` (status, started_at, finished_at, mode, tables_done, error)
  - `gateway_state_dumps` (für die bisherigen 6-KB-Einträge)
- RLS: `backup_snapshots` bleibt mandanten-scoped, neue Tabellen analog.
- Größenbegrenzung: bei > 100 MB Warnung im UI, Empfehlung „Messdaten älter als 12 Monate archivieren".

### 7. Reihenfolge der Umsetzung (Vorschlag)

1. Schritt 1 (Anzeige bereinigen) – sehr klein, sofortige Klarheit.
2. Schritt 2 + 3 (echte tägliche Sicherung inkl. Storage).
3. Schritt 4 + 5 (Restore + UI).
4. Schritt 6 (Aufräumarbeiten, Begrenzungen).

### Offene Fragen, bevor ich umsetze

- **Aufbewahrung**: 30 Tage + 4 Wochen + 6 Monate ok, oder andere Vorgabe?
- **Restore-Default**: `merge` (nichts wird gelöscht) – einverstanden?
- **Messdaten** wirklich in jede tägliche Sicherung, oder nur 1× wöchentlich (spart Speicher bei vielen Mandanten)?
- **Gateway-Statusdumps**: separater Tab behalten oder ganz aus dem UI entfernen?  
  
Antworten:  
- Aufbewahrung: so wie von dir vorgeschlagen  
- Restore-Default: merge  
- Messdaten: 1 x wöchentlich ist ausreichend  
- Statusdumps: separater Tab