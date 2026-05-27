## Ursache gefunden

Der Miniserver ist erreichbar (auf Hetzner kommen Daten an). Der eigentliche Grund, warum auf der Lovable-Cloud-Staging-Umgebung seit 26.05. 15:20 Uhr keine neuen Live-Werte mehr ankommen, liegt **nicht** am Miniserver, sondern am Cron-System der Cloud-Datenbank:

1. Der Cron-Job `ems-loxone-periodic-sync` läuft jede Minute und meldet `succeeded`.
2. Er ruft aber `private.invoke_edge_function('loxone-periodic-sync')` auf.
3. Diese Funktion liest `private.cron_settings`. Die Tabelle ist **leer**:
   ```
   SELECT supabase_url, enabled, service_role_key IS NOT NULL ...
   → 0 rows
   ```
4. Ist die Zeile fehlend oder `enabled = false`, gibt die Funktion sofort `NULL` zurück und es wird **nie ein HTTP-Call** an die Edge-Function abgesetzt.
5. Folge: Die Edge-Function-Logs zeigen seit Stunden keinen einzigen `loxone-api`-Aufruf. Loxone-, Shelly- und Gateway-Sync stehen still. Die `meter_power_readings_5min` bleibt leer ab 15:20.

Hetzner ist davon nicht betroffen, weil dort `cron_settings.enabled = true` mit gültiger URL/Service-Key gesetzt ist.

## Fix (3 Schritte)

### 1. `private.cron_settings` auf Lovable Cloud aktivieren  
Eine Zeile in `private.cron_settings` einfügen mit:
- `id = true`
- `supabase_url = 'https://xnveugycurplszevdxtw.supabase.co'`
- `service_role_key = <SUPABASE_SERVICE_ROLE_KEY>`
- `enabled = true`

Das aktiviert **alle** Periodic-Sync-Jobs (Loxone, Shelly, Gateway, Brighthub) gleichzeitig. Erfolgt per `supabase--insert` (kein Migrationsfile, da Secret-Inhalt).

### 2. Stillen Cron-Fehlern entgegenwirken  
`private.invoke_edge_function` so erweitern, dass bei `enabled = false` / leerer Konfiguration eine `RAISE NOTICE`-Meldung mit klarer Begründung im Cron-Log landet, statt einfach `NULL` zurückzugeben. So sieht man künftig in `cron.job_run_details.return_message`, warum nichts passiert.

### 3. Loxone-Token-Ablauf im periodic-sync sichtbar machen  
Aktuell wirft `loxone-api` bei HTTP 401 einen Error, der über `data.success = false` in `integration_errors` landet. Das funktioniert grundsätzlich, allerdings nur, wenn die Edge-Function überhaupt aufgerufen wird (siehe Schritt 1). Zusätzlich:
- In `loxone-periodic-sync` bei Antwort-Status != 200 **immer** einen `integration_error` mit dem konkreten HTTP-Status anlegen (heute wird nur `data.error` ausgewertet, was bei einem 504/Timeout fehlt).
- In `loxone-api` nach einem 401 das ggf. gecachte Token im Speicher invalidieren, damit der nächste Cron-Lauf automatisch frisch authentifiziert (Selbstheilung).

## Erwartetes Ergebnis

- Innerhalb von 1 Minute nach Schritt 1 schreibt `loxone-periodic-sync` wieder neue Zeilen in `meter_power_readings_5min`.
- Dashboard-Widgets („Strom", „Gas", „Wärme", „Eigenverbrauch", PAC 3220 …) zeigen wieder Live-Werte für „Mittwoch, 27. Mai 2026".
- Künftige Cron-Ausfälle sind in `cron.job_run_details.return_message` sofort sichtbar (Schritt 2).
- Token-Ablauf am Miniserver wird automatisch nach einem Zyklus geheilt (Schritt 3).

## Technische Details

- Schritt 1: einmaliger `INSERT INTO private.cron_settings (id, supabase_url, service_role_key, enabled) VALUES (true, ..., ..., true);`
- Schritt 2: `CREATE OR REPLACE FUNCTION private.invoke_edge_function` mit `RAISE NOTICE 'cron_settings not configured/enabled'` bei Early-Return.
- Schritt 3: in `supabase/functions/loxone-periodic-sync/index.ts` Block ab Zeile 87 erweitern (Error-Insert auch wenn `!response.ok` ohne `data.error`); in `supabase/functions/loxone-api/index.ts` Token-Cache (Modul-Scope-Map) invalidieren wenn `structureResponse.status === 401`.
