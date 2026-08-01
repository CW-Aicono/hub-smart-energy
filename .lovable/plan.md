# Fix: 2.600-kW-Geisterwert Jugendzentrum Weiss

## Was tatsächlich passiert ist (in den Daten verifiziert)

Der Peak ist kein Messwert und kein Ausreißer — es ist der **Zählerstand in kWh, der als Leistung in kW verbucht wurde**.

Gegenprobe aus der Datenbank, Bucket 19:25/19:30 Uhr (Ortszeit):

| Zähler | `power_max` im Peak-Bucket | Zählerstand `energy_total_kwh` |
|---|---|---|
| Balkonkraftwerk LoRa | 949,7025 | **949,701** |
| Zähler PC-Raum | 98,3095 | (eigener Summenstand) |
| Zähler Hauptanschluss | 2.777,97 | (eigener Summenstand) |

Beim Balkonkraftwerk stimmen Peak und Zählerstand auf drei Nachkommastellen überein. Damit ist bewiesen: In das Leistungsfenster sind Zählerstände geflossen.

Zusätzliche Belege:
- Die Peak-Buckets haben `sample_count` 211 bzw. 655. Ein normaler 5-Minuten-Bucket hat 30. Es wurden also Ereignisse aus einem ganzen Nachlauf-Schwall in ein einziges Fenster gekippt.
- Der letzte gesunde Bucket ist 19:15 Uhr (0,58 kW, 30 Samples). Zwischen 19:15 und 19:25 fehlt jede Zeile — das ist das Ausfallfenster.
- Beide Peak-Zeilen wurden erst um 19:26 und 19:35 geschrieben (`created_at`), also nach der Wiederverbindung.

## Ursache im Code

`docs/loxone-ws-worker/index.ts`

1. **Zeile 1455–1482 (Reload-Pfad):** Wenn die WebSocket-Verbindung nicht authentifiziert ist — genau der Zustand nach einem Ausfall — baut der Worker die `uuidMap` notdürftig neu auf und registriert dabei die **Block-UUID** mit `role: momRole ?? "aux"`, also in der Regel `"pwr"`. Die Block-UUID eines Loxone-Messblocks liefert aber den **Summenwert (kWh)**, nicht den Momentanwert. Der Kommentar im Code sagt "wird in connect() durch LoxAPP3-Expansion ersetzt" — bis diese Expansion durch ist, laufen Zählerstände als Leistung durch.
2. **Zeile 616–641 (Bucket-Aggregation):** Der Bucket-Zeitstempel wird aus `Date.now()` beim Empfang gebildet, nicht aus dem Ereigniszeitpunkt. Nach der Wiederverbindung schickt der Miniserver seine komplette Statustabelle in einem Schwall — alle landen im Empfangs-Bucket. Daher 655 Samples in fünf Minuten.
3. **Zeile 1649–1659 (Flush):** `pending_buckets` wird geleert, **bevor** der POST bestätigt ist. Schlägt der Upload fehl (Backend down), sind die Daten weg. Das erklärt die Lücke 19:15–19:25.

## Umsetzung

### 1. Worker v1.17 — Rollen niemals provisorisch raten
- Im Reload-Pfad die Block-UUID **nicht mehr** mit `role: "pwr"` registrieren. Stattdessen `role: "aux"` setzen und `momentary_role` als reine Absichtserklärung mitführen.
- In der Bucket-Aggregation (Zeile 616) zusätzlich verlangen, dass der Eintrag aus der LoxAPP3-Expansion stammt (neues Flag `role_confirmed: true`). Nur bestätigte `pwr`/`flow`-States dürfen in `meter_power_readings_5min` schreiben. Kein Wert ist besser als ein falscher Wert.

### 2. Nachlauf-Schwall nicht in einen Bucket kippen
- Ereignisse, die innerhalb der ersten Sekunden nach `authenticated` eintreffen, sind der Statustabellen-Dump, keine Zeitreihe. Diese als Initialzustand behandeln (`latest_value` setzen), aber nicht in die Bucket-Summe aufnehmen.
- Harte Obergrenze pro Bucket: `sample_count` > 90 (dreifache Normalrate) wird als strukturell falsch verworfen und protokolliert — das ist keine Peak-Kosmetik, sondern eine Konsistenzprüfung auf die Anzahl, nicht auf den Wert.

### 3. Flush erst nach bestätigtem Upload leeren
- `pending_buckets` und der aktuelle Bucket werden erst zurückgesetzt, wenn `ingestPost` erfolgreich war. Bei Fehler bleiben sie im Puffer und werden beim nächsten Durchlauf erneut versucht (Ringpuffer bleibt bei 24 Buckets).

### 4. Serverseitige Einheitensperre in `gateway-ingest`
- Im Handler `bridge-power-5min` eine Plausibilitätsgrenze gegen die Messstellen-Konfiguration ziehen: Ein Wert wird abgelehnt, wenn er den bekannten Zählerstand des Meters (`meter_loxone_daily_snapshots.energy_total_kwh`) trifft oder überschreitet. Das ist die Signatur einer Einheitenverwechslung, nicht die eines Lastspitzenwerts. Abgelehnte Zeilen werden in `bridge_worker_logs` protokolliert, damit so etwas sichtbar wird statt still im Graphen zu landen.

### 5. Bereinigung der bereits geschriebenen Falschdaten
- Migration: Zeilen in `meter_power_readings_5min` löschen, deren `sample_count` über 90 liegt (das trifft exakt die kontaminierten Buckets, nicht die gesunden mit 30).
- Anschließend die abhängigen Aggregate (`meter_period_totals`, stündliche Rollups) für den betroffenen Tag neu berechnen.

## Technische Details

Betroffene Dateien:
- `docs/loxone-ws-worker/index.ts` — Punkte 1–3, Version auf `v1.17-confirmed-roles`
- `supabase/functions/gateway-ingest/index.ts` — Punkt 4, Handler `bridge-power-5min`
- neue Migration — Punkt 5

Der Worker läuft extern auf Hetzner; nach dem Merge ist ein Redeploy des Workers nötig, damit Punkte 1–3 greifen. Punkte 4 und 5 wirken sofort und schützen die Datenbank auch gegen eine ältere Worker-Version.
