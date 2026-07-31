# Rollen aus den Messstellen-Einstellungen ableiten — kein zweites Regelwerk

Kein Denkfehler, du hast recht. Die Information, die der Worker zum Zuordnen braucht, steht bereits am Zähler. Das Mapping-Panel soll nicht parallel dazu ein eigenes Wissen aufbauen, sondern das vorhandene benutzen.

## Was heute schon in der Datenbank steht (verifiziert)

`meters` hat neben `energy_type` bereits `device_type`, `source_unit_power` und `source_unit_energy` — genau die Felder aus dem Dialog „Gerät bearbeiten" („Einheit des Gateways"). Aktueller Bestand der Loxone-verknüpften Geräte:

- 35 × `meter` / `strom` mit kW + kWh
- 5 × `meter` / `gas` mit kW + kWh
- 1 × `meter` / `wasser` mit **m³/h + m³**
- 16 × `actuator` und 9 × `sensor` mit `bool` + `bool` (Taster, Schaltausgänge — z. B. „Reset Max Gesamt")

Damit ist pro Gerät bereits eindeutig hinterlegt, ob und in welcher Einheit ein Momentanwert erwartet wird.

## Umsetzung

### 1. Der Worker liest die erwartete Rolle aus dem Zähler (v1.16)
Statt der Sonderregel `isFlowLikeType()` (aktuell in `docs/loxone-ws-worker/index.ts`, Zeile 706, sperrt Gas/Wasser pauschal aus) entscheidet die Konfiguration des Zählers:

- `device_type = actuator/sensor` mit `source_unit_power = bool` → **kein** Momentanwert erwartet. Der Block wird als reiner Schalt-/Statusbaustein geführt und taucht gar nicht mehr als offene Zuordnung auf.
- `source_unit_power` = kW/W → Momentanleistung (Rolle `pwr`), wie bisher.
- `source_unit_power` = m³/h, l/min, l/h → **Durchfluss** (neue Rolle `flow`) — für Gas und Wasser aus dem Reedkontakt-Impuls, den der Miniserver bereits in eine Menge/Zeit umrechnet.
- Der passende State wird über Name **und** die Einheit aus der Loxone-Struktur gewählt; stimmt die Einheit nicht mit der am Zähler hinterlegten überein, wird nichts geschrieben und die Abweichung gemeldet — statt zu raten.

### 2. Das Mapping-Panel wird zur Ausnahmeliste
Es bleibt nur für den Rest: Blöcke, bei denen Zählerkonfiguration und Loxone-Struktur nicht zusammenpassen. Konkret:
- Aktoren/Taster und alles mit `bool` verschwinden aus der Liste.
- Bei Gas/Wasser heißt die Spalte „Durchfluss-State" (m³/h) statt „Leistungs-State".
- Zeile mit Konflikt zeigt an, was erwartet wurde und was der Miniserver liefert, plus Direktlink „Messstelle bearbeiten" — der Fix passiert dort, nicht in einem Zweit-UI.

### 3. Gas: m³ ist die Quelle, kWh das Ergebnis
Korrektur zum vorherigen Entwurf: Die Einheit am Gaszähler ist bereits richtig auf **m³** gesetzt. Der Miniserver liefert m³ (Menge) bzw. m³/h (Durchfluss); die Umrechnung in kWh bzw. kW passiert bei uns über Gasart, Zustandszahl und Brennwert (Beispiel: 0,9636 × 11,5 kWh/m³). Es wird also nichts an den 5 Gaszählern umkonfiguriert.

Konsequenz für den Worker: Er speichert für Gas den Rohwert in m³/h als `flow` **und** den daraus errechneten kW-Wert in der Leistungsreihe — die Umrechnung erfolgt einmal zentral mit den am Zähler hinterlegten Gas-Parametern, nicht im UI.

Wasser bleibt unverändert bei m³ und m³/h — keine Umrechnung, keine kWh, keine kW.

### 4. Anzeige
Wasser: Kacheln und Detaildialog zeigen m³/h (Ø/Max/Min) und m³ als Menge. Gas: kW und kWh wie bei Strom, zusätzlich der m³-Rohwert im Tooltip zur Nachvollziehbarkeit. Die Mengen-KPI bleibt in beiden Fällen aus `meter_period_totals`.


## Verifikation
- „Wasserzähler Hausanschluss" (m³/h konfiguriert): Live-Durchfluss erscheint, `total` bleibt Zählerstand.
- „Reset Max Gesamt" und alle weiteren 24 bool-Geräte tauchen nicht mehr im Mapping-Panel auf.
- Keine Zeile in `meter_power_readings_5min`, deren Größenordnung einem Zählerstand entspricht (Stichprobe 24 h nach Deploy).

## Technische Details
Geändert: `docs/loxone-ws-worker/index.ts` (Rollenableitung aus `device_type`/`source_unit_power`, neue Rolle `flow`, Entfall `isFlowLikeType` als Pauschalsperre) + `docs/loxone-ws-worker/UPDATE-v1.16-unit-driven-roles.md`; `supabase/functions/gateway-ingest` liefert die Einheitenfelder im Link-Payload mit; `bridge-aggregator` routet `flow`; `src/components/super-admin/LoxoneStateMappingPanel.tsx` wird zur Konfliktliste. Worker auf Hetzner nach dem Merge neu bauen und starten.
