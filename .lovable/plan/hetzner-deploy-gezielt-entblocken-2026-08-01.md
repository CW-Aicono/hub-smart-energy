# Hetzner-Deploy gezielt entblocken

## Bestätigte Ursache

Der vorige Fix lag in `scripts/apply-migrations.sh`, wurde aber nicht ausgeliefert: Der Produktions-Workflow ersetzt beim Staging→Main-Sync den kompletten Ordner `scripts/` wieder durch den bisherigen Main-Stand. Im Fehlerlog fehlen deshalb auch alle erwarteten `Preflight:`-Meldungen.

Die alte Migration `20260731225555_...sql` ruft den noch ungeschützten Refresh sofort auf. Die späteren Reparaturmigrationen können daher nie erreicht werden.

## Umsetzung

1. **Kompatibilitätsmigration unmittelbar vor dem Blocker einordnen**
   - Eine idempotente SQL-Migration mit lexikalisch früherem Namen als `20260731225555_...sql` hinzufügen.
   - Verwaiste `meter_id`-Referenzen in `meter_power_readings_5min` auf `NULL` setzen; Messhistorie nicht löschen.
   - `refresh_meter_period_totals_5min` bereits dort mit `meter_id IS NOT NULL` und `EXISTS (meters)` absichern.
   - Dadurch kann der direkt folgende Berliner Tagesrefresh keine fremden Zähler-IDs mehr in `meter_period_totals` schreiben.

2. **Destruktive Alt-Reparatur neutralisieren**
   - Die noch nicht auf Prod angewandte Migration `20260801065203_...sql` so korrigieren, dass sie ebenfalls nur entkoppelt statt historische Zeilen zu löschen.
   - Die bestehende Funktionshärtung und das idempotente Upsert-Verhalten beibehalten.

3. **Dauerhaften Schutz anwenden**
   - Die bereits vorhandene Folgemigration `20260801070720_...sql` bleibt zuständig für:
     - Wiederherstellung des Fremdschlüssels mit `ON DELETE SET NULL`.
     - Schutz beider Aggregationspfade vor `NULL`- und Waisen-IDs.
     - Erhalt der historischen Messwerte.

4. **Vor dem nächsten Go-Live lokal verifizieren**
   - Die betroffenen SQL-Dateien in exakt derselben Dateisortierung wie der Hetzner-Runner prüfen.
   - Einen Testfall mit einer nicht mehr vorhandenen `meter_id` gegen die Kompatibilitätsmigration und den anschließenden Refresh ausführen.
   - Sicherstellen, dass der Refresh erfolgreich läuft, die Historienzeile mit `meter_id = NULL` erhalten bleibt und die FK-Anlage danach gelingt.

## Erwarteter nächster Deploy-Log

```text
Apply: 20260731225554_...sql
NOTICE: ... verwaiste Zuordnungen auf NULL gesetzt
Apply: 20260731225555_...sql
Apply: 20260801065203_...sql
Apply: 20260801070720_...sql
Fertig: ... neue Migrationen
```

Der Rettungsweg liegt vollständig unter `supabase/migrations/`; dieser Pfad wird nachweislich aus Staging nach Main übernommen und nicht wie `scripts/` zurückgesetzt.