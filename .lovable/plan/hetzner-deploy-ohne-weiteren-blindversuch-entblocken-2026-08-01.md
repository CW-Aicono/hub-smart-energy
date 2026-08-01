# Hetzner-Deploy ohne weiteren Blindversuch entblocken

## Ehrliche Zusage

Der aktuelle Fehler ist vollständig erklärt und reproduzierbar aus dem Schema ableitbar. Eine **100%-Garantie für den gesamten nächsten Produktions-Deploy** wäre ohne lesenden Zugriff auf den echten Hetzner-Datenbankbestand trotzdem unehrlich: Lovable/Preview ist nur der Test-/Entwicklungsstand hier; „Live“ ist die echte AICONO-Seite für Kunden mit eigener Datenbank auf Hetzner.

Deshalb wird nicht erneut direkt deployed. Zuerst läuft auf Hetzner ein ausschließlich lesender Preflight. Nur wenn dessen geprüfte Voraussetzungen erfüllt sind, wird die korrigierte Kette freigegeben. Damit lässt sich dieser Fehler sicher beseitigen und ein möglicher weiterer Blocker vor dem nächsten Go-Live sichtbar machen.

## Bestätigte Ursache

1. `meter_power_readings_5min` war ursprünglich eine normale Tabelle mit Primärschlüssel und `REPLICA IDENTITY FULL`.
2. Beim Wechsel auf die partitionierte Tabelle wurden weder Primärschlüssel noch Replica Identity auf die Monats- und Default-Partitionen übernommen.
3. Die Realtime-Publikation blieb beim Tabellentausch an der umbenannten Alt-Tabelle hängen. Auf Hetzner ist zusätzlich die neue Partitionstabelle beziehungsweise deren Partition `meter_power_readings_5min_p_202602` für Updates publiziert.
4. Die Rettungsmigration versucht eine verwaiste `meter_id` per `UPDATE ... SET meter_id = NULL` zu entkoppeln.
5. PostgreSQL verbietet dieses Update auf einer publizierten Leaf-Partition mit `REPLICA IDENTITY DEFAULT` und ohne Primärschlüssel. Genau deshalb entsteht der gemeldete Fehler.
6. Ein späterer Patch kann den Fehler nicht beheben, weil der Runner bei `20260731225554_...sql` atomar abbricht und spätere Migrationen nie erreicht.

Die PostgreSQL-Dokumentation bestätigt: Bei `publish_via_partition_root = false` (Standard) werden Änderungen mit Identität und Schema der Leaf-Partition publiziert; publizierte Tabellen ohne geeigneten Schlüssel benötigen für `UPDATE`/`DELETE` eine Replica Identity. `REPLICA IDENTITY FULL` nur auf dem Parent repariert bereits bestehende Leaf-Partitionen nicht zuverlässig.

## Umsetzung

### 1. Den echten Hetzner-Zustand vor dem nächsten Deploy lesen

Eine kopierbare Diagnose wird bereitgestellt, die als ein lesender SQL-Block auf Hetzner ausgibt:

- PostgreSQL-Version und `publish_via_partition_root`,
- Parent, alle Leaf-Partitionen und jeweilige Replica Identity,
- tatsächliche Publication-Mitgliedschaft von Parent, Alt-Tabelle und Partitionsbaum,
- Anzahl verwaister `meter_id` je Leaf-Partition,
- Nullbarkeit von `meter_id`, vorhandene Primär-/Unique-/Fremdschlüssel,
- bereits angewendete Versionen `20260731225554` bis `20260801071945`,
- Definitionen beider betroffener Refresh-Funktionen.

Der Reparaturpfad wird nur verwendet, wenn dieser Preflight das bereits durch den Fehlerlog belegte Modell bestätigt. Bei einer Abweichung wird nicht deployed, sondern der Plan anhand der realen Ausgabe angepasst.

### 2. Die bereits fehlschlagende Migration selbst reparieren

`20260731225554_...sql` wird in dieser Reihenfolge geändert:

1. Parent **und alle vorhandenen Leaf-Partitionen**, ermittelt über `pg_partition_tree`, idempotent auf `REPLICA IDENTITY FULL` setzen.
2. Erst danach verwaiste Zuordnungen auf `NULL` setzen; historische Messzeilen bleiben erhalten.
3. Prüfen und mit Exception abbrechen, falls danach noch eine nicht-leere `meter_id` ohne Eintrag in `meters` existiert.
4. Die gehärtete `refresh_meter_period_totals_5min` vor ihrem ersten Aufruf installieren.

