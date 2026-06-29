## Konzept

Deine Idee und meine decken sich — wir setzen sie als **virtuellen Bilanz-Zähler** um, der die bestehende Virtual-Meter-Infrastruktur (`virtual_meter_sources`) nutzt und um „Live-Wallbox-Summe" erweitert.

Formel (pro Liegenschaft):

```text
Netz = Σ Verbrauch + Σ Wallbox-Ist-Leistung − Σ PV − Speicher-Entladung + Speicher-Ladung
       (positiv = Bezug, negativ = Einspeisung)
```

Als Quellen sind sowohl **Testzähler** (Slider) als auch **echte Zähler** erlaubt — beliebig mischbar. So kann z. B. PV per Slider simuliert, Hausverbrauch aus echter Messung, Wallboxen aus echten OCPP-MeterValues kommen.

## UI

### 1. Neue Erfassungsart beim Anlegen eines Zählers: „Bilanz-Zähler (virtuell)"

Im Anlege-Dialog (`AddMeterDialog`) eine 5. Option zusätzlich zu manuell / automatisch / virtuell / simulation:

- **Rolle:** standardmäßig `grid` (Netz)
- **Quellen-Picker** (Mehrfachauswahl, Vorzeichen pro Quelle wählbar):
  - PV-Erzeugung (`production`) → **negativ** in Bilanz
  - Hausverbrauch (`consumption`) → **positiv**
  - Wallbox-Gruppe oder einzelne Wallboxen → **positiv** (Live aus `charge_point_connectors.current_power`)
  - Speicher (`storage`) → Vorzeichen je nach Lade-/Entladerichtung
- Jede Quelle darf entweder ein Testzähler (Slider) oder ein echter Zähler sein.
- TEST-Badge erscheint sobald **mindestens eine** Quelle ein Testzähler ist.

### 2. Detail-Karte „Simulations-Szenario" auf Messstellen-Seite

Für eine Liegenschaft, in der mindestens ein Bilanz-Zähler mit Testzähler-Quellen existiert, zeigen wir oben eine kompakte Bilanz-Karte:

```text
[TEST] Simulations-Bilanz · Liegenschaft Musterstraße
─────────────────────────────────────────────────────
PV (Sim)          15,0 kW   ████████░░
Hausverbrauch      1,5 kW   █░░░░░░░░░
Wallbox A (real)   7,4 kW   ████░░░░░░
Wallbox B (real)   0,0 kW   ░░░░░░░░░░
─────────────────────────────────────────────────────
Netz (berechnet) −6,1 kW   ◄ EINSPEISUNG
```

Die Testzähler-Slider sind direkt in der Karte editierbar (PV, Grundlast, Speicher-Leistung). Wallbox-Zeilen sind read-only und aktualisieren sich realtime.

## Datenfluss

```text
Slider (PV, Last, Speicher) ─► simulation_meter_state
                                      │
charge_point_connectors                │
  .current_power (realtime) ───────────┤
                                      ▼
                       computeVirtualBalance(meterId)
                       (neuer Helper, Browser + Edge)
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
       LiveValues-UI            DLM-Scheduler           PV-Überschuss-
       (Netz-Kachel)            (Referenzzähler)        Scheduler
```

- Kein neuer Persistenz-Layer für die Bilanz — sie wird on-demand berechnet (billig: max. eine Handvoll Summanden).
- Realtime-Updates kommen über die existierenden Channels (`simulation_meter_state` + `meter_power_readings` für Wallboxen).

## Beispielablauf (dein Szenario)

| t | PV-Slider | Wallbox A (real) | Wallbox B (real) | Berechneter Netz-Wert | DLM/PV-Scheduler |
|---|---|---|---|---|---|
| 0 | 15 kW | 0 | 0 | −15 kW (Einspeisung) | User 1 darf 11 kW starten |
| 1 | 15 kW | 11 kW | 0 | −4 kW (Einspeisung) | passt, noch Überschuss |
| 2 | 15 kW | 11 kW | 7 kW | +3 kW (Bezug) | drosselt / pausiert Laden |

Slider bleibt konstant, Regelwert ändert sich automatisch — exakt das gewünschte Verhalten.

## Umsetzung (technisch)

1. **DB-Migration**
   - `meters.capture_type` erlaubt zusätzlich `'virtual_balance'`.
   - Erweiterung `virtual_meter_sources` um Spalten `sign smallint` (+1/−1) und `source_kind enum('meter','charge_point','charge_point_group')`, damit auch Wallboxen als Quelle eingetragen werden können.
   - `simulation_meter_state` bleibt unverändert (PV, Grundlast, Speicher sind jeweils eigene `capture_type='simulation'`-Zähler).

2. **Helper** `computeVirtualBalance(meterId)` in
   - `src/lib/virtualBalance.ts` (Browser)
   - `supabase/functions/_shared/virtualBalance.ts` (Edge, gleicher Code)
   liest Quellen, summiert mit Vorzeichen, ergänzt Wallbox-Ist-Leistungen aus `charge_point_connectors.current_power`.

3. **Hook** `useVirtualBalance(meterId)` für Live-Anzeige (subscribet `simulation_meter_state` + relevante CP-Connectoren).

4. **Edge-Functions**
   - `dlm-scheduler` & `dlm-realtime-controller`: wenn Referenz-Zähler `capture_type='virtual_balance'`, statt Snapshot/Slider den berechneten Wert nehmen.
   - `solar-charging-scheduler` (PV-Überschuss): gleiche Behandlung.

5. **UI**
   - `AddMeterDialog`: neue Option + Quellen-Picker.
   - `MetersOverview`: neue Komponente `BalanceSimulationCard.tsx` mit Slidern (über `SimulationMeterControl` für die einzelnen Sim-Zähler) und Live-Bilanz.
   - TEST-Badge auf dem Bilanz-Zähler, sobald eine Quelle simuliert ist.

6. **Schutz**
   - Bilanz-Zähler mit Test-Quellen werden weiterhin aus Reporting/CO₂/Abrechnung ausgeschlossen.
   - Banner „Referenz-Zähler enthält Testwerte" in DLM- und PV-Überschuss-Konfiguration.

7. **Auto-Reset** der Slider nach 30 Min Inaktivität bleibt wie heute.

## Was bewusst NICHT geändert wird

- Bestehende einfache Testzähler (Sensor, °C, %, lx) bleiben unverändert — der Bilanz-Zähler ist additiv.
- Echte Virtual Meter (Summen-/Differenzzähler ohne Testanteil) funktionieren weiter wie bisher; sie bekommen nur die neue Option, Wallboxen als Quelle aufzunehmen.
