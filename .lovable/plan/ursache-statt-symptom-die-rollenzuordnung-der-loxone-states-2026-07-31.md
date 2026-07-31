# Ursache statt Symptom: die Rollenzuordnung der Loxone-States

Du hast recht. Die bisherigen Punkte 3 und 4 waren Symptombekämpfung: erst falsche Werte erzeugen, dann per Heuristik erkennen und wegputzen. Jede solche Heuristik hat genau das Problem, das du benannt hast — sie kann echte Anlaufspitzen nicht sicher von Zählerständen unterscheiden. Der Plan wird deshalb umgebaut.

## Die eigentliche Ursache

Der Loxone-WS-Worker **rät zur Laufzeit**, welcher State eines Bausteins die Momentanleistung ist. `classifyAux()` (`docs/loxone-ws-worker/index.ts`) stuft einen State als Leistung ein, sobald sein Wert einmal fällt oder negativ ist. Ein kumulativer Zählerstand fällt aber ebenfalls — bei Reset, Miniserver-Neustart oder Überlauf. Ab diesem Moment schreibt der Worker den Zählerstand dauerhaft in die Leistungsreihe. Genau das ist beim „Zähler Kühlschrank" passiert (100,49 in der Leistungsreihe = Zählerstand 100,6 kWh).

Verifiziert:
- In den letzten 48 h: 16 × `ws_mapping_gap` (Blöcke, in denen der Worker keine Leistung sicher erkennt und deshalb raten muss), 1 × `ws_automap_pwr`.
- `bridge_raw_samples` ist aktuell **leer** — die Rohdaten werden seit der IO-Optimierung nicht mehr dauerhaft gehalten. Eine Neuberechnung falscher Buckets aus den Rohdaten ist damit nicht möglich; umso wichtiger ist, dass gar nichts Falsches mehr entsteht.

Solange geraten wird, entsteht der Fehler immer wieder — an anderen Bausteinen, in anderer Form. Alles Weitere ist Nachsorge.

## Umsetzung

### 1. Raten abschaffen: deterministische Rollenzuordnung (Worker v1.15)
Die Rolle eines States wird nicht mehr aus dem Werteverlauf abgeleitet, sondern aus dem, was der Miniserver selbst liefert:
- Rolle kommt aus **State-Name + Einheit** der Loxone-Struktur (`LoxAPP3.json`): `actual/momentan/leistung` mit Einheit W/kW → Leistung; `total/gesamt/zaehler` mit kWh/m³ → Zählerstand; alles andere bleibt `aux` und wird **nicht** in die Leistungsreihe geschrieben.
- `classifyAux()` als Umstufungsmechanismus entfällt ersatzlos. Ein State, der nicht sicher als Leistung erkannt ist, liefert lieber gar keine Leistung als eine falsche.
- Wo die Struktur keine eindeutige Zuordnung hergibt, wird das als `ws_mapping_gap` gemeldet — sichtbar, statt still geraten.

### 2. Die Lücke sichtbar und manuell auflösbar machen
Damit „lieber nichts als falsch" nicht zu fehlenden Live-Werten führt, bekommt jeder Zähler eine explizite, gespeicherte State-Zuordnung:
- Neue Spalte für die Leistungs-State-UUID am Zähler (getrennt von `sensor_uuid` für den Zählerstand).
- Im Super-Admin / in der Zählerverwaltung eine Ansicht „Nicht zugeordnete Loxone-States": pro Baustein die vorhandenen States mit Name, Einheit und aktuellem Wert; der Admin wählt einmalig den richtigen aus.
- Der Worker nutzt ausschließlich diese Zuordnung. Einmal gesetzt, kann sie sich nie mehr selbsttätig ändern.

### 3. Eine Invariante am Schreibpunkt — keine Wertfilterung
Im `bridge-aggregator` (einziger Schreibpfad in `meter_power_readings_5min`) wird geprüft, ob der eingehende State **die Leistungsrolle des Zählers laut Zuordnung** hat. Ist er es nicht, wird nichts geschrieben. Es wird weiterhin **kein Wert wegen seiner Höhe verworfen** — der bestehende Deckel von 500 kW für Strom bleibt unverändert, echte Anlaufspitzen darunter passieren wie bisher.

### 4. Anzeige auf die vorhandenen, geprüften Werte umstellen
Unabhängig von der Ursache bleibt richtig, was du vorher gesagt hast: der Detaildialog soll nicht selbst rechnen.
- KPI „Energie" kommt aus `meter_period_totals` (dieselbe Quelle wie „Gesamt heute" der Kachel), nicht mehr aus der Trapez-Integration.
- Leistungsverlauf und Ø/Max/Min über `fetchPowerSeriesAuto` (`src/lib/powerSeries.ts`) — derselbe Pfad wie Dashboard und Analytics Studio.

### 5. Altlast: einmalige, belegte Korrektur — kein Dauerfilter
Die bereits geschriebenen Fehlzeilen bleiben ohne Eingriff stehen und verfälschen Ø/Max weiter. Sie werden **einmalig** entfernt, und zwar nur dort, wo der State nach der neuen Zuordnung nachweislich der Zählerstand-State ist — also über die Rollenzuordnung, nicht über Wertgrößen oder Medianabstände. Kein Trigger, kein dauerhafter Filter, keine Löschung nach Höhe. Die Trefferliste je Zähler wird dir vor dem Löschen zur Freigabe vorgelegt.

## Verifikation

- Für jeden Loxone-Zähler ist die Leistungs-State-UUID gesetzt oder er erscheint in der Lücken-Liste. Kein Zähler läuft mehr über eine geratene Zuordnung.
- „Zähler Kühlschrank", 24 h: Energie identisch zur Kachel; Ø/Max im Bereich 0,05–0,07 kW.
- Gegenprobe echte Spitze: ein Zähler mit realem Anlaufstrom behält seinen Ausschlag in Graph und Max — nachgewiesen an einem konkreten Zeitpunkt vor/nach der Umstellung.
- `ws_mapping_gap`-Zähler im `bridge_event_log` geht nach der manuellen Zuordnung gegen 0.

## Technische Details

Geändert: `docs/loxone-ws-worker/index.ts` (Rollenzuordnung, Entfall `classifyAux`) + `docs/loxone-ws-worker/UPDATE-v1.15-role-mapping.md`; Migration für die Leistungs-State-Spalte an `meters`; `supabase/functions/bridge-aggregator/index.ts` (Rollenprüfung am Schreibpunkt); UI für die Zuordnung; `src/components/dashboard/EnergyFlowMonitor.tsx` (Energie-KPI + Serienabfrage); eine einmalige Bereinigungsmigration. Der Worker auf Hetzner muss nach dem Merge neu gebaut und gestartet werden.
