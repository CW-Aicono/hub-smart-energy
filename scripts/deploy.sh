#!/usr/bin/env bash
# Fuehrt einen Prod-Deploy aus. Aufruf: scripts/deploy.sh <short-sha>
# Arbeitet idempotent: wenn nichts Neues da ist, ist der Lauf ein No-Op.
set -euo pipefail

SHA="${1:?short-sha argument required}"
REPO_ROOT="/opt/hub-smart-energy"
BACKUP_DIR="${REPO_ROOT}/backups"
IMAGE="ghcr.io/cw-aicono/hub-smart-energy:${SHA}"
TS="$(date +%Y%m%d-%H%M%S)"
HEALTH_URL="${HEALTH_URL:-https://ems.aicono.org/}"

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

mkdir -p "$BACKUP_DIR"

cd "$REPO_ROOT"
PREV_SHA="$(git rev-parse HEAD)"
log "Vorheriger Commit: $PREV_SHA"

log "1/6 DB-Snapshot nach $BACKUP_DIR/${TS}.sql"
docker exec supabase-db pg_dumpall -U supabase_admin > "$BACKUP_DIR/${TS}.sql"

log "2/6 Code-Update (git fetch + reset)"
git fetch origin main
git reset --hard origin/main
NEW_SHA="$(git rev-parse HEAD)"
log "Neuer Commit: $NEW_SHA"

log "3/6 Neue Supabase-Migrations applyen"
if ! "${REPO_ROOT}/scripts/apply-migrations.sh"; then
  log "FEHLER: Migrations fehlgeschlagen. Starte Rollback."
  "${REPO_ROOT}/scripts/rollback.sh" "$TS" "$PREV_SHA"
  exit 1
fi

log "4/6 Frontend-Image pullen: $IMAGE"
docker pull "$IMAGE"
docker tag "$IMAGE" hub-smart-energy-frontend:latest

log "5/6 Container neu starten (frontend, functions)"
cd "${REPO_ROOT}/supabase-docker"
if ! docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d frontend functions; then
  log "FEHLER: docker compose up fehlgeschlagen. Starte Rollback."
  "${REPO_ROOT}/scripts/rollback.sh" "$TS" "$PREV_SHA"
  exit 1
fi

log "6/6 Healthcheck auf $HEALTH_URL"
sleep 10
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 10 "$HEALTH_URL" > /dev/null; then
    log "Healthcheck OK (Versuch $attempt)"
    break
  fi
  if [ "$attempt" = 5 ]; then
    log "FEHLER: Healthcheck nach 5 Versuchen fehlgeschlagen. Starte Rollback."
    "${REPO_ROOT}/scripts/rollback.sh" "$TS" "$PREV_SHA"
    exit 1
  fi
  sleep 5
done

# Aeltere Backups aufraeumen, letzte 10 behalten
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql' -print0 \
  | xargs -0 ls -1t \
  | tail -n +11 \
  | xargs -r rm -f

log "Deploy $SHA erfolgreich abgeschlossen."
