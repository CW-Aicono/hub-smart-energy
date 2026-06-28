## Ziel

Ein neuer "Testzähler / Simulationszähler" als vierte Erfassungsart neben Manuell, Automatisch und Virtuell. Werte werden ausschließlich im Arbeitsspeicher / via Realtime-Broadcast bereitgestellt — keine Persistenz in `meter_readings`, keine Graphen, keine Aggregation.

## Konzept

**Erfassungsart:** `simulation` (Label: „Testzähler (Simulation)")

**Kennzeichnung:**

- Orange/Amber Badge „TEST" überall wo der Zähler auftaucht (Kachel, Liste, Lastmanagement-Auswahl, Automation-Bedingungen)
- Warnhinweis im Dialog: „Werte werden nicht gespeichert. Nur für Tests."
- Eigenes Icon (FlaskConical)

**Bedienoberfläche** (neue Detail-Komponente / Sheet auf Messstellen-Seite):

- Großer horizontaler Slider + numerisches Eingabefeld
- Quick-Buttons: `0`, `25%`, `50%`, `75%`, `100%`, `Min`, `Max`
- Vorzeichen-Toggle bei bidirektionalen Größen (Bezug/Einspeisung, Laden/Entladen)
- Anzeige des aktuell gesendeten Werts groß in der Mitte
- „Stop"-Button → setzt 0 und stoppt Broadcast

## Einheiten & Wertebereiche

Auswahl bei Anlage (gekoppelt an Energieart und Verwendungszweck):


| Einheit       | Bereich           | Schritt | Typischer Use-Case                           |
| ------------- | ----------------- | ------- | -------------------------------------------- |
| kW            | −500 … +500       | 0,1     | Netzbezug/Einspeisung für DLM-Referenzzähler |
| A (pro Phase) | 0 … 250           | 1       | Strom pro Phase für Lastmanagement           |
| W             | −10.000 … +10.000 | 10      | Kleinverbraucher, Sensoren                   |
| %             | 0 … 100           | 1       | Auslastung, SoC-Simulation                   |
| °C            | −20 … +60         | 0,1     | Temperatur für Automationen                  |
| lx            | 0 … 100.000       | 100     | Helligkeit für Automationen                  |
| bool (0/1)    | 0 / 1             | —       | Schalter/Trigger für Automationen            |


Standard: **kW, Bereich −100 … +100**, sinnvoll für DLM-Tests.

## Zuordnung

- **Liegenschaft:** Pflichtfeld wie bei anderen Zählern (für RLS & Filter)
- **Etage/Raum:** optional
- **Zählerfunktion:** wählbar (`consumption`, `production`, `grid`, `storage`) — entscheidend für DLM-Referenzzähler-Auswahl
- **Bidirektional:** togglebar (erlaubt negative Werte als Einspeisung)
- **device_type:** `meter` oder `sensor` (steuert, ob er im DLM oder in Automation-Bedingungen erscheint)
- Wird in allen bestehenden Selektoren angeboten:
  - DLM-Referenzzähler (`useLocationDlmConfig`)
  - Energy-Flow-Monitor
  - Automation-Bedingungen (Sensorwert <, >, =)
  - Widget-Designer (sichtbar, aber mit TEST-Badge)

## Datenfluss (keine Persistenz)

```text
Slider-UI  ──setValue──►  Supabase Realtime Channel
                          "sim-meter:<meter_id>"
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
      LiveValues UI         DLM-Scheduler         Automation-Evaluator
      (Aktuelle Werte)      (liest letzten        (liest letzten
                             Broadcast statt       Broadcast statt
                             snapshot)             snapshot)
```

- Wert lebt in einem Realtime-Broadcast-Channel + im Browser-State der Bedienseite
- Server-seitig: kleine In-Memory-Map in den Edge-Functions (DLM, Automation) mit Fallback `0` falls > 5 Min kein Update
- **Keine** Inserts in `meter_readings`, `meter_period_totals_*`, `live_snapshots`
- DLM/Automation lesen den Wert über eine neue Helper-Funktion `getSimulatedMeterValue(meterId)` die zuerst Realtime-State, sonst 0 nimmt

## Sicherheit & UX-Schutz

- Simulationszähler werden **nie** für Reporting, CO₂-Bilanz, Abrechnung oder Rechnungen verwendet (Filter in entsprechenden Hooks: `capture_type !== 'simulation'`)
- Banner im Lastmanagement und in Automationen wenn ein Testzähler als Referenz gewählt ist: „Achtung: Referenzzähler ist ein TEST-Zähler"
- Auto-Reset auf 0 wenn Bedienseite > 30 Min nicht aktiv (verhindert vergessene Testwerte)

## Umsetzungsschritte (Code-seitig, später)

1. **DB-Migration:** `meters.capture_type` erlaubt zusätzlich `'simulation'`; neue Felder `sim_min`, `sim_max`, `sim_step`, `sim_unit`, `sim_current_value` (nur Default, kein Verlauf)
2. **CreateMeterDialog:** neuer Radio „Testzähler (Simulation)" + Konfigurationsfelder (Einheit, Bereich, Schritt, Bidirektional)
3. **Neue Komponente** `SimulationMeterControl.tsx` (Slider + Quick-Buttons + Broadcast)
4. **Hook** `useSimulationMeterValue(meterId)` — abonniert Realtime-Channel, liefert Wert
5. **Anpassungen** in:
  - `MetersOverview` / Kachel: TEST-Badge + Slider-Inline-Control
  - `LiveValues`: TEST-Badge + Live-Wert
  - DLM-Edge-Function: `getSimulatedMeterValue` Fallback
  - Automation-Evaluator (`packages/automation-core/evaluator.ts`): gleiches Lookup
  - Reporting/Invoice-Hooks: Simulation ausschließen
6. **Optional:** Auto-Reset-Timer & „Alle Testzähler stoppen"-Knopf in Settings

## Offene Punkte

Bevor ich die Migration & UI baue, kurz bestätigen:

- Soll der Wert auch **server-seitig** in einer kleinen Tabelle (`simulation_meter_state`, nur 1 Zeile pro Zähler, immer überschrieben) gehalten werden? Vorteil: DLM/Automation in Edge-Functions sehen den Wert sofort, auch ohne aktive Browser-Session. Nachteil: minimaler DB-Write bei jeder Slider-Bewegung (gedrosselt auf 1×/Sekunde). → **Empfehlung: ja**, sonst funktionieren DLM-Tests nur solange ein Browser-Tab offen ist.
- Sollen Testzähler in der Hauptliste „Messstellen" zusammen angezeigt werden oder in einem eigenen Tab „Testzähler"?  
  
Antworten:  
  
1. Bitte kleine Tabelle für Test-Zähler einbauen.  
  
2. Ja, mit in die Gesamtübersicht. Testzähler sollen hier deutlich sichtbar angezeigt werden. Bitte auch die Option mit integrieren, diese Geräte auch als Sensor für Tests mit Automationen nutzen zu können