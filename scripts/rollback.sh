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

RESTORE_LOG="/tmp/rollback-restore-${TS}.log"
log "1/3 DB aus $BACKUP_FILE wiederherstellen (Output -> $RESTORE_LOG)"
# pg_dumpall enthaelt DROP/CREATE fuer alle Datenbanken - kann direkt zurueckgespielt werden.
# Der Restore produziert sehr viel Output (tausende ALTER/GRANT/REVOKE-Tags, "already exists"-
# Warnungen etc.). Wir loggen das in eine Datei statt auf stdout, damit der Deploy-Log lesbar
# bleibt. Kurz-Summary (errors/warnings) auf stdout.
if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d postgres < "$BACKUP_FILE" > "$RESTORE_LOG" 2>&1; then
  log "Restore OK ($(wc -l < "$RESTORE_LOG") Zeilen Output in $RESTORE_LOG)"
else
  rc=$?
  log "Restore meldete Fehler (exit $rc). Letzte 30 Zeilen:"
  tail -n 30 "$RESTORE_LOG"
fi

log "2/3 Code auf $PREV_SHA zuruecksetzen"
cd "$REPO_ROOT"
git reset --hard "$PREV_SHA"

log "3/3 Container neu starten mit altem Stand"
cd "${REPO_ROOT}/supabase-docker"
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d frontend functions

log "Rollback abgeschlossen. Prod-Stand: $PREV_SHA."
