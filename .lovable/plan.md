## Ausgangslage (verifiziert)

- `**src/pages/Automation.tsx**` (Multi-Location-Automation) übergibt dem `AutomationRuleBuilder` **kein** `installedTemplates`-Prop. Der Builder zeigt daher konsequent den Hinweis „Auf diesem Miniserver wurden noch keine AICO_-Bausteine erkannt" – egal ob auf irgendeinem Standort Templates installiert sind.
- In `src/components/locations/LocationAutomation.tsx` (Zeilen 308–346) werden die installierten Templates **pro Location** aus `location_loxone_templates` + `loxone_template_registry` geladen und dort korrekt in den Builder gereicht.
- Ergebnis: Template-Automation funktioniert heute **ausschließlich** in der Standort-Detailansicht, nicht im übergreifenden `/automation`-Editor.

## Ziel

Liegenschaftsübergreifende Template-Automation: Ein Baustein (z. B. `AICO_GridProtect`) wird einmal im Multi-Location-Editor konfiguriert und automatisch auf **alle** ausgewählten Standorte gespielt, auf denen dieser Baustein installiert ist.

## Plan

### 1. Datenquelle „Templates über alle Standorte" (Frontend-Hook)

Neuer Hook `useInstalledTemplatesMulti(locationIds)` in `src/hooks/`:

- Lädt aus `location_loxone_templates` alle Zeilen für die angegebenen Locations.
- Joint mit `loxone_template_registry` (nur `is_active`).
- Gruppiert nach `(template_key, instance_id)` und liefert:
  ```
  { template_key, instance_id, title, parameters,
    locations: [{ locationId, locationIntegrationId, installedVersion }] }
  ```
- Ein Template gilt für den MLA-Editor als „verfügbar", wenn es auf **mindestens einem** Standort installiert ist. Standorte ohne Installation werden im Editor grau markiert („Baustein fehlt – bitte auf Miniserver aufspielen").

### 2. Multi-Location-Editor erweitern (`src/pages/Automation.tsx`)

- Hook aus Schritt 1 mit den `gatewayIds`/`locationIds` aufrufen.
- Neues Prop `installedTemplates` an `AutomationRuleBuilder` durchreichen (aggregierte Liste).
- Zusätzlich neues optionales Prop `templateAvailability` (Map `template_key → Set<locationId>`), damit der Builder pro ausgewähltem Ziel-Standort einen Badge zeigen kann („installiert" / „fehlt").

### 3. Builder anpassen (`src/components/locations/AutomationRuleBuilder.tsx`)

- Wenn `installedTemplates.length > 0` und der Editor im **Multi-Location-Modus** läuft (erkennbar an bereits vorhandenem `scope_type === "cross_location"` bzw. `targetLocationIds`):
  - Template-Auswahl freischalten.
  - Unter der Ziel-Standortliste: bei jeder Location visuell anzeigen, ob der gewählte Baustein dort installiert ist. Nicht-installierte Standorte werden beim Speichern **automatisch ausgeschlossen** (mit Toast-Hinweis).
- Für `requires_cloud`-Bausteine bleibt bestehende Sperre auf „Loxone lokal" gültig, unverändert.

### 4. Persistenz & Push

- `location_automations` mit `scope_type = "cross_location"` und `target_location_ids = [...]` existiert bereits – kein Schema-Change nötig.
- Speicherung legt **pro Ziel-Standort einen Eintrag** in `loxone_pending_writes` an (Push-Kanal aus v1.4), sobald Parameter geändert werden. Alternativ: einen aggregierten Eintrag pro Location beim Speichern der Automation.
- Die vorhandene Edge Function `loxone-parameter-push` wird so erweitert, dass sie beim Auslösen einer Cross-Location-Automation die Zielwerte für alle betroffenen `location_integration_id`s in die Warteschlange schreibt.

### 5. UI-Hinweise für Laien

- Wenn im MLA-Editor gar keine Templates aggregiert werden können: klarer Hinweis mit Link/Anleitung „So installieren Sie einen AICO-Baustein auf einem Miniserver" (verweist auf die Standort-Detailseite → Puzzle-Icon 🧩).
- Nach dem Speichern: Toast „Automation für X von Y Standorten aktiviert. Z Standorte übersprungen (Baustein nicht installiert)".

### 6. Tests / Abnahme

- Manueller Test: 2 Standorte, auf beiden `AICO_GridProtect` installiert → Automation in `/automation` anlegen, beide Standorte auswählen, speichern, „Jetzt ausführen" → Werte landen in `loxone_pending_writes` für beide `location_integration_id`s.
- Regressionscheck: Standort-Detailansicht unverändert.

## Technische Details

- **Neue Datei:** `src/hooks/useInstalledTemplatesMulti.tsx`
- **Editiert:** `src/pages/Automation.tsx` (Hook einbinden + Prop übergeben), `src/components/locations/AutomationRuleBuilder.tsx` (Availability-Badges + Filter beim Save), optional `supabase/functions/loxone-parameter-push/index.ts` (Multi-Location-Push).
- **Kein DB-Migrationsbedarf**; `location_loxone_templates`, `loxone_template_registry`, `location_automations.target_location_ids` und `loxone_pending_writes` sind ausreichend.
- **Keine Änderung** an `useLocationAutomations` / `useMLAutomations`-Signaturen.

## Offene Frage

Soll bei „Jetzt ausführen" einer Cross-Location-Automation **parallel** für alle Standorte gepusht werden (schneller, schwerer zu debuggen) oder **sequenziell** mit Fortschrittsanzeige (langsamer, klarere Fehlermeldungen pro Standort)? Vorschlag: parallel, mit Ergebnistabelle im Toast.  
  
Antwort: Ja, parallel, also so wie von dir vorgeschlagen.