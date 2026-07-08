#!/usr/bin/env bash
# Stellt sicher, dass ein pg_cron-Job die Logflare-Service-Logs
# (_supabase-DB, Schema _analytics) nach RETENTION_DAYS Tagen aufraeumt.
# Ohne Retention wachsen die log_events-Tabellen unbegrenzt und blaehen
# jeden Deploy-Dump auf (Disk-Full-Incident 07.07.2026).
# Idempotent: ein existierender Job wird ersetzt. Nur fuer self-hosted prod;
# auf Lovable Cloud laeuft dieses Skript nicht.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-supabase_admin}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

log() { printf '[bootstrap-analytics-retention %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# pg_cron vorhanden? Wenn nicht, sauber ueberspringen statt Deploy zu brechen.
has_cron="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -At -c \
  "SELECT 1 FROM pg_extension WHERE extname='pg_cron'" 2>/dev/null || true)"
if [ "$has_cron" != "1" ]; then
  log "Skip: pg_cron-Extension nicht installiert."
  exit 0
fi

# Der Job wird in der postgres-DB registriert (dort laeuft pg_cron),
# per schedule_in_database aber in der _supabase-DB ausgefuehrt.
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'analytics-log-retention';
SELECT cron.schedule_in_database(
  'analytics-log-retention',
  '30 3 * * *',
  \$job\$
  DO \$do\$
  DECLARE t record;
  BEGIN
    FOR t IN SELECT tablename FROM pg_tables
             WHERE schemaname = '_analytics' AND tablename LIKE 'log\_events\_%'
    LOOP
      EXECUTE format(
        'DELETE FROM _analytics.%I WHERE "timestamp" < (now() AT TIME ZONE ''UTC'') - interval ''${RETENTION_DAYS} days''',
        t.tablename);
    END LOOP;
  END
  \$do\$;
  \$job\$,
  '_supabase'
);
SQL

log "pg_cron-Job 'analytics-log-retention' eingerichtet (taeglich 03:30 UTC, behaelt ${RETENTION_DAYS} Tage)."
