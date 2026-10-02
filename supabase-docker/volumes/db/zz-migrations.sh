#!/bin/sh
# Wendet App-Migrationen an und trackt sie in supabase_migrations.schema_migrations.
# Bereits angewendete werden geskippt. Fehlschlagende werden geloggt aber nicht
# gestoppt — nächste Migration läuft trotzdem.
#
# Kann auch gegen eine laufende DB ausgeführt werden (nur neue Migrationen):
#   docker exec supabase-db sh /usr/local/bin/apply-migrations.sh
set -u

MIGRATIONS_DIR="/docker-entrypoint-initdb.d/app-migrations"
PSQL="psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc -U supabase_admin -d postgres"

echo "zz-migrations.sh: checking app migrations in $MIGRATIONS_DIR..."

# Tracking-Tabelle anlegen falls noch nicht vorhanden
$PSQL <<'EOSQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text
);
EOSQL

applied=0
skipped=0
failed=0

for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$f" ] || continue

    filename=$(basename "$f" .sql)
    version=$(echo "$filename" | cut -d'_' -f1)

    # Bereits angewendet?
    count=$($PSQL -tAc "SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE version = '$version';")

    if [ "$count" = "1" ]; then
        skipped=$((skipped + 1))
        continue
    fi

    echo "  -> $filename"
    if $PSQL -f "$f"; then
        $PSQL -c "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$version', '$filename');"
        applied=$((applied + 1))
    else
        echo "  !! WARN: $filename failed — nicht recorded, retry mit: docker exec supabase-db sh /usr/local/bin/apply-migrations.sh"
        failed=$((failed + 1))
    fi
done

echo ""
echo "zz-migrations.sh: done."
echo "  Applied:  $applied"
echo "  Skipped:  $skipped (already applied)"
echo "  Failed:   $failed"
