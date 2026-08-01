# Hetzner: Vorabtest für den 5-Minuten-Migrationsfehler

„Live“ ist die echte AICONO-Seite für Kunden auf Hetzner. Lovable/Preview ist nur der Test- und Entwicklungsstand hier. Diese Prüfung liest ausschließlich den Live-Zustand und ändert nichts.

## 1. Auf dem Hetzner-Server anmelden

```bash
ssh root@DEINE.SERVER.IP
```

## 2. Den vollständigen Vorabtest ausführen

Den folgenden Kasten komplett kopieren und mit Enter ausführen:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT version();

SELECT pubname, pubupdate, pubdelete, pubviaroot
FROM pg_publication
WHERE pubname = 'supabase_realtime';

SELECT pt.relid::regclass AS relation,
       pt.isleaf,
       c.relkind,
       c.relreplident AS replica_identity
FROM pg_partition_tree('public.meter_power_readings_5min'::regclass) pt
JOIN pg_class c ON c.oid = pt.relid
ORDER BY pt.level, relation::text;

SELECT p.pubname, c.oid::regclass AS explicit_publication_member
FROM pg_publication_rel pr
JOIN pg_publication p ON p.oid = pr.prpubid
JOIN pg_class c ON c.oid = pr.prrelid
WHERE p.pubname = 'supabase_realtime'
  AND (
    c.oid IN (SELECT relid FROM pg_partition_tree('public.meter_power_readings_5min'::regclass))
    OR c.relname = 'meter_power_readings_5min_legacy'
  )
ORDER BY 2;

SELECT tableoid::regclass AS partition, count(*) AS orphan_count
FROM public.meter_power_readings_5min m5
WHERE m5.meter_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id)
GROUP BY tableoid
ORDER BY partition::text;

SELECT conrelid::regclass AS relation, conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (SELECT relid FROM pg_partition_tree('public.meter_power_readings_5min'::regclass))
ORDER BY relation::text, conname;

SELECT filename, applied_at
FROM public._deploy_migrations
WHERE filename >= '20260731225554'
  AND filename <= '20260731225555_538403e6-b3a4-4968-97b3-ba59b9e46cdf.sql'
ORDER BY filename;

SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('refresh_meter_period_totals_5min', 'refresh_meter_daily_totals')
ORDER BY p.proname;
SQL
```

## 3. Ergebnis behandeln

Die vollständige Ausgabe vor dem nächsten Deploy speichern. Erwartet wird:

- mindestens die im Fehler genannte Monats-Partition,
- vor der Reparatur `replica_identity = d` auf den Leaf-Partitionen,
- mindestens eine Waisen-Zeile auf Hetzner,
- die Migration `20260731225554_...` noch nicht als angewendet.

Weicht ein Punkt ab, den Deploy nicht starten. Die Ausgabe zur gezielten Prüfung weitergeben; keine Passwörter oder Schlüssel mitsenden.