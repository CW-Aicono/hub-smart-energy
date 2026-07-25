# Automation wird nicht zum Gateway synchronisiert – Ursache & Fix

## Diagnose (verifiziert)

Die Automation „Test Shelly On/Off" ist in der DB so gespeichert:

- `actuator_uuid = "switch.shelly_plug_s"` (Home-Assistant-Entity-ID)
- `location_integration_id = aaeaac5a…` → Integration-Typ **`shelly_cloud`**
- `execution_mode = "cloud"`

Daraus folgen beide beobachteten Fehler:

1. **Kein Sync zum AICONO Gateway.** `gateway-ingest` → `handleSyncAutomations` (Zeile 2237–2316) filtert per `location_integration_id = <AICONO-Gateway-Integration>`. Die Automation hängt an der Shelly-Cloud-Integration → 0 Automationen für das Gateway → „Keine lokalen Automationen".

2. **„Kein schaltbarer Aktor: switch.shelly_plug_s".** Der Cloud-Scheduler ruft `shelly-api` mit dem HA-Entity-Namen auf. `shelly-api` (Zeile 391) versteht nur Shelly-Control-UUIDs (`5a86e3_relay0`), nicht HA-Entities → Fehler.

Der Aktor existiert real nur im AICONO Gateway (Home Assistant). Er wurde im Editor unter der Shelly-Cloud-Integration angeboten und ausgewählt, was er nicht sein dürfte.

## Ziel

- AICONO Gateway wird im Editor / Sync / Executor exakt wie der Loxone Miniserver behandelt (lokale Ausführung, Sync, Hybrid-Fallback).
- UI-Text „Loxone lokal" → **„Gateway lokal"**, überall wo er auftaucht (Dropdown-Label, Kurzbeschreibung, Badges, Hilfetexte, Übersetzungen für DE/EN/ES/NL).
- Aktor-Auswahl bietet ein Gerät nur unter der Integration an, die es tatsächlich steuern kann.

## Umsetzung

### 1. UI-Umbenennung „Loxone lokal" → „Gateway lokal"

Betroffen: `AutomationRuleBuilder.tsx`, `AutomationCard.tsx`, alle Stellen mit `execution_mode`-Labels sowie `src/i18n/translations.ts` (Keys wie `auto.execMode.loxoneLocal`, Beschreibungstext, Badges). Wert `"loxone_local"` in der DB bleibt aus Kompatibilitätsgründen bestehen, wird aber immer als „Gateway lokal" gerendert.

### 2. Ausführungsmodus für AICONO Gateway freigeben

`packages/automation-core/*` und Cloud-Scheduler behandeln bereits `execution_mode = "loxone_local"` / `"hybrid"` als „lokal ausgeführt, Cloud-Fallback". `gateway-ingest → handleSyncAutomations` liefert Automationen an das Gateway. Ich stelle sicher, dass:
- AICONO-Gateway-Integrationen im Dropdown genauso wählbar sind wie Miniserver.
- Der Sync-Filter für Gateway-Devices funktioniert (bereits vorhanden, wird nur validiert).
- Cloud-Fallback (Hybrid) für HA-Entities über `home-assistant-api` ausgeführt wird (Executor-Mapping ist da, wird nur konsistent verdrahtet).

### 3. Datenkorrektur (Migration)

Für alle Automationen mit HA-Entity-Pattern im `actuator_uuid` (`^[a-z_]+\.`), die aktuell auf eine falsche Integration zeigen:
- `location_integration_id` auf die aktive `aicono_gateway`-Integration desselben Standorts umbiegen.
- `execution_mode = 'hybrid'` setzen (Gateway lokal bevorzugt, Cloud als Fallback).
- Log-Report der geänderten Rows.

### 4. Automation-Editor: Aktor-Quelle korrigieren

`AutomationRuleBuilder` + Aktor-Loader:
- Aktoren aus dem AICONO-Gateway-Inventory (HA-Entities) erscheinen ausschließlich in der Aktor-Liste der Gateway-Integration – nicht bei Shelly Cloud, Loxone etc.
- Beim Speichern wird `location_integration_id` immer aus dem gewählten Aktor abgeleitet.
- Wechsel der Integration leert die Aktor-Auswahl.

### 5. Guardrails (verhindern Wiederauftreten)

- **`handleSyncAutomations`**: Automationen mit HA-Entity-Pattern werden zusätzlich an das AICONO Gateway des Standorts ausgeliefert, auch wenn `location_integration_id` (historisch) auf eine andere Integration zeigt.
- **Cloud-Executor**: Wird `shelly-api` mit HA-Entity-Pattern aufgerufen, sofortiger Fehler „Aktor gehört zum Gateway – Automation neu speichern" statt stiller Fehlausführung.

### 6. Validierung

- DB-Query: keine Automation mehr mit Nicht-Gateway-Integration + HA-Entity-Actuator.
- Add-on-Log zeigt Automationen > 0 für Hetzner-Standort.
- „Test" schaltet den Shelly-Plug lokal über das Gateway; Ausführungsort-Dropdown zeigt „Gateway lokal".

## Technische Details

Betroffene Dateien:
- `src/components/locations/AutomationRuleBuilder.tsx`, `AutomationCard.tsx`, zugehörige Aktor-Hooks
- `src/i18n/translations.ts` (DE/EN/ES/NL)
- `supabase/functions/gateway-ingest/index.ts` (`handleSyncAutomations` Guardrail)
- `packages/automation-core/executor.ts` (Executor-Guard)
- `supabase/migrations/*` (Datenkorrektur)

Kein Schema-Change; keine Add-on-Änderung nötig – sobald der Sync die Regel liefert, greift die bestehende lokale Engine.
