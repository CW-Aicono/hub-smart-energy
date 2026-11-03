#!/usr/bin/env bash
# Fuehrt einen Prod-Deploy aus. Aufruf: scripts/deploy.sh <short-sha>
# Arbeitet idempotent: wenn nichts Neues da ist, ist der Lauf ein No-Op.
set -euo pipefail

SHA="${1:?commit-sha argument required}"
REPO_ROOT="${REPO_ROOT:-/opt/hub-smart-energy}"
export REPO_ROOT
umask 077
BACKUP_DIR="${REPO_ROOT}/backups"
IMAGE="ghcr.io/cw-aicono/hub-smart-energy:${SHA}"
TS="$(date +%Y%m%d-%H%M%S)"
HEALTH_URL="${HEALTH_URL:-https://ems.aicono.org/}"

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

mkdir -p "$BACKUP_DIR"

cd "$REPO_ROOT"
PREV_SHA="$(git rev-parse HEAD)"
PREV_IMAGE="$(docker image inspect hub-smart-energy-frontend:latest --format '{{.Id}}')"
log "Vorheriger Commit: $PREV_SHA"

# Additive migrations stay in place on failure. Replaying a pg_dumpall over a
# running database would risk duplicate rows and overwrite concurrent writes.
restore_application() {
  local rc=$?
  trap - ERR
  log "Deploy abgebrochen; vorherigen App-Stand ohne Datenbank-Restore wiederherstellen"
  git reset --hard "$PREV_SHA"
  docker tag "$PREV_IMAGE" hub-smart-energy-frontend:latest
  (cd "${REPO_ROOT}/supabase-docker" && docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --force-recreate frontend functions)
  exit "$rc"
}
trap restore_application ERR

log "1/6 DB-Snapshot nach $BACKUP_DIR/${TS}.sql"
docker exec supabase-db pg_dumpall -U supabase_admin > "$BACKUP_DIR/${TS}.sql"

log "2/6 Code-Update (git fetch + reset)"
git fetch origin main
git reset --hard origin/main
NEW_SHA="$(git rev-parse HEAD)"
log "Neuer Commit: $NEW_SHA"
if [[ "$NEW_SHA" != "$SHA"* ]]; then
  log "FEHLER: Image und Server-Code stammen nicht aus demselben Commit."
  false
fi

log "3/6 Neue Supabase-Migrations applyen"
if ! "${REPO_ROOT}/scripts/apply-migrations.sh"; then
  log "FEHLER: Migrations fehlgeschlagen. Starte Rollback."
  false
fi

log "Vollstaendigkeit der heutigen Live-Aenderungen pruefen"
if ! bash "${REPO_ROOT}/supabase/deploy/verify-live-release.sh"; then
  log "FEHLER: Release-Pruefung fehlgeschlagen. Starte Rollback."
  false
fi
# PostgREST must discover new columns and RPCs before the new frontend starts.
docker exec -i "${DB_CONTAINER:-supabase-db}" psql -U "${DB_USER:-supabase_admin}" -d postgres -v ON_ERROR_STOP=1 -c "NOTIFY pgrst, 'reload schema';"

log "Stammdaten-Pruefung (nur lesend)"
docker exec -i "${DB_CONTAINER:-supabase-db}" psql -U "${DB_USER:-supabase_admin}" -d postgres -At <<'SQL' || log "WARNUNG: Stammdaten-Pruefung fehlgeschlagen"
SELECT 'Anleitungen: ' || count(*) FROM public.ocpp_integration_guides;
SELECT 'ELMI-Modelle: ' || count(*) FROM public.charger_models WHERE vendor = 'ELMI Power';
SELECT 'Ladepunkte ohne Zaehler: ' || count(*) FROM public.charge_points WHERE location_id IS NOT NULL AND linked_meter_id IS NULL;
SQL

log "4/6 Frontend-Image pullen: $IMAGE"
docker pull "$IMAGE"
docker tag "$IMAGE" hub-smart-energy-frontend:latest

log "5/6 Funktionscontainer mit Zielversion starten und Dateien pruefen"
cd "${REPO_ROOT}/supabase-docker"
if ! docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --force-recreate functions; then
  log "FEHLER: docker compose up fehlgeschlagen. Starte Rollback."
  false
fi
FUNCTIONS_CONTAINER="$(docker compose -f docker-compose.yml -f docker-compose.caddy.yml ps -q functions)"
test -n "$FUNCTIONS_CONTAINER"
while IFS= read -r -d '' function_file; do
  relative="${function_file#${REPO_ROOT}/supabase/functions/}"
  expected="$(sha256sum "$function_file" | cut -d ' ' -f 1)"
  actual="$(docker exec "$FUNCTIONS_CONTAINER" sha256sum "/home/deno/functions/$relative" | cut -d ' ' -f 1)"
  test "$actual" = "$expected"
done < <(find "$REPO_ROOT/supabase/functions" -type f -print0)
log "Funktionsdateien stimmen mit Zielversion ueberein; Frontend aktivieren"
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --force-recreate frontend

log "5b/6 Caddy-Config reload (falls Caddyfile geaendert)"
docker exec supabase-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
  || log "WARN: caddy reload fehlgeschlagen (Container laeuft evtl. noch nicht) - ueberspringe"

log "6/6 Healthcheck auf $HEALTH_URL"
sleep 10
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 10 "$HEALTH_URL" > /dev/null; then
    log "Healthcheck OK (Versuch $attempt)"
    break
  fi
  if [ "$attempt" = 5 ]; then
    log "FEHLER: Healthcheck nach 5 Versuchen fehlgeschlagen. Starte Rollback."
    false
  fi
  sleep 5
done

# Aeltere Backups aufraeumen, letzte 10 behalten
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql' -print0 \
  | xargs -0 ls -1t \
  | tail -n +11 \
  | xargs -r rm -f

log "Deploy $SHA erfolgreich abgeschlossen."
