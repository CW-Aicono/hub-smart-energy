## Frage 1 — Läuft der temporäre Cron-Job noch?

Ja, genau einer: **`ems-backfill-power-hourly`** (alle 10 Min, `3-59/10 * * * *`, ruft `backfill_meter_power_hourly(3)`). Er füllt die Stunden-Rollup-Tabelle rückwärts mit Altdaten.

Stand jetzt (verifiziert):
- Stunden-Tabelle reicht zurück bis **06.06.2026**, die 5-Minuten-Daten bis **16.02.2026**.
- Die letzten 8 Läufe waren alle erfolgreich („1 row").

Er ist also **noch nicht fertig** — es fehlen rund 110 Tage, bei 3 Tagen pro Lauf alle 10 Minuten ca. **6 Stunden Restlaufzeit**. Bitte noch laufen lassen; ich lösche ihn, sobald die Stunden-Tabelle bis 16.02.2026 zurückreicht. Der Dauerbetriebs-Job `ems-rollup-power-hourly` bleibt danach bestehen (der ist kein Temp-Job).

## Frage 2 — Kommt der große Umbau beim Hetzner-Deploy automatisch mit?

Grundsätzlich ja: der komplette Umbau liegt als Migrationsdateien im Repo (Stunden-Rollup-Tabelle, `rollup_meter_power_hourly`, `get_power_series_auto`, partitionierte Tabelle + 12 Monats-Partitionen, RLS, atomarer Swap). Diese Dateien werden von `scripts/apply-migrations.sh` auf Hetzner ausgeführt.

**Aber: so wie es jetzt ist, würde ich noch nicht deployen.** Drei konkrete Stolpersteine:

1. **Die alte kaputte Migration blockiert weiterhin.** Das Löschen des Workflow-Runs ändert nichts — `20260730052657_…sql` (Cron-Staffelung mit festen Job-Nummern) liegt weiter im Repo und wird beim nächsten Deploy erneut versucht und scheitert. Sie muss einmalig auf dem Server als „erledigt" eingetragen werden (Befehl unten).
2. **Der Swap kopiert auf Hetzner die ganze Tabelle in einer Transaktion.** In Lovable haben wir die ~1,9 Mio Zeilen vorher in Ruhe in Batches kopiert; auf Hetzner ist die Partitionstabelle leer, deshalb kopiert die Swap-Migration alles auf einen Schlag — mit exklusiver Sperre auf der Tabelle. Das ist der eigentliche Risiko-Punkt: je nach Datenmenge mehrere Minuten Schreibsperre, und wenn das Statement-Timeout zuschlägt, rollt der Deploy zurück.
3. **Partitionen decken nur 01.02.2026 – 31.01.2027 ab.** Gibt es auf Hetzner auch nur eine Zeile mit älterem Zeitstempel, bricht der Kopiervorgang mit „no partition of relation found" ab.

## Plan für den sicheren Hetzner-Deploy

**Schritt 0 — Vorprüfung auf dem Server (nur lesen, ändert nichts)**
Ältesten Zeitstempel und Zeilenzahl der Tabelle `meter_power_readings_5min` auf Hetzner auslesen. Damit weiß ich, ob eine Partition für ältere Daten fehlt und wie lange der Kopiervorgang dauert. Ich liefere den fertigen Kopier-Befehl.

**Schritt 1 — Blockade lösen**
Die gescheiterte Migration einmalig als erledigt eintragen:
```bash
ssh root@91.99.170.143
docker exec -i supabase-db psql -U supabase_admin -d postgres -c "INSERT INTO public._deploy_migrations (filename) VALUES ('20260730052657_88a6adac-b016-4b61-9c91-221bb2a664f9.sql') ON CONFLICT DO NOTHING;"
exit
```

**Schritt 2 — Migrationen für Hetzner robust machen**
- Ergänzende Migration, die Partitionen automatisch für den gesamten vorhandenen Datenbereich anlegt (kein fester Feb-2026-Start mehr) und künftige Monate rollierend erzeugt.
- Die Swap-Migration so absichern, dass sie auf einer leeren Partitionstabelle in Blöcken kopiert statt in einem einzigen Riesen-Statement, mit ausreichend gesetztem Statement-Timeout — und dass sie nichts tut, wenn der Swap bereits erfolgt ist (idempotent, wichtig für Lovable, wo er schon gelaufen ist).

**Schritt 3 — Deploy im Nachtfenster**
Go-Live-Workflow starten, `LIVE` eintippen. Das Deploy-Skript zieht vorher automatisch ein Datenbank-Backup und rollt bei Fehlern selbstständig zurück.

**Schritt 4 — Nachkontrolle**
Auf Hetzner prüfen: Zeilenzahl vor/nach identisch, Tagesverlauf in 5-Minuten-Auflösung im Frontend sichtbar, `get_power_series_auto` liefert Daten, danach `VACUUM (ANALYZE)`.

## Technische Details

- Betroffene Dateien: neue Migration für dynamische Partitionserzeugung; überarbeitete Fassung von `20260729214612_…sql` (batchweiser Kopiervorgang + Idempotenz-Guard).
- Kein Frontend-Code betroffen; `src/lib/powerSeries.ts` und die Widgets laufen unverändert weiter.
- Temp-Job `ems-backfill-power-hourly` wird erst nach Abschluss (ca. 6 h) entfernt — separat, unabhängig vom Deploy.
