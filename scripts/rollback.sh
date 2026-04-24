#!/usr/bin/env bash
# Rollback nach fehlgeschlagenem Deploy.
# Aufruf: scripts/rollback.sh <backup-ts> <prev-sha>
# <backup-ts>  -> Basename des Dumps in backups/<ts>.sql
# <prev-sha>   -> Commit, auf den zurueckgesetzt werden soll
set -euo pipefail

TS="${1:?backup timestamp required}"
PREV_SHA="${2:?previous sha required}"
REPO_ROOT="/opt/hub-smart-energy"
BACKUP_FILE="${REPO_ROOT}/backups/${TS}.sql"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-supabase_admin}"

log() { printf '[rollback %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

if [ ! -f "$BACKUP_FILE" ]; then
  log "KRITISCH: Backup-Datei $BACKUP_FILE nicht gefunden. Rollback nicht moeglich."
  exit 2
fi

log "1/3 DB aus $BACKUP_FILE wiederherstellen (pg_dumpall restore)"
# pg_dumpall enthaelt DROP/CREATE fuer alle Datenbanken - kann direkt zurueckgespielt werden
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres < "$BACKUP_FILE"

log "2/3 Code auf $PREV_SHA zuruecksetzen"
cd "$REPO_ROOT"
git reset --hard "$PREV_SHA"

log "3/3 Container neu starten mit altem Stand"
cd "${REPO_ROOT}/supabase-docker"
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d frontend functions

log "Rollback abgeschlossen. Prod-Stand: $PREV_SHA."
