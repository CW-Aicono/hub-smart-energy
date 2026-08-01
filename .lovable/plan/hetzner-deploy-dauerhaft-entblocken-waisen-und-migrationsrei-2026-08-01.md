# Hetzner-Deploy dauerhaft entblocken: Waisen und Migrationsreihenfolge beheben

## Bestätigte Ursache

Der neue Deploy scheitert noch an exakt derselben Migration `20260731225555_...sql`. Der bereits erstellte Schutz steht erst in `20260801065203_...sql` und kann deshalb nie ausgeführt werden:

```text
20260731225555  sofortiger Refresh → FK-Fehler → Deploy-Abbruch/Rollback
20260801065203  Waisen bereinigen + Funktion härten → wird nie erreicht
```

Zusätzlich wurde beim Wechsel auf die partitionierte Tabelle `meter_power_readings_5min` am 30.07. der bisherige Fremdschlüssel zu `meters` nicht übernommen. Dadurch können gelöschte Messstellen weiterhin als UUID in der 5‑Minuten-Historie stehen bleiben. Das erklärt, warum der Datensatz `cdf9b73b-...` überhaupt entstehen und den Refresh dauerhaft blockieren konnte.

Eine zweite Aggregation, `refresh_meter_daily_totals`, liest dieselbe 5‑Minuten-Tabelle ebenfalls ohne Prüfung gegen `meters`. Nach Behebung des ersten Fehlers könnte daher dort der nächste FK-Fehler auftreten.

## Umsetzung

### 1. Die tatsächlich fehlschlagende Migration selbst deployfähig machen

Die noch nicht auf Hetzner angewendete Migration `20260731225555_...sql` wird vor ihrem sofortigen Refresh um einen idempotenten Schutz ergänzt:

- Verwaiste `meter_id` in `meter_power_readings_5min` auf `NULL` setzen, statt historische Messzeilen zu löschen.
- `refresh_meter_period_totals_5min` bereits **vor** ihrem ersten Aufruf mit `meter_id IS NOT NULL` und `EXISTS (SELECT 1 FROM meters ...)` absichern.
- Erst danach Cron-Kommandos umstellen und den Berliner Tages-Refresh ausführen.

Damit läuft der nächste Hetzner-Deploy nicht mehr in den alten Funktionsstand hinein.

### 2. Dauerhaften Fremdschlüsselschutz wiederherstellen

Auf der partitionierten `meter_power_readings_5min` wird der beim Tabellenwechsel verlorene Fremdschlüssel wieder angelegt:

- `meter_id → meters(id) ON DELETE SET NULL`, entsprechend der bereits 2026-04-20 festgelegten Archivierungsregel.
- Vor dem Anlegen werden bestehende Waisen auf `NULL` gesetzt, damit die Constraint-Anlage nicht scheitert.
- Der Schutz wird auf der partitionierten Haupttabelle definiert und gilt damit auch für Monats- und Default-Partitionen.

So erzeugt das spätere Löschen einer Messstelle keine neue ungültige UUID mehr; die historische Zeile bleibt erhalten, aber ohne nicht mehr existente Zuordnung.

### 3. Beide Aggregationspfade härten

Nicht nur `refresh_meter_period_totals_5min`, sondern auch `refresh_meter_daily_totals` erhält denselben Eingangsfilter:

- nur nicht-leere `meter_id`,
- nur IDs, die aktuell in `meters` existieren,
- kein Versuch, Waisen in `meter_period_totals` oder `meter_daily_totals_mv` zu schreiben.

Die spätere Reparaturmigration `20260801065203_...sql` bleibt als idempotentes Sicherheitsnetz erhalten, wird aber ebenfalls auf „Zuordnung nullen statt Historie löschen“ korrigiert.

### 4. Deploy-Reihenfolge gegen Wiederholungen absichern

Der Hetzner-Migrationsrunner arbeitet korrekt lexikografisch nach Dateiname und bricht atomar bei Fehlern ab. Ergänzt wird ein gezielter Preflight für diesen Fehlerfall:

- vor sofort ausgeführten Aggregations-Backfills prüfen, ob deren Quelldaten FK-konform sind,
- im Fehlerlog die Zahl und betroffene Quelltabelle verwaister IDs ausgeben,
- keine automatische Ausführung einer späteren Migration außerhalb der Reihenfolge.

## Validierung

1. Migrationsreihenfolge in einer Transaktion gegen einen Testbestand mit künstlicher Waisen-ID durchspielen.
2. Prüfen, dass `20260731225555_...sql` vollständig durchläuft und anschließend `20260801065203_...sql` erreicht wird.
3. Prüfen, dass beide Refresh-Funktionen für Berliner Heute-/Vortag ohne FK-Fehler laufen.
4. Prüfen, dass keine nicht-leere `meter_id` ohne passenden Eintrag in `meters` verbleibt.
5. Eine Test-Messstelle löschen: Historienzeilen bleiben erhalten, `meter_id` wird `NULL`, beide Refresh-Jobs bleiben erfolgreich.
6. Danach den normalen Go-Live-Workflow erneut starten; das bestehende Rollback bleibt unverändert als Sicherheitsnetz aktiv.

## Betroffene Dateien

- `supabase/migrations/20260731225555_538403e6-b3a4-4968-97b3-ba59b9e46cdf.sql`
- `supabase/migrations/20260801065203_b0157b2a-69bd-4424-b380-2d2a4c3fa497.sql`
- neue Folgemigration für FK und `refresh_meter_daily_totals`
- `scripts/apply-migrations.sh` nur für die diagnostische Preflight-Ausgabe

Keine Frontend-Änderung und keine Löschung historischer Messwerte.
