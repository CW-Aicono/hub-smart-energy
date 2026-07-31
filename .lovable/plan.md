# Kachel vs. Detailansicht: Ursache und Bereinigung

## Befund (in der Datenbank verifiziert)

Beispiel „Zähler Kühlschrank" (Einheit kW, Typ Strom):

- Kachel: 0,00 kW live, 445 Wh heute, 100,6 kWh Zählerstand — das ist plausibel.
- Detailansicht: Ø 12,33 kW, Max 99,76 kW, Energie 192,90 kWh.

In `meter_power_readings_5min` stehen für diesen Zähler zwei völlig verschiedene Größenordnungen nebeneinander:

```text
19:05  power_avg 0,0494   power_max 0,0599   (echte Leistung)
13:35  power_avg 99,76    power_max 100,49   (= der Zählerstand 100,6 kWh)
```

Die Ausreißer stammen alle aus `source = 'bridge_ws'` und liegen exakt auf dem Wert des kumulativen Zählerstands. Der Loxone-WS-Worker schreibt also zeitweise den **Zählerstand (kWh) in die Leistungsreihe (kW)**.

Ursache im Worker (`docs/loxone-ws-worker/index.ts`, `classifyAux`, Zeile 1122 ff.): unbekannte States werden nach Werteverlauf klassifiziert. Sinkt ein monoton steigender Zählerstand auch nur einmal (Reset, Rundung, Neustart, Nullwert), wird `obs_decreased` gesetzt und der State dauerhaft als `pwr` eingestuft. Der Spike-Filter greift nicht, weil 100 kW für Strom (Limit 10.000) plausibel aussieht.

Die Detailansicht ist damit korrekt gerechnet, aber auf verunreinigten Daten:
- Ø/Max/Min kommen direkt aus der 5-Min-Reihe.
- „Energie" wird per Trapez-Integration aus derselben Reihe gebildet — ein 100-kW-Plateau über wenige Minuten erzeugt die 192,90 kWh.

Die Kachel nutzt dagegen den Live-Broadcast bzw. die Rollenwerte (`pwr`, `today`, `total`) und ist deshalb richtig.

Betroffen sind nicht nur diese Kachel. Auffällige `bridge_ws`-Buckets der letzten 48 h (|power_avg| > 20):

```text
ESB Leistung Sinec Energiespeicher 188 | Voltage L1-L2 52 | ESB Leistung Messschrank Wago 45
Erzeugung 22 | PAC 3220 NSHV Süd 20 | Zähler Gesamtverbrauch 16 | Zähler Kühlschrank 16
Eigenverbrauch 15 | Ostflügel OG Süd 12 | PAC 3220 NSHV Nord 11 | Einspeisung 6
```

Besonders deutlich: „Voltage L1-L2" mit 408 (Volt) und „Ostflügel OG Süd" mit 2939 in der Leistungsreihe.

## Umsetzung

### 1. Worker härten (v1.15)
- `classifyAux`: ein einzelner Rückgang reicht nicht mehr. `pwr` nur bei mehrfachen, echten Rückgängen (mind. 3 Abnahmen) **und** wenn der Wertebereich nicht monoton-kumulativ aussieht; Rückgang auf 0 oder ein Sprung auf einen kleineren Startwert (Reset) zählt nicht.
- Zusätzlicher Plausibilitätsvergleich: liegt der Kandidatenwert nahe am bereits bekannten `total`/`today` desselben Blocks, wird er nie zu `pwr`.
- Einmal als `total` erkannte States werden nicht mehr zu `pwr` umklassifiziert.
- Zähler-States mit Einheit V/A/Hz/°C dürfen nie in die Leistungsreihe schreiben.
- Neue Datei `docs/loxone-ws-worker/UPDATE-v1.15-role-hardening.md` mit laienverständlicher Update-Anleitung.

### 2. Serverseitiger Schutzwall
Trigger/Guard auf dem Ingest-Pfad für `meter_power_readings_5min`: Werte, die den zuletzt bekannten Zählerstand desselben Zählers treffen (±1 %) oder das Vielfache (>50×) des rollenden Medians der letzten 24 h überschreiten, werden verworfen und einmalig als Integrationsfehler protokolliert — statt still falsche Statistiken zu erzeugen.

### 3. Historie bereinigen
Migration, die die verunreinigten Buckets entfernt: `source = 'bridge_ws'` und `power_avg` innerhalb ±2 % des Zählerstands des jeweiligen Zählers bzw. > 50× des Medians der übrigen Buckets. Betroffen sind nach aktueller Zählung wenige hundert Zeilen; echte Lastspitzen bleiben erhalten. Vor dem Löschen wird die Trefferliste je Zähler ausgegeben.

### 4. Anzeige-Absicherung
In `MeterDetailDialog` (`EnergyFlowMonitor.tsx`) ein Robustheits-Filter für die Statistik: Punkte, die > 50× des Medians der Reihe liegen und zugleich dem Zählerstand entsprechen, fließen nicht in Ø/Max/Energie ein; stattdessen erscheint ein dezenter Hinweis „n Ausreißer ausgeblendet". Damit stimmen Kachel und Detail auch dann überein, wenn später erneut Fehlwerte durchrutschen.

## Verifikation

- Nach Bereinigung für „Zähler Kühlschrank" im 24-h-Fenster: Ø und Max im Bereich 0,05–0,07 kW, Energie im Bereich der 445 Wh der Kachel.
- Stichprobe „Voltage L1-L2" und „Ostflügel OG Süd": keine Leistungswerte mehr aus Spannungs-/Zählerstands-States.
- Worker-Log nach Update: keine neuen `ws_automap_pwr`-Meldungen für Zählerstands-States.

## Technische Details

Geänderte Dateien: `docs/loxone-ws-worker/index.ts` (+ Update-Doku), eine SQL-Migration (Guard-Funktion und Bereinigung), `src/components/dashboard/EnergyFlowMonitor.tsx`. Der Worker auf Hetzner muss nach dem Merge neu gebaut/gestartet werden; die Anleitung liegt der Änderung bei.
