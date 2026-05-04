#!/usr/bin/env bash
# Spielt alle neuen Migrations aus supabase/migrations/ gegen den self-hosted Postgres.
# Bereits applyte Migrations werden in der Tabelle _deploy_migrations getrackt und uebersprungen.
# Eine fehlschlagende Migration bricht ab und gibt Exit-Code 1 zurueck.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/hub-smart-energy}"
MIG_DIR="${REPO_ROOT}/supabase/migrations"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-supabase_admin}"
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

# Alle Migrations-Dateien sortiert einlesen.
# Wichtig: erst in ein Array einlesen, nicht direkt via `while read < <(find ...)` iterieren —
# sonst konsumiert `docker exec -i` innerhalb der Schleife den Pipe-stdin und die Iteration bricht
# nach der ersten Datei ab.
migration_files=()
while IFS= read -r -d '' file; do
  migration_files+=("$file")
done < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)

# Bootstrap: auf einem bestehenden Server, wo bereits alle Migrations appliziert sind,
# einmalig mit BOOTSTRAP=1 aufrufen. Markiert alle vorhandenen .sql als applied, ohne sie auszufuehren.
if [ "${BOOTSTRAP:-0}" = "1" ]; then
  log "BOOTSTRAP-Modus: markiere ${#migration_files[@]} bestehende Migrations als applied (ohne Ausfuehrung)"
  {
    echo "BEGIN;"
    for file in "${migration_files[@]}"; do
      filename="$(basename "$file")"
      escaped="$(printf '%s' "$filename" | sed "s/'/''/g")"
      echo "INSERT INTO public._deploy_migrations (filename) VALUES ('$escaped') ON CONFLICT DO NOTHING;"
    done
    echo "COMMIT;"
  } | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 > /dev/null
  log "Bootstrap fertig."
  exit 0
fi

applied_count=0
skipped_count=0
autoheal_count=0

# mark_applied <file>
mark_applied() {
  local f="$1"
  local fn escaped
  fn="$(basename "$f")"
  escaped="$(printf '%s' "$fn" | sed "s/'/''/g")"
  psql_exec -c "INSERT INTO public._deploy_migrations (filename) VALUES ('$escaped') ON CONFLICT DO NOTHING" > /dev/null
}

# Versucht, ein fehlendes public.<table> oder public.<function> zu heilen, indem die frueheste
# Migration gesucht wird, die es erzeugt (CREATE TABLE / CREATE FUNCTION / CREATE TYPE).
# Nutzt nur Migrations, die als "already applied" markiert sind — der Bootstrap-Stand kann
# Tabellen als applied markiert haben, ohne sie tatsaechlich erstellt zu haben.
autoheal_missing_object() {
  local object_name="$1"
  local grep_pattern="$2"

  local found
  found="$(grep -l -E "$grep_pattern" "$MIG_DIR"/*.sql 2>/dev/null | sort | head -1)"

  if [ -z "$found" ]; then
    log "AUTOHEAL: keine CREATE-Migration fuer '$object_name' gefunden."
    return 1
  fi

  log "AUTOHEAL: fuehre $(basename "$found") aus, um '$object_name' zu erstellen"
  # --single-transaction: atomic apply – ein Fehler rollt die ganze Heal-Migration zurueck,
  # damit kein partial state ueberlebt (sonst scheitern Folge-Versuche an "already exists").
  if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 --single-transaction < "$found" 2>&1; then
    log "AUTOHEAL: CREATE-Migration fuer '$object_name' ist selbst fehlgeschlagen."
    return 1
  fi

  mark_applied "$found"
  autoheal_count=$((autoheal_count + 1))
  log "AUTOHEAL: '$object_name' erstellt."
  return 0
}

# Versucht eine Migration bis zu 5x mit Auto-Heal dazwischen.
run_migration_with_autoheal() {
  local file="$1"
  local attempt=0
  local err tmp

  while [ $attempt -lt 5 ]; do
    attempt=$((attempt + 1))
    tmp="$(mktemp)"
    # --single-transaction: jede Migration ist atomic. Wenn z.B. Statement 5 von 10 scheitert,
    # rollen 1-4 mit zurueck, AUTOHEAL erstellt das fehlende Objekt, der Retry startet von 1
    # auf einer sauberen Basis. Ohne -1 wuerden 1-4 committed bleiben, der Retry stiesse auf
    # "already exists" und die Migration waere nicht mehr heilbar.
    if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 --single-transaction < "$file" > "$tmp" 2>&1; then
      cat "$tmp"
      rm -f "$tmp"
      return 0
    fi

    err="$(cat "$tmp")"
    rm -f "$tmp"
    echo "$err"

    # Fall 1: Tabelle fehlt
    local missing_table
    missing_table="$(echo "$err" | grep -oE 'relation "public\.[a-zA-Z_][a-zA-Z0-9_]*" does not exist' | head -1 | sed -E 's/relation "public\.([^"]+)" does not exist/\1/')"
    if [ -n "$missing_table" ]; then
      if autoheal_missing_object "public.$missing_table" "CREATE TABLE (IF NOT EXISTS )?public\.${missing_table}[[:space:](]"; then
        continue
      fi
    fi

    # Fall 2: Funktion fehlt
    local missing_func
    missing_func="$(echo "$err" | grep -oE 'function public\.[a-zA-Z_][a-zA-Z0-9_]*\(' | head -1 | sed -E 's/function public\.([a-zA-Z_][a-zA-Z0-9_]*)\(/\1/')"
    if [ -n "$missing_func" ] && echo "$err" | grep -qE 'does not exist'; then
      if autoheal_missing_object "public.$missing_func" "CREATE (OR REPLACE )?FUNCTION public\.${missing_func}\("; then
        continue
      fi
    fi

    # Fall 3: Type fehlt
    local missing_type
    missing_type="$(echo "$err" | grep -oE 'type "public\.[a-zA-Z_][a-zA-Z0-9_]*" does not exist' | head -1 | sed -E 's/type "public\.([^"]+)" does not exist/\1/')"
    if [ -n "$missing_type" ]; then
      if autoheal_missing_object "public.$missing_type (type)" "CREATE TYPE public\.${missing_type}[[:space:](]"; then
        continue
      fi
    fi

    # Kein bekanntes Pattern -> echter Fehler, abbrechen
    return 1
  done

  log "AUTOHEAL: Max 5 Versuche fuer $(basename "$file") erreicht."
  return 1
}

for file in "${migration_files[@]}"; do
  filename="$(basename "$file")"
  escaped="$(printf '%s' "$filename" | sed "s/'/''/g")"

  already="$(psql_exec -At -c "SELECT 1 FROM public._deploy_migrations WHERE filename = '$escaped'")"
  if [ "$already" = "1" ]; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  log "Apply: $filename"
  if ! run_migration_with_autoheal "$file"; then
    log "FEHLER bei Migration $filename (kein Auto-Heal moeglich)."
    exit 1
  fi

  mark_applied "$file"
  applied_count=$((applied_count + 1))
done

log "Fertig: $applied_count neue, $skipped_count bereits appliziert, $autoheal_count per Auto-Heal geheilt."
