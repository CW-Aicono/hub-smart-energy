## Was ich in der Historie und Datenbank gefunden habe

Deine Vermutung ist richtig: Die Ursache liegt **nicht** an den Miniservern und auch **nicht** an einer Code-Änderung um 23:55 Uhr. Sie liegt in einem Datenbank-Cronjob, der seit längerer Zeit inaktiv ist – das ist nur **gestern Nacht durch die tägliche Kompaktierung sichtbar geworden**.

### Timeline der relevanten Änderungen (UTC)
| Zeit | Commit | Was passierte |
|---|---|---|
| Do 18.06. 18:46 | `Forward-Fill pro Zähler implementiert` | reine Frontend-Änderung im EnergyChart |
| Do 18.06. 22:34–23:06 | mehrere Super-Admin-Fixes, `Data-API-Rechte ergänzt` | nur GRANTs, keine Daten-Pipeline-Änderung |
| **Fr 19.06. 00:05** | **kein Commit – nur Cronjob `compact-meter-power-readings-daily`** | aggregierte den 18.06. in `meter_power_readings_5min` und **löschte** alle Rohdaten vom 18.06. |
| Fr 19.06. 07:13 | `Maßnahmen 1,2,6,7,8 umgesetzt` | Worker IO-Optimierung (FLUSH 1s→5s, MIN_DELTA 0.01 kW, MIN_PUSH 60s) + Migration die `loxone-power-readings-sync` deaktiviert |
| Fr 19.06. 08:23 | `Cron-Job erstellt und aktiviert` | neuer Cron `refresh-meter-period-totals-5min` – aggregiert aber nur **aus** 5min in Tagessummen, schreibt **nicht in** die 5min-Tabelle |
| Fr 19.06. ~08:20 | Hetzner-Deploy | Worker läuft neu mit IO-Optimierung; WS verbunden (siehe Screenshot: „seit 7 Stunden") |

### Was die Datenbank sagt
1. **Rohdaten kommen weiter sauber an** – `meter_power_readings` hat heute zwischen 03:00 und 15:00 UTC zwischen **316 und 3.705 Zeilen pro Stunde**. Der WebSocket-Worker funktioniert also.
2. **Die 5-Min-Tabelle ist seit 23:55 UTC leer** – letzter Bucket: `2026-06-18 23:00`, danach 0 Zeilen.
3. Der einzige Cron, der Rohdaten in 5-Min-Buckets schreibt, ist **`gateway-power-readings-sync` – Status `active = false`**. Er ruft `gateway-periodic-sync` jede Minute auf.
4. Der Cron `compact-meter-power-readings-daily` (`SELECT * FROM compact_power_readings_day()`) lief um 00:05 UTC und macht zwei Dinge:
   - aggregiert die Rohdaten von **gestern** in `meter_power_readings_5min`
   - **`DELETE FROM meter_power_readings`** für den gleichen Zeitraum

### Warum alles auf einmal stoppt
Solange Rohdaten **älter als 1 Tag** in der Tabelle stehen, hat der `compact`-Job sie jeden Mittag aggregiert – das hat die fehlende Echtzeit-Aggregation kaschiert. Seit der täglichen Kompaktierung in der heutigen Nacht ist diese „Krücke" weg, weil:
- Daten vom 18.06. wurden um 00:05 aggregiert (deshalb der letzte Bucket 23:55 UTC)
- Daten vom 19.06. sind **noch nicht alt genug** zum Kompaktieren
- Es gibt **niemanden**, der sie aktuell in die 5-Min-Tabelle schreibt

Das erklärt **alle** beobachteten Symptome:
- alle 3 Miniserver fallen exakt zur gleichen Sekunde aus (nichts Netzwerk-bezogenes)
- WS-Verbindung steht, Heartbeat ok, Events kommen rein
- Dashboards zeigen keine neuen Werte
- Backfill würde morgen früh um 00:05 alle heutigen Daten plötzlich wieder „zaubern" – aber zu spät

## Plan zur Verifikation und Behebung

### Schritt 1 – Verifikation (read-only, keine Änderung)
1. Bestätigen, dass `meter_power_readings` heute durchgängig befüllt ist (✔ bereits gezeigt: 316–3705/h).
2. Bestätigen, dass `meter_power_readings_5min` seit `2026-06-18 23:55 UTC` keinen neuen Bucket hat (✔).
3. Bestätigen, dass `cron.job` für `gateway-power-readings-sync` `active = false` ist (✔).
4. Edge-Logs prüfen: hat `gateway-periodic-sync` heute überhaupt einmal gelaufen (manuelle Aufrufe)?
5. Definition von `gateway-periodic-sync` lesen, um sicherzustellen, dass es die Aggregation aus den Rohdaten korrekt macht.

### Schritt 2 – Sofortmaßnahme (ein einziger SQL-Befehl)
Den deaktivierten Cron-Job wieder aktivieren:
```sql
UPDATE cron.job SET active = true WHERE jobname = 'gateway-power-readings-sync';
```
Erwartung: innerhalb von 1–2 Minuten erscheinen neue 5-Min-Buckets für heute, die Dashboards füllen sich.

### Schritt 3 – Backfill der heutigen Lücke
Einmalig `gateway-periodic-sync` für den Zeitraum **2026-06-19 00:00 UTC bis jetzt** manuell aufrufen (oder `compact_power_readings_day(CURRENT_DATE)` falls die Funktion das unterstützt – muss vorher geprüft werden, da sie sonst Rohdaten löscht).

### Schritt 4 – Ursache der Deaktivierung klären
Im Migrations-Verzeichnis prüfen, **wann und warum** `gateway-power-readings-sync` auf `active = false` gesetzt wurde, damit es nicht wieder passiert. Verdacht: bei einer früheren „IO-Optimierung" wurde der falsche Cron deaktiviert (statt nur Loxone-Duplikat).

### Schritt 5 – Monitoring absichern
Auf der Super-Admin-Monitoring-Seite eine **kleine Health-Anzeige** ergänzen: „Letzter 5-Min-Bucket vor X Minuten" pro Tenant – schlägt rot an, wenn > 15 Minuten alt. So fällt eine erneute Pipeline-Unterbrechung sofort auf, statt erst beim nächsten Mitternachts-Job.

### Was bewusst NICHT zum Plan gehört
- **Keine** Änderung am Loxone-Worker – die heutige IO-Optimierung ist nicht die Ursache.
- **Keine** Debug-Logs auf Hetzner – die geringe Eventzahl im Screenshot ist ein separates, kleineres Thema (UUID-Match) und nicht der Grund für die fehlenden Dashboard-Werte.
- **Keine** Schemaänderungen.

## Nächster Schritt
Bitte gib mir grünes Licht, dann:
1. zeige ich dir die Verifikationsergebnisse aus Schritt 1 vollständig,
2. führe Schritt 2 (`UPDATE cron.job …`) per Migration aus,
3. mache Schritt 3 (Backfill) sauber und
4. baue Schritt 5 (Monitoring) ein.
