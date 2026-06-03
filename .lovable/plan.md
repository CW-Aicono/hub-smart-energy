## Problem

In `/charging/points` (Datei `src/pages/ChargingPoints.tsx`) wird ein Ladepunkt sofort als **„Belegt"** angezeigt, sobald **irgendein** Stecker einen aktiven Ladevorgang hat — auch wenn der zweite Stecker noch frei ist. Ursache ist die Funktion `getEffectiveStatus` (Zeile 146–157):

```ts
if (activeSessions.some((s) => s.charge_point_id === cp.id)) return "charging";
```

Diese Zeile ignoriert den Status der einzelnen Stecker und liefert pauschal „charging" (= „Belegt") für den ganzen Ladepunkt.

Im öffentlichen Status-Link (`PublicChargeStatus.tsx`, Screenshot 3) ist die Pro-Stecker-Anzeige bereits korrekt — die interne Tenant-Übersicht (Screenshot 2) aber nicht.

## Ziel

In der Tabelle auf `/charging/points` soll pro Ladepunkt erkennbar sein, **welcher** Stecker belegt ist und welcher frei — analog zur öffentlichen Statusseite. Wenn 1 von 2 Steckern lädt, darf der Ladepunkt nicht als komplett „Belegt" gelten.

## Änderungen (rein UI/Frontend, keine Logik im Backend)

### 1. `src/pages/ChargingPoints.tsx` — Aggregations-Logik korrigieren

- `getEffectiveStatus(cp)` so anpassen, dass es **alle** Connector-Status berücksichtigt (inkl. aktiver Sessions pro `connector_id`) und das Ergebnis nach folgender Priorität zurückgibt:
  - `faulted` > `offline` > `unconfigured` > **`partial`** (mind. 1 belegt + mind. 1 frei) > `charging` (alle belegt) > `available` (alle frei) > `unavailable`
- Aktive Sessions werden weiterhin berücksichtigt, aber **pro `connector_id`** (Session-Feld existiert bereits, siehe `useChargingSessions.tsx`), nicht pauschal für den ganzen CP.
- Neuer Status-Key `"partial"` mit Label „Teilweise belegt" (DE) / „Partially occupied" (EN) / „Parcialmente ocupado" (ES) / „Gedeeltelijk bezet" (NL) wird in `statusConfig` ergänzt — Farbe: gemischtes Blau/Grün-Badge, damit auf einen Blick vom reinen „Belegt" unterscheidbar.
- Die Stat-Karten (Zeile 488–505) zählen weiterhin **pro Stecker** (das funktioniert bereits korrekt über `getConnectorStatusCount`).

### 2. `src/components/charging/ConnectorTypeIcons.tsx` — Icons pro Stecker einfärben

Aktuell zeigt die Spalte „Steckertypen" 2 gleich eingefärbte Steckersymbole (immer typabhängig blau/orange/grün). Erweiterung:

- Neuer optionaler Prop `connectorStatuses?: Array<{ connectorId: number; status: "available" | "charging" | "faulted" | "offline" | "unavailable" | "unconfigured" }>`.
- Wenn übergeben: jedes Stecker-Icon wird zusätzlich mit einem kleinen Status-Punkt (oben rechts am Icon) versehen — grün = frei, blau = belegt/lädt, rot = Fehler, grau = offline/nicht konfiguriert.
- Tooltip zeigt zusätzlich „Stecker 1: Verfügbar · Stecker 2: Belegt".
- Ohne den Prop bleibt das bisherige Verhalten erhalten (Rückwärtskompatibilität).

In `ChargingPoints.tsx` (Tabellen-Render, Zeile 555) wird dieser neue Prop aus `connectorsByChargePoint` + `activeSessions` befüllt.

### 3. Badge in der Status-Spalte

Bei Status `partial` zeigt die Badge zusätzlich den Zähler an, z. B. **„Belegt 1/2"** — so ist auf einen Blick sichtbar, dass nur ein Teil belegt ist. Bei `charging` (alle Stecker belegt) wie bisher nur „Belegt".

### 4. Übersetzungen

Neue Keys in `src/i18n/translations/{de,en,es,nl}/charging.ts` (oder dem entsprechenden Modul):
- `charging.status.partial` = „Teilweise belegt" / „Partially occupied" / „Parcialmente ocupado" / „Gedeeltelijk bezet"
- `charging.status.partialCount` = Format „Belegt {n}/{total}"

## Nicht im Scope

- Keine Änderungen an `PublicChargeStatus.tsx` (funktioniert bereits korrekt).
- Keine Änderungen an `ChargePointDetail.tsx` (zeigt Pro-Stecker-Status bereits via `ConnectorStatusGrid`).
- Keine DB-/Backend-/OCPP-Änderungen — alle nötigen Daten (`charge_point_connectors.status` und `charging_sessions.connector_id`) sind bereits vorhanden.
- Keine Anpassung der „Ladevorgänge"-Tabelle (Screenshot 1) — die ist korrekt, dort geht es um Sessions, nicht um Ladepunkte.
