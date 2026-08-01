# Hetzner-Vorabtest ausgewertet: Deploy kann freigegeben werden

## Was die Live-Ausgabe belegt

Der lesende Vorabtest auf Hetzner ist diesmal vollständig durchgelaufen (bis zu beiden Funktionsdefinitionen, danach normale Shell). Er bestätigt exakt das vorbereitete Reparaturmodell:

- PostgreSQL 15.8; Realtime publiziert Updates und Deletes, `pubviaroot = false` — Änderungen werden also mit der Identität der Leaf-Partition publiziert.
- Parent `meter_power_readings_5min` hat `REPLICA IDENTITY FULL` (`f`), aber **alle 13 Leaf-Partitionen** stehen auf Default (`d`).
- Die Partitionen haben **keinerlei Constraints** — kein Primärschlüssel, kein Fremdschlüssel.
- Damit ist der Deploy-Fehler vollständig erklärt: Ein `UPDATE` auf einer publizierten Leaf-Partition ohne Schlüssel und ohne Replica Identity ist von PostgreSQL verboten.
- In der Publikation `supabase_realtime` sind **beide** Tabellen eingetragen: die Alt-Tabelle `meter_power_readings_5min_legacy` und der aktuelle Parent.
- **1426 verwaiste Zeilen** in `meter_power_readings_5min_p_202607` (Zuordnung auf nicht mehr existierende Messstellen).
- Die blockierenden Migrationen `20260731225554` und `20260731225555` sind **noch nicht angewendet**.
- Die live laufende `refresh_meter_period_totals_5min` aggregiert die 5-Minuten-Werte **ohne jeden Waisen-Filter** — genau die Ursache des ursprünglichen Fremdschlüsselfehlers.

## Abgleich mit dem vorbereiteten Reparaturpfad

Die bereits erstellten Migrationen decken jeden dieser Punkte ab:

| Befund auf Hetzner | Behandlung |
| --- | --- |
| Leaf-Partitionen ohne Replica Identity | `20260731225553`: `REPLICA IDENTITY FULL` über den kompletten Partitionsbaum, **vor** jedem Update |
| 1426 Waisen in `p_202607` | Zuordnung wird auf `NULL` gesetzt, Messhistorie bleibt erhalten; anschließend Abbruchprüfung auf Restwaisen |
| Legacy-Tabelle noch publiziert | wird aus `supabase_realtime` entfernt, nur der aktuelle Parent bleibt publiziert |
| Ungeschützte 5-Minuten-Aggregation | gehärtete Funktion wird installiert, bevor sie erstmals aufgerufen wird |
| Keine Constraints auf den Partitionen | `20260731225554`: Fremdschlüssel `meter_id → meters(id) ON DELETE SET NULL` nach erfolgreicher Waisenprüfung |
| Zweiter Aggregationspfad | `refresh_meter_daily_totals` erhält denselben Waisen-Filter |
| Künftige Monats-Partitionen | `ensure_meter_power_5min_partitions` härtet jede neue Partition sofort |

Es besteht keine Abweichung zwischen dem realen Live-Zustand und dem vorbereiteten Pfad. Änderungen an den Migrationen sind nicht erforderlich.

## Nächste Schritte

1. Keine weiteren Code- oder SQL-Änderungen; der Rettungspfad bleibt unverändert.
2. Den normalen Go-Live-Workflow erneut starten. Snapshot und automatisches Rollback bleiben als Sicherung aktiv.
3. Im Deploy-Log auf diese Reihenfolge achten:

```text
Apply: 20260731225553_...sql   → Notice: 1426 verwaiste Zuordnungen auf NULL gesetzt
Apply: 20260731225554_...sql   → Fremdschlüssel + gehärtete Tagesaggregation
Apply: 20260731225555_...sql   → Refresh läuft jetzt fehlerfrei
```

4. Nach dem Deploy den lesenden Vorabtest ein zweites Mal ausführen. Erwartet: alle Leaf-Partitionen `f`, `orphan_count` leer, Fremdschlüssel vorhanden, nur der Parent in der Publikation, Legacy-Tabelle nicht mehr enthalten.

## Restrisiko, offen benannt

Der Fremdschlüssel wird auf einer partitionierten Tabelle mit vielen Zeilen angelegt und benötigt kurzzeitig eine Sperre; die Schreibpause während dieses Schritts ist kurz, aber nicht null. Falls währenddessen neue Waisen entstünden, bricht die Migration bewusst mit klarer Meldung ab, statt Daten zu verändern — das Rollback greift dann unverändert.

Es werden keine historischen Messwerte gelöscht und es gibt keine Frontend-Änderung.
