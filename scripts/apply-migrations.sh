#!/usr/bin/env bash
# Spielt alle neuen Migrations aus supabase/migrations/ gegen den self-hosted Postgres.
# Bereits applyte Migrations werden in der Tabelle _deploy_migrations getrackt und uebersprungen.
# Eine fehlschlagende Migration bricht ab und gibt Exit-Code 1 zurueck.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/hub-smart-energy}"
MIG_DIR="${REPO_ROOT}/supabase/migrations"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

log() { printf '[migrations %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

psql_exec() {
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

if [ ! -d "$MIG_DIR" ]; then
  log "Kein Migrations-Verzeichnis unter $MIG_DIR - skipping."
  exit 0
fi

log "Stelle Tracking-Tabelle _deploy_migrations sicher"
psql_exec <<'SQL'
CREATE TABLE IF NOT EXISTS public._deploy_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

# Bootstrap: auf einem bestehenden Server, wo bereits alle Migrations appliziert sind,
# einmalig mit BOOTSTRAP=1 aufrufen. Markiert alle vorhandenen .sql als applied, ohne sie auszufuehren.
if [ "${BOOTSTRAP:-0}" = "1" ]; then
  log "BOOTSTRAP-Modus: markiere alle bestehenden Migrations als applied (ohne Ausfuehrung)"
  while IFS= read -r -d '' file; do
    filename="$(basename "$file")"
    psql_exec -c "INSERT INTO public._deploy_migrations (filename) VALUES ('$(printf '%s' "$filename" | sed "s/'/''/g")') ON CONFLICT DO NOTHING"
  done < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)
  log "Bootstrap fertig."
  exit 0
fi

applied_count=0
skipped_count=0

# Sortierte Liste aller .sql-Dateien (Timestamp-Prefix sorgt fuer Reihenfolge)
while IFS= read -r -d '' file; do
  filename="$(basename "$file")"

  already="$(psql_exec -At -c "SELECT 1 FROM public._deploy_migrations WHERE filename = '$(printf '%s' "$filename" | sed "s/'/''/g")'")"
  if [ "$already" = "1" ]; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  log "Apply: $filename"
  if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$file"; then
    log "FEHLER bei Migration $filename"
    exit 1
  fi

  psql_exec -c "INSERT INTO public._deploy_migrations (filename) VALUES ('$(printf '%s' "$filename" | sed "s/'/''/g")')"
  applied_count=$((applied_count + 1))
done < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)

log "Fertig: $applied_count neue, $skipped_count bereits appliziert."
