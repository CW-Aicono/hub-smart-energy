# Deploy-Ergebnis geprüft: Blocker behoben, ein Restwarnhinweis offen

## Geprüft und bestätigt

Der Deploy `25ba66c3` ist vollständig durchgelaufen (Healthcheck OK). Die Nachkontrolle auf Hetzner belegt Punkt für Punkt, dass die Rettungskette gegriffen hat:

- Alle drei Migrationen wurden in der geplanten Reihenfolge angewendet: `20260731225553` (Reparatur), `20260731225554` (Fremdschlüssel + Härtung), `20260731225555` (der frühere Blocker) — letzterer diesmal fehlerfrei inklusive `refresh_meter_period_totals_5min`.
- Parent **und alle 13 Leaf-Partitionen** melden jetzt `replica_identity = f` (vorher `d`). Der Replica-Identity-Fehler kann nicht mehr auftreten.
- `orphan_count` ist leer — die 1426 verwaisten Zuordnungen wurden entkoppelt, die Messhistorie ist erhalten geblieben.
- Der Fremdschlüssel `meter_id → meters(id) ON DELETE SET NULL` liegt auf dem Parent und ist auf alle 14 Relationen vererbt. Neue Waisen können nicht mehr entstehen.
- In der Realtime-Publikation ist nur noch der aktuelle Parent eingetragen; die Alt-Tabelle `..._legacy` wurde korrekt entfernt.
- Beide Aggregationsfunktionen enthalten live den Waisen-Filter (`meter_id IS NOT NULL` plus `EXISTS (meters)`).

Damit ist der ursprüngliche Deploy-Blocker abgeschlossen. Kein weiterer Handlungsbedarf an den Migrationen.

## Ein Restwarnhinweis, nicht deploy-kritisch

Schritt `3c/6 Analytics-Log-Retention` ist abgebrochen:

```text
ERROR: duplicate key value violates unique constraint "job_pkey"
DETAIL: Key (jobid)=(122) already exists.
```

Der Deploy hat das korrekt als Warnung behandelt und weitergemacht. Der Fehler entsteht innerhalb von `cron.schedule` beim Einfügen in `cron.job`: Der Konflikt wird auf dem Namen abgefangen, scheitert dann aber am Primärschlüssel `jobid`. Das deutet auf einen Zähler für `jobid`, der nicht mehr zum tatsächlichen Höchstwert in `cron.job` passt — typisch nach einem Restore oder Dump-Import. Bestätigt ist das noch nicht; deshalb steht die Prüfung an erster Stelle.

Wichtig für den Umfang: Der betroffene Deploy-Schritt existiert nur im Hetzner-Main-Stand, nicht im hiesigen `scripts/deploy.sh`. Es geht also um eine Prüfung auf dem Server, nicht um eine Änderung hier.

## Vorgeschlagenes Vorgehen

1. **Nur lesend prüfen** (auf Hetzner): aktuellen Höchstwert von `cron.job.jobid`, den Stand der zugehörigen Sequenz und ob der Retention-Job unter seinem Namen bereits existiert.
2. Ergebnis auswerten:
   - Sequenz hinter dem Höchstwert → einmalige Korrektur des Zählers, danach Deploy-Schritt erneut ausführen.
   - Job existiert bereits korrekt → der Schritt ist faktisch überflüssig und kann idempotent übersprungen werden.
3. Erst nach diesem Befund die passende, minimale Korrektur festlegen. Kein blindes Neuanlegen oder Löschen von Cron-Jobs.

## Betroffene Bereiche

Keine Änderung an Frontend, Datenbankschema oder den bereits angewendeten Migrationen. Der offene Punkt betrifft ausschließlich einen Cron-Bootstrap-Schritt im Deploy-Skript auf dem Server.
