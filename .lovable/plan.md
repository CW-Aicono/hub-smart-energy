

# Multi-Location Automation (MLA) -- Vollausbau

## Ausgangslage

Aktuell existiert:
- Eine **Vision/Mock-Seite** (`src/pages/Automation.tsx`) mit statischen Daten und deaktivierten Buttons
- Ein funktionsfähiger **Regelbuilder** pro Einzelstandort (`LocationAutomation.tsx` + `AutomationRuleBuilder.tsx`)
- Eine DB-Tabelle `location_automations` mit Bedingungen, Aktionen, Zeitplan (JSON) -- aber an `location_id` gebunden
- Loxone-Ausführung via Edge Function

Die MLA-Seite muss von Mock auf echte Daten umgestellt und massiv erweitert werden.

---

## Architektur-Überblick

```text
┌─────────────────────────────────────────────────────┐
│                  MLA-Seite (/automation)             │
│                                                     │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐ │
│  │Regeln   │ │KI-Engine │ │Gateways│ │Ausführungs│ │
│  │(CRUD)   │ │(Empfehl.)│ │(Status)│ │-Protokoll │ │
│  └────┬────┘ └────┬─────┘ └───┬────┘ └─────┬─────┘ │
│       │           │           │             │       │
├───────┴───────────┴───────────┴─────────────┴───────┤
│               useMLAutomations Hook                 │
│      (standortübergreifend, alle Automationen)      │
├─────────────────────────────────────────────────────┤
│          location_automations (DB)                  │
│          automation_execution_log (DB, neu)          │
│          Edge Functions (Loxone, HA, etc.)          │
└─────────────────────────────────────────────────────┘
```

---

## Plan (10 Arbeitspakete)

### 1. DB-Migration: `automation_execution_log` Tabelle

Neue Tabelle für lückenlose Protokollierung jeder Ausführung:
- `id`, `tenant_id`, `automation_id` (FK), `executed_at`, `trigger_type` (manual/schedule/condition), `status` (success/error), `error_message`, `actions_executed` (JSON), `duration_ms`
- RLS analog zu `location_automations`
- Realtime aktivieren für Live-Updates im Log-Tab

### 2. DB-Migration: Erweiterung `location_automations`

Neue Spalten:
- `scope_type` (text, default 'location') -- Werte: 'location', 'floor', 'room', 'cross_location'
- `scope_floor_id` (UUID, nullable, FK floors)
- `scope_room_id` (UUID, nullable, FK floor_rooms)  
- `target_location_ids` (UUID[], nullable) -- für standortübergreifende Regeln
- `category` (text) -- 'heating', 'lighting', 'hvac', 'peak_shaving', 'custom'
- `color` (text, nullable) -- benutzerdefinierte Farbzuordnung
- `estimated_savings_kwh` (numeric, nullable) -- geschätzte monatliche Einsparung
- `tags` (text[], default '{}') -- freie Labels

### 3. Hook: `useMLAutomations`

Neuer zentralisierter Hook, der standortübergreifend alle Automationen des Mandanten lädt (nicht an eine `location_id` gebunden wie `useLocationAutomations`). Funktionen:
- `automations` -- alle Regeln mit JOIN auf `locations.name`
- `stats` -- aggregierte Kennzahlen (Gesamt, Aktiv, Pausiert, Einsparung)
- CRUD-Operationen mit Scope-Unterstützung
- `executeAutomation` -- mit Logging in `automation_execution_log`
- `executionLog` -- Verlauf der letzten Ausführungen
- Filter nach Standort, Kategorie, Status

### 4. Hook: `useAutomationAI`

Edge Function + Hook für KI-Empfehlungen:
- Edge Function `automation-ai-recommendations` nutzt Lovable AI (Gemini Flash)
- Input: Verbrauchsdaten der letzten 30 Tage, aktive Sensoren, bestehende Regeln, Wetterdaten
- Output: 3-5 konkrete Empfehlungen mit Titel, Beschreibung, geschätzter Einsparung, Konfidenz
- One-Click "Als Regel übernehmen" -- füllt den Regelbuilder vor
- Caching: Empfehlungen werden in `automation_ai_cache` (neue Tabelle oder localStorage) für 24h gespeichert

### 5. Regelbuilder-Erweiterung (`AutomationRuleBuilder.tsx`)

Erweitern um:
- **Scope-Auswahl**: Dropdown-Kaskade Standort > Etage > Raum (oder "Alle Standorte")
- **Kategorie-Auswahl**: Heizung, Beleuchtung, Lüftung, Lastmanagement, Sonstige (mit Icons)
- **Standortübergreifende Aktionen**: Mehrere Standort-Integrationen als Aktionsziele wählbar
- **Zeitplan-Editor**: Cron-artige Wiederholung (täglich, wöchentlich, monatlich) mit visueller Kalenderansicht
- **Geschätzte Einsparung**: Optionales Feld in kWh/Monat
- **Tags/Labels**: Freitext-Tags für Gruppierung
- **Farbe**: Color-Picker für visuelle Zuordnung in der Übersicht

### 6. MLA-Hauptseite Umbau (`src/pages/Automation.tsx`)

Kompletter Umbau von Mock auf Live-Daten:

**Header**: Echte Statistiken aus `useMLAutomations.stats` (Gesamt, Aktiv, KI-Empfehlungen, Gateways online, geschätzte Gesamteinsparung)

**Tab "Automationen"**:
- Filterleiste: Standort-Dropdown, Kategorie-Filter, Status-Toggle, Freitextsuche
- Karten mit echten Daten, farbiger Seitenleiste nach Kategorie
- Scope-Breadcrumb (Standort > Etage > Raum)
- Toggle aktiv/inaktiv direkt in der Karte
- Inline-Ausführung mit Ladeanimation
- Edit/Delete Buttons pro Karte
- "Neue Automation" Button öffnet den erweiterten Regelbuilder

**Tab "KI-Empfehlungen"**:
- Empfehlungen aus `useAutomationAI`
- "Als Regel anlegen" Button pro Empfehlung (öffnet vorausgefüllten Regelbuilder)
- Gesamteinsparpotenzial als Summary
- Aktualisieren-Button mit Ladeindikator

**Tab "Gateways"**:
- Echte Gateway-Daten aus `useIntegrations` (alle Loxone/HA-Integrationen)
- Online-Status basierend auf `last_synced_at`
- Geräteanzahl aus Sensor-Queries
- Link zur Integrations-Konfiguration

**Tab "Ausführungsprotokoll" (NEU)**:
- Tabelle/Timeline der letzten 50 Ausführungen
- Spalten: Zeitpunkt, Regelname, Trigger-Typ, Status (Erfolg/Fehler), Dauer
- Fehlerdetails ausklappbar
- Realtime-Updates via Supabase Subscription
- Export als CSV

### 7. Szenen-Konzept

Ermögliche das Gruppieren mehrerer Automationen zu einer "Szene":
- Neue Spalte `scene_id` (UUID, nullable) in `location_automations`
- Szenen-Verwaltung: Name, Beschreibung, enthaltene Regeln
- "Szene ausführen" = alle zugehörigen Regeln sequentiell/parallel ausführen
- Vorgefertigte Szenen-Templates: "Nachtmodus", "Wochenend-Modus", "Feiertag", "Notfall"

### 8. Benachrichtigungen

Optionale Benachrichtigung bei Ausführung oder Fehler:
- Neues Feld `notify_on_error` (boolean) und `notify_email` (text) in `location_automations`
- Bei fehlgeschlagener Ausführung: E-Mail via bestehende Resend-Integration
- Fehler-Badge im Sidebar-Menü (analog zu Integration-Errors)

### 9. Übersetzungen

Alle neuen Strings in `tenantAppTranslations.ts` (DE + EN) für:
- Scope-Labels, Kategorie-Namen, Zeitplan-Begriffe, Log-Spalten, KI-Empfehlungstext, Szenen-UI, Benachrichtigungs-Texte

### 10. Sidebar & ModuleGuard

- Sidebar-Item "Multi-Location Automation (MLA)" verlinkt auf `/automation`
- Modul `automation_building` steuert Sichtbarkeit
- Disclaimer-Banner (bereits vorhanden) am Seitenende beibehalten

---

## Technische Details

- **KI-Edge-Function**: Nutzt `LOVABLE_API_KEY` + `google/gemini-3-flash-preview` zur Analyse von Verbrauchsmustern und Generierung von Empfehlungen
- **Realtime**: `automation_execution_log` wird zu `supabase_realtime` hinzugefügt
- **Bestehende Kompatibilität**: `useLocationAutomations` bleibt für die Standort-Detailseite erhalten; `useMLAutomations` ist die mandantenweite Variante
- **Ausführung**: Bestehende Loxone/HA Edge Functions werden wiederverwendet; das Logging wird zentral im Hook ergänzt

