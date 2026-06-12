# Warum Auto-Reboot auf Hetzner nicht läuft

## Ursache (kein Code-Bug)

Die Funktion `Automatischer Tages-Reboot` besteht aus **drei** Bausteinen, die alle vorhanden sein müssen:

1. **Edge Function** `charge-point-auto-reboot` (liest Wallboxen, schreibt Reset in `pending_ocpp_commands`, setzt `auto_reboot_last_run_at`)
2. **pg_cron-Job**, der die Edge Function **stündlich** aufruft
3. **OCPP-Server** (Hetzner Live `cp.aicono.org`), der den Reset-Befehl an die verbundene Wallbox sendet

Auf der **Lovable-Cloud-Datenbank** sind alle drei Teile vorhanden — der Cron-Job `charge-point-auto-reboot-hourly` (Plan: `5 * * * *`) ist aktiv, die Wallbox „Ost 1" wird seit dem 04.06.2026 jeden Tag um 03:05 Berlin sauber resettet (in `pending_ocpp_commands` alle 9 Einträge `status=completed`, `Accepted`).

Die Hetzner-Wallbox aus Screenshot 2 hängt aber an einer **separaten, selbst-gehosteten Supabase auf Hetzner** (eigene `supabase-docker`-Instanz). Auf dieser zweiten Datenbank fehlt mindestens eines:

- die Edge Function `charge-point-auto-reboot` ist nicht deployed, **oder**
- der pg_cron-Job, der sie stündlich aufruft, ist nicht angelegt, **oder**
- die `pg_cron`/`pg_net`-Extensions sind nicht aktiviert, **oder**
- der Cron-Job ruft eine falsche URL/Service-Role-Key auf.

Symptom passt exakt: `auto_reboot_last_run_at` bleibt `null` (deshalb fehlt die Zeile „Letzter Auto-Reboot" in Screenshot 2), obwohl der Schalter an und die Uhrzeit gesetzt ist.

Der OCPP-Server (Live, `cp.aicono.org`) ist **nicht** das Problem — er würde einen Reset sofort senden, sobald er einen Eintrag in `pending_ocpp_commands` für eine verbundene Wallbox sieht.

## Was zu tun ist

Auf der Hetzner-Supabase fehlt das Auto-Reboot-Setup. Ich bereite eine **Schritt-für-Schritt-Anleitung für Laien** (deutsch, click-by-click) vor, mit der das Setup auf der Hetzner-Supabase nachgeholt wird. Geliefert wird ein Markdown-Dokument unter `docs/ocpp-persistent-server/AUTO_REBOOT_HETZNER_SETUP.md`.

Inhalt der Anleitung:

1. **Vorprüfung** in Supabase Studio (Hetzner):
   - Tabelle `charge_points` öffnen, prüfen dass die Spalten `auto_reboot_enabled`, `auto_reboot_time`, `auto_reboot_type`, `auto_reboot_skip_if_charging`, `auto_reboot_last_run_at` existieren. Falls nicht: exakter `ALTER TABLE`-Block zum Einfügen (Copy-Paste-fertig).
   - Tabelle `pending_ocpp_commands` muss existieren (existiert in jedem aktiven Hetzner-OCPP-Setup, nur Sichtprüfung).

2. **Extensions aktivieren** (genau ein SQL-Snippet, im SQL-Editor einfügen):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   ```

3. **Edge Function deployen**:
   - Die Datei `supabase/functions/charge-point-auto-reboot/index.ts` (Code identisch zu Lovable) in der Hetzner-Funktionsverwaltung anlegen. Exakter Pfad, exakter Dateiinhalt als Copy-Paste-Block.
   - Hinweis: Funktion benötigt die Standard-Env-Variablen `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`. Diese sind in selbst-gehosteten Setups bereits gesetzt — Sichtprüfung beschrieben.

4. **Cron-Job anlegen** (exakter SQL-Block, mit Platzhaltern, die der User durch seine Hetzner-Supabase-URL und seinen Service-Role-Key ersetzt — beides wird Schritt für Schritt erklärt, wo es zu finden ist):
   ```sql
   select cron.schedule(
     'charge-point-auto-reboot-hourly',
     '5 * * * *',
     $$ select net.http_post(
       url:='https://<HETZNER-SUPABASE-DOMAIN>/functions/v1/charge-point-auto-reboot',
       headers:=jsonb_build_object(
         'Content-Type','application/json',
         'apikey','<SERVICE_ROLE_KEY>',
         'Authorization','Bearer <SERVICE_ROLE_KEY>'
       ),
       body:='{}'::jsonb
     ); $$
   );
   ```

5. **Sofort-Testlauf** ohne auf die nächste volle Stunde + 5 Min zu warten:
   - SQL-Befehl, der die Funktion einmalig manuell aufruft (`select net.http_post(...)` direkt).
   - Erwartetes Ergebnis: `auto_reboot_last_run_at` wird gesetzt (wenn aktuelle Uhrzeit ≥ konfigurierter Reboot-Zeit), oder Edge-Function-Log zeigt `skippedTimeNotReached: 1` (wenn vor der Uhrzeit).

6. **Verifikation**:
   - In `pending_ocpp_commands` nach `command='Reset'` für die ocpp_id der Wallbox suchen.
   - Status muss innerhalb 2 Sekunden auf `completed` springen, wenn die Wallbox am Live-OCPP-Server hängt.
   - In der Wallbox-Detailseite Frontend neu laden → „Letzter Auto-Reboot" muss erscheinen.

7. **Troubleshooting-Abschnitt** mit den 4 häufigsten Fehlern und exakter Behebung:
   - `auto_reboot_last_run_at` bleibt `null` → Cron-Job läuft nicht (SELECT auf `cron.job_run_details` zum Prüfen).
   - Reset bleibt auf `status=pending` → Wallbox ist nicht mit `cp.aicono.org` verbunden (Prüfung `ws_connected`).
   - Edge Function gibt 401 → Service-Role-Key im Cron-Job falsch.
   - `relation "cron.job" does not exist` → Extension nicht aktiviert.

## Technische Details (für die IT-Hand)

- Edge-Function-Code muss 1:1 aus `supabase/functions/charge-point-auto-reboot/index.ts` übernommen werden — keine Änderungen nötig, da `SUPABASE_URL` etc. aus den Env-Variablen kommen.
- Der Cron-Job nutzt `pg_net` (HTTP aus der DB). In selbst-gehosteten Supabase-Stacks ist `pg_net` enthalten, aber nicht immer aktiv.
- Multi-Tenancy-Filter ist nicht erforderlich, da die Function über alle `charge_points` mit `auto_reboot_enabled=true` iteriert — gleiches Verhalten wie auf Lovable.
- Keine Code-Änderungen am Cloud-Projekt nötig. Nur ein neues Dokument in `docs/`.

## Was ich NICHT mache

- Keine Änderung am Frontend, am OCPP-Server, an der Edge Function oder am Cron-Job in der Lovable-Cloud-DB (dort läuft alles).
- Keine automatische Bereitstellung der Hetzner-Supabase — das passiert manuell durch den Admin, da ich keinen Zugriff auf die selbst-gehostete Instanz habe.
