# Lückenfüllung aus dem Gateway-Speicher statt Worker-Puffer

Deine Idee ist tragfähig — und das Fundament dafür existiert bereits.

## Was schon da ist (verifiziert)

`supabase/functions/loxone-api/index.ts`, Zeile 2311–2655: Die Aktion `backfillStatistics` lädt die binären `.LoxStat`-Dateien aus dem Verzeichnis `/stats/` des Miniservers, filtert auf **StatsGroup 1 (Momentanleistung in kW, nicht Zählerstand)**, bildet daraus 5-Minuten-Buckets und schreibt sie per Upsert (`onConflict: meter_id,bucket`) nach `meter_power_readings_5min` — plus Tagessummen nach `meter_period_totals`.

Sie wird heute nur **manuell** ausgelöst und über einen Datumsbereich gesteuert. Es fehlt also nicht der Abruf, sondern die **automatische Lückenerkennung**.

## Warum das die bessere Lösung ist

Der Worker-Puffer (`pending_buckets`, max. 24 Buckets = 2 Stunden) ist eine Krücke: Er geht bei einem Neustart verloren, wird beim Flush geleert bevor der Upload bestätigt ist, und produziert nach Wiederverbindung genau die Verfälschungen, die du im Graphen gesehen hast. Der Miniserver hält die Daten ohnehin monatelang und ist die verlässlichere Quelle.

Grenze, die man kennen muss: Loxone speichert Statistikpunkte **wertänderungsbasiert**, nicht in festem 5-Minuten-Raster. Bei ruhigen Zählern sind das teils nur alle 30 Minuten Punkte. Der nachgefüllte Verlauf ist deshalb gröber als die Live-Reihe — aber energetisch korrekt und ohne Geisterwerte. Der bestehende Code verwirft Buckets mit nur einem Sample bereits genau deshalb.

## Umsetzung

### 1. Automatische Lückenerkennung (neue Edge Function `gap-backfill-scheduler`)
- Läuft stündlich per Cron.
- Ermittelt je Zähler mit `capture_type = automatic` die Lücken in `meter_power_readings_5min` der letzten 48 Stunden (fehlende Buckets in einer erwarteten Reihe).
- Ignoriert Lücken unter 15 Minuten (normales Rauschen) und Zähler, die generell selten liefern.
- Fasst zusammenhängende Lücken je `location_integration_id` zu einem Zeitfenster zusammen.

### 2. Gateway-neutrale Backfill-Schnittstelle
- Neue gemeinsame Aktion `backfillRange` mit einheitlichem Vertrag: `{ locationIntegrationId, from, to }` → schreibt 5-Min-Buckets und Tagessummen.
- Für Loxone wird sie auf die bestehende `backfillStatistics`-Logik gemappt, jetzt aber mit Zeitfenster statt Datumsbereich und beschränkt auf die betroffenen Zähler.
- Registrierung im `gatewayRegistry`, damit Shelly, Homematic, ABB, MQTT usw. die Aktion nachrüsten können, ohne dass der Scheduler angefasst werden muss. Gateways ohne lokalen Speicher melden `supported: false` und werden übersprungen.

### 3. Herkunft sichtbar machen
- Nachgetragene Zeilen bekommen `source = 'gateway_backfill'` (die Spalte existiert bereits in `meter_power_readings_5min`).
- Upsert bleibt konfliktbasiert auf `meter_id,bucket`: Live-Daten werden nie überschrieben, nur echte Lücken gefüllt.

### 4. Worker-Puffer zurückbauen und die Fehlerquelle schließen
Der Puffer bleibt als Kurzzeitreserve für Sekunden-Aussetzer, verliert aber seine Rolle als Ausfallsicherung:
- `docs/loxone-ws-worker/index.ts` Zeile 1455–1482: Beim Neuaufbau der `uuidMap` wird die **Block-UUID nicht mehr als `pwr` registriert**. Sie liefert den Zählerstand in kWh — genau daher kamen die 2.777 kW beim Hauptanschluss und die 949,70 beim Balkonkraftwerk, die exakt dem Zählerstand `energy_total_kwh` von 949,701 entsprechen.
- Nur States, deren Rolle aus der LoxAPP3-Expansion bestätigt wurde (neues Flag `role_confirmed`), dürfen in die Bucket-Aggregation. Kein Wert ist besser als ein falscher Wert.
- Der Statustabellen-Dump direkt nach `authenticated` setzt nur `latest_value` und fließt nicht in die Bucket-Summe (das erzeugte die 655 Samples in einem 5-Minuten-Fenster).

### 5. Bereits geschriebene Falschdaten entfernen
- Migration: Zeilen in `meter_power_readings_5min` mit `sample_count > 90` löschen. Gesunde Buckets haben 30 — diese Grenze trifft strukturell unmögliche Zeilen, nicht hohe Messwerte.
- Anschließend die betroffenen Tage per `backfillRange` aus dem Miniserver neu holen und die Tagessummen neu berechnen.

## Technische Details

| Datei | Änderung |
|---|---|
| `supabase/functions/gap-backfill-scheduler/index.ts` | neu — Lückenerkennung, stündlicher Cron |
| `supabase/functions/loxone-api/index.ts` | Aktion `backfillRange` als zeitfenster-basierter Einstieg in die vorhandene Statistik-Logik |
| `src/lib/gatewayRegistry.ts` | Fähigkeits-Flag `supportsBackfill` je Gateway-Typ |
| `docs/loxone-ws-worker/index.ts` | Punkt 4, Version `v1.17-confirmed-roles` |
| neue Migration | Punkt 5 |

Punkte 1–3 und 5 wirken sofort nach dem Deploy. Punkt 4 erfordert zusätzlich ein Redeploy des Workers auf Hetzner.
