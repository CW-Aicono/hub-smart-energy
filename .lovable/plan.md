

## PV-Sägezahn: echte Ursache + Fix

### Was wirklich passiert (mit Daten belegt)

PV-Meter „Erzeugung" (Tenant Stadt Steinfurt, `d8baaf1e-b94a-4f49-ba53-6bc074255702`), heute 9–18 Uhr lokal:

- **Rohwerte (`meter_power_readings`)**: 50–60 Werte pro Stunde, **lückenlos und glatt** (z. B. 12:00 –91.1, 12:01 –90.9, 12:02 –90.8 …). **Kein einziger 0-Wert** in den produktiven Stunden.
- **5-Min-Tabelle (`meter_power_readings_5min`)**: pro Stunde nur **2 Einträge** (`HH:00` und `HH:30`), jeweils `sample_count = 1`.
- Diese 30-Min-Punkte stammen aus dem **Loxone-Statistik-XML-Backfill** in `supabase/functions/loxone-api/index.ts` (Zeilen 1314–1358). Loxone-Statistikdateien speichern intern nur einen Wert alle 30 Minuten — der Backfill-Pfad verkleinert dadurch die Auflösung.
- `get_power_readings_5min` mischt 5-Min-Tabelle + On-the-fly-Aggregat aus Rohwerten, schließt dabei aber alle Buckets aus, die in der 5-Min-Tabelle bereits existieren. Dadurch landen die guten 5-Min-Aggregate aus den minutengenauen Rohwerten **nur in den 25 Minuten dazwischen** — und an `:00`/`:30` springt die Linie auf den (oft niedrigeren) Backfill-Wert. Das ist der Sägezahn.
- Loxone liefert also keine Nullen und es ist auch kein Filter-Problem. Es ist ein **Auflösungskonflikt**: 1-Minuten-Live-Polling ↔ 30-Minuten-Backfill, wobei der gröbere Wert „gewinnt".

### Lösung (klein, präzise, ohne Schema-Änderung)

Drei voneinander unabhängige Stellen, jede einzeln deploybar:

**1) `get_power_readings_5min` (DB-Funktion) — Backfill nicht mehr bevorzugen**
- Neue Logik: pro `meter_id`+`bucket` **bevorzuge den Eintrag mit höherem `sample_count`** (Roh-Aggregat hat typisch ≥ 4, Backfill hat 1).
- Umsetzung: erst `UNION ALL` aus 5-Min-Tabelle und On-the-fly-Aggregat aus Rohwerten **ohne** Ausschluss-Filter, dann `DISTINCT ON (meter_id, bucket) … ORDER BY meter_id, bucket, sample_count DESC`.
- Effekt: an `:00`/`:30` setzt sich der minutengenaue Wert durch, sobald genügend Rohwerte da sind. Backfill bleibt Fallback für Tage, an denen die Rohdaten schon weggeräumt sind (`compact_power_readings_day` löscht Rohwerte älter als ~1 Tag).

**2) Loxone-Backfill (`supabase/functions/loxone-api/index.ts`) — keine Single-Sample-Buckets schreiben**
- In der 5-Min-Bucket-Berechnung des Statistik-XML-Imports nur Buckets schreiben, deren `count >= 2`. Der typische 30-Min-Loxone-Wert wird sonst zu einem fest verankerten Sägezahn-Anker.
- Zusätzlich: bei `count == 1` als `power_avg` keinen Mittelwert speichern, der so tut als sei er repräsentativ — wir überspringen ihn vollständig.
- Effekt: für aktuelle Tage entstehen gar keine Konkurrenz-Buckets mehr. Reine 30-Min-Punkte aus historischen Statistikdateien bleiben erhalten, aber Punkt 1 sorgt dafür, dass sie nur dort wirken, wo nichts Besseres existiert.

**3) `compact_power_readings_day` (Cron, gestern) — Median statt Mittelwert, konsistent mit Punkt 1**
- Aggregations-Job nutzt aktuell `avg()`. Auf **Median** umstellen (`percentile_cont(0.5) WITHIN GROUP (ORDER BY power_value)`), damit auch beim endgültigen Verdichten ein einzelner Ausreißer nicht den Bucket verzerrt.
- `power_max` bleibt als echter Maximalwert für die Lastspitzen-Auswertung erhalten.

Keine Frontend-Änderung nötig — sobald die DB-Funktion korrekte Buckets liefert, sind die Zacken im Tageschart weg.

### Verifikation

1. Direkt nach Deploy in `meter_power_readings_5min` für `d8baaf1e-…` heute prüfen:
   - vor dem Fix: 2 Einträge/Stunde, `sample_count = 1`
   - nach dem Fix: ~12 Einträge/Stunde aus Rohdaten, `sample_count` zwischen 4 und 6
2. Tageschart `Erzeugung` neu laden → glatter Verlauf, keine 30-Min-Zacken.
3. Gegenprobe an einem Verbrauchsmeter (`PAC 3220 NSHV Süd`) → echte Lastwechsel bleiben sichtbar.
4. Rückwärts: Tag von vor 7 Tagen aufrufen — dort darf weiterhin der Backfill greifen (nur 30-Min-Auflösung), Linie bleibt stetig (keine Nullen, keine Sprünge auf 0).

### Betroffene Dateien

- `supabase/migrations/<neu>.sql` — `get_power_readings_5min` neu, `compact_power_readings_day` auf Median
- `supabase/functions/loxone-api/index.ts` — Backfill-Schreibpfad: nur Buckets mit `count >= 2`

Keine Tabellen-Änderung, kein Frontend-Eingriff, keine UI-Layout-Anpassung.