Damit greift die Reparatur dort, wo der Runner aktuell stoppt, statt in einer unerreichbaren späteren Migration.

### 3. Zukünftige Partitionen korrekt erzeugen

`ensure_meter_power_5min_partitions` wird so erweitert, dass jede neu angelegte Monats-Partition unmittelbar erhält:

- `REPLICA IDENTITY FULL`,
- die vorgesehenen Rechte und RLS-Einstellungen,
- eine überprüfbare Notice mit Partitionsname.

Anschließend läuft dieselbe Härtung einmal über alle bereits vorhandenen Monats- und Default-Partitionen. So tritt der Fehler beim nächsten Monatswechsel nicht erneut auf.

### 4. Realtime-Publikation nach dem Tabellentausch bereinigen

Die Migration korrigiert die durch das Rename entstandene Publication-Drift idempotent:

- `meter_power_readings_5min_legacy` aus `supabase_realtime` entfernen, falls enthalten,
- genau den aktuellen partitionierten Parent publizieren, falls noch nicht enthalten,
- keine einzelnen Leaf-Partitionen zusätzlich und doppelt registrieren,
- `REPLICA IDENTITY FULL` auf Parent und Leaves beibehalten, weil die Publication Updates/Deletes publiziert.

Die vorhandene Frontend-Subscription auf `meter_power_readings_5min` bleibt dadurch funktionsfähig.

### 5. Nachfolgende Migrationen entminen

- `20260801065203_...sql` darf keine historischen Zeilen löschen und wird auf idempotentes Entkoppeln plus Guard umgestellt.
- `20260801070720_...sql` setzt Replica Identity vor jedem weiteren Update und legt den Fremdschlüssel `meter_id → meters(id) ON DELETE SET NULL` erst nach erfolgreicher Waisenprüfung an.
- Beide Refresh-Funktionen filtern dauerhaft `meter_id IS NOT NULL` sowie `EXISTS (meters)`.
- Der temporäre Löschschutz wird erst entfernt, nachdem FK und beide Funktionsdefinitionen nachweislich aktiv sind.

### 6. Vor Go-Live mit derselben PostgreSQL-Version testen

Die korrigierten, noch nicht angewendeten Migrationen werden in exakt lexikografischer Runner-Reihenfolge gegen eine temporäre PostgreSQL-Instanz mit gleichem Major-Release geprüft. Der Testbestand enthält bewusst:

- partitionierten Parent plus Monats-/Default-Partition,
- Realtime-Publikation mit Updates/Deletes,
- Leaf-Partition ohne Primärschlüssel,
- mindestens eine verwaiste `meter_id`,
- bereits umbenannte Legacy-Tabelle,
- mehrfaches Ausführen zur Idempotenzprüfung.

Erfolgskriterien:

1. Der vorherige Replica-Identity-Fehler wird im Ausgangszustand reproduziert.
2. Die komplette korrigierte Kette läuft anschließend ohne Fehler durch.
3. Historienzeilen bleiben erhalten und nur die ungültige Zuordnung wird `NULL`.
4. Keine Waisen verbleiben.
5. Parent und sämtliche Leaves melden `REPLICA IDENTITY FULL`.
6. Nur der aktuelle Parent ist korrekt in Realtime publiziert; die Legacy-Tabelle nicht.
7. Fremdschlüssel und beide Orphan-Guards sind aktiv.
8. Ein zweiter Lauf ist ein sicherer No-Op.

## Freigabe für den nächsten Deploy

Erst wenn sowohl der Hetzner-Preflight als auch der lokale End-to-End-Migrationstest erfolgreich sind, wird der normale Go-Live-Workflow erneut gestartet. Der vorhandene Snapshot und das Rollback bleiben unverändert als zusätzliche Sicherung bestehen.

## Betroffene Dateien

- `supabase/migrations/20260731225554_72998ba5-22c8-49cc-93a2-f8ca55d214f0.sql`
- `supabase/migrations/20260801065203_b0157b2a-69bd-4424-b380-2d2a4c3fa497.sql`
- `supabase/migrations/20260801070720_ea374045-7611-407e-bd9c-def882a2cfda.sql`
- neue Folgemigration für Publication- und zukünftige Partitionshärtung
- Diagnose-/Testanleitung mit kopierbaren Befehlen für den Hetzner-Programmierer

Keine Frontend-Änderung und keine Löschung historischer Messwerte.