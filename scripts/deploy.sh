#!/usr/bin/env bash
# Fuehrt einen Prod-Deploy aus. Aufruf: scripts/deploy.sh <short-sha>
# Arbeitet idempotent: wenn nichts Neues da ist, ist der Lauf ein No-Op.
set -euo pipefail

SHA="${1:?commit-sha argument required}"
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
if [[ "$NEW_SHA" != "$SHA"* ]]; then
  log "FEHLER: Image und Server-Code stammen nicht aus demselben Commit."
  exit 1
fi

log "3/6 Neue Supabase-Migrations applyen"
if ! "${REPO_ROOT}/scripts/apply-migrations.sh"; then
  log "FEHLER: Migrations fehlgeschlagen. Starte Rollback."
  "${REPO_ROOT}/scripts/rollback.sh" "$TS" "$PREV_SHA"
  exit 1
fi

log "Vollstaendigkeit der heutigen Live-Aenderungen pruefen"
if ! bash "${REPO_ROOT}/supabase/deploy/verify-live-release.sh"; then
  log "FEHLER: Release-Pruefung fehlgeschlagen. Starte Rollback."
  "${REPO_ROOT}/scripts/rollback.sh" "$TS" "$PREV_SHA"
  exit 1
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

log "5/6 Container neu starten (frontend, functions)"
cd "${REPO_ROOT}/supabase-docker"
if ! docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --force-recreate frontend functions; then
  log "FEHLER: docker compose up fehlgeschlagen. Starte Rollback."
  "${REPO_ROOT}/scripts/rollback.sh" "$TS" "$PREV_SHA"
  exit 1
fi

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
