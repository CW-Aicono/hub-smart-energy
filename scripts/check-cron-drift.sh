#!/usr/bin/env bash
# Vergleicht die in supabase/migrations/ versionierten pg_cron-Jobs mit dem
# tatsaechlichen Stand in einer laufenden Postgres-Instanz (cron.job).
#
# Deckt zwei Drift-Arten auf:
#   1. Jobs, die in der DB aktiv sind, aber durch KEINE Migration erklaert werden
#      -> typischerweise direkt im Supabase-Studio-UI angelegt. Solche Jobs landen
#         NIE in Prod, weil deploy-prod.yml nur Dateien aus dem Repo synct.
#   2. Jobs, die laut Migrations aktiv sein sollten, aber in der DB fehlen/inaktiv
#      sind -> Deploy/Migration ist nie (richtig) gelaufen (Bootstrap-Drift).
#
# Aufruf: alles nach dem Scriptnamen wird 1:1 als Befehl ausgefuehrt, der SQL
# ueber stdin/-c entgegennimmt (psql-kompatibel).
#
#   ./scripts/check-cron-drift.sh docker exec -i supabase-db psql -U supabase_admin -d postgres
#   ./scripts/check-cron-drift.sh psql "postgresql://user:pass@host:5432/postgres"
#
# Gegen staging (Lovable Cloud) UND gegen prod (Hetzner) ausfuehren und beide
# Ausgaben vergleichen, um echten Drift zwischen den beiden Umgebungen zu finden.
set -euo pipefail

MIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/migrations"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <psql-command...>" >&2
  echo '  e.g. $0 docker exec -i supabase-db psql -U supabase_admin -d postgres' >&2
  exit 1
fi

# 1) Erwartete Jobs aus den Migrations ableiten (chronologisch, letzter Stand gewinnt).
#    Kein bash-4-Feature (assoziative Arrays) genutzt, da macOS-Standard-bash 3.2 ist.
#    status_tmp haelt pro Job die jeweils neueste bekannte Aktion (SCHEDULED/REMOVED).
#    Wichtig: schedule UND unschedule im selben File (idempotentes Re-Schedule-Pattern,
#    z.B. "unschedule falls vorhanden, dann neu schedulen") gilt als weiterhin aktiv -
#    sonst wuerden alle re-geschedulten Jobs faelschlich als entfernt gelten.
status_tmp="$(mktemp)"
expected_tmp="$(mktemp)"
trap 'rm -f "$status_tmp" "$expected_tmp"' EXIT

while IFS= read -r file; do
  sched_in_file="$(mktemp)"
  unsched_in_file="$(mktemp)"

  # Datei auf eine Zeile abflachen: cron.schedule(...)-Aufrufe sind in den Migrations
  # haeufig mehrzeilig formatiert (Klammer und Jobname-String in unterschiedlichen
  # Zeilen) - grep matched pro Zeile, faende solche Aufrufe also nie. "[[:space:]]"
  # statt "\s" fuer Portabilitaet (POSIX ERE, GNU grep -E kennt "\s" nicht als Klasse).
  flat="$(tr '\n' ' ' < "$file")"

  { (printf '%s' "$flat" | grep -oE "cron\.schedule\([[:space:]]*'[a-zA-Z0-9_-]+'" | grep -oE "'[a-zA-Z0-9_-]+'" | tr -d "'" || true)
    # array-basierte Jobs, Tupel wie ['job-name', '*/5 * * * *', 'function'] - das
    # zweite Element muss wie ein Cron-Schedule aussehen, sonst greift das Pattern
    # auch auf unrelated SQL-Arrays (z.B. ARRAY['month','year']) und erzeugt Rauschen.
    (printf '%s' "$flat" | grep -oE "\[[[:space:]]*'[a-zA-Z0-9_-]+'[[:space:]]*,[[:space:]]*'[0-9*/, -]+'" | grep -oE "^[^,]*" | grep -oE "'[a-zA-Z0-9_-]+'" | tr -d "'" || true)
  } | sort -u > "$sched_in_file"

  (printf '%s' "$flat" | grep -oE "cron\.unschedule\([[:space:]]*'[a-zA-Z0-9_-]+'" | grep -oE "'[a-zA-Z0-9_-]+'" | tr -d "'" || true) | sort -u > "$unsched_in_file"

  while IFS= read -r name; do
    [ -z "$name" ] && continue
    grep -vxF "$name" "$status_tmp" > "${status_tmp}.new" 2>/dev/null || true
    mv "${status_tmp}.new" "$status_tmp"
    echo "$name SCHEDULED" >> "$status_tmp"
  done < "$sched_in_file"

  # Nur als entfernt werten, wenn im selben File KEIN Schedule fuer den Job vorkommt.
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    grep -qxF "$name" "$sched_in_file" && continue
    grep -vxF "$name" "$status_tmp" > "${status_tmp}.new" 2>/dev/null || true
    mv "${status_tmp}.new" "$status_tmp"
    echo "$name REMOVED" >> "$status_tmp"
  done < "$unsched_in_file"

  rm -f "$sched_in_file" "$unsched_in_file"
done < <(find "$MIG_DIR" -maxdepth 1 -name '*.sql' | sort)

awk '$2 == "SCHEDULED" { print $1 }' "$status_tmp" | sort -u > "$expected_tmp"

# 2) Live-Jobs aus der DB holen.
live_tmp="$(mktemp)"
trap 'rm -f "$status_tmp" "$expected_tmp" "$live_tmp"' EXIT
"$@" -At -c "SELECT jobname FROM cron.job WHERE active ORDER BY jobname;" | sort -u > "$live_tmp"

echo "=== Jobs in DB, aber durch KEINE Migration erklaert (Studio-UI-Drift-Verdacht) ==="
shadow="$(comm -23 "$live_tmp" "$expected_tmp")"
if [ -n "$shadow" ]; then
  echo "$shadow" | sed 's/^/  - /'
else
  echo "  (keine)"
fi

echo
echo "=== Jobs laut Migrations erwartet, aber NICHT aktiv in der DB (Deploy/Bootstrap-Drift) ==="
missing="$(comm -13 "$live_tmp" "$expected_tmp")"
if [ -n "$missing" ]; then
  echo "$missing" | sed 's/^/  - /'
else
  echo "  (keine)"
fi
