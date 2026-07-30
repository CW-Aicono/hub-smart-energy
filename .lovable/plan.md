## Befund (verifiziert)

- Letzter Eintrag in `ocpp_message_log`: **29.07.2026, 10:09:56 UTC = 12:09 Uhr lokal**. Danach 0 Zeilen.
- Die Wallboxen sind **nicht** das Problem: `charge_points` zeigt aktuelle Heartbeats (Ost 1 / MEN138720200074a um 22:04 Uhr, 0311303102122250589 um 22:03 Uhr). Der OCPP-Server läuft und schreibt weiter in andere Tabellen.
- Der Aufräum-Cronjob (`cleanup-old-ocpp-logs`, 03:00 Uhr) kann einen Stopp um 12:09 nicht erklären.

Es gibt **zwei Schalter**, die das Frame-Logging abschalten:

1. **Server-seitig (Hetzner):** `OCPP_FRAME_LOGGING_ENABLED` in der `.env` des OCPP-Containers. Default im Code ist `false`; ist er aus, sendet der Server gar keine Log-Batches (`backendApi.ts:152` bricht vorher ab).
2. **Backend-seitig:** Edge Function `ocpp-persistent-api` prüft `system_settings.ocpp_message_logging_enabled` und `backend_emergency_mode`. Aktueller DB-Stand: Logging = `true`, Notfallmodus = `false` (beide zuletzt 13:48 UTC gesetzt).

Da der Backend-Schalter seit 13:48 UTC wieder offen ist, aber trotzdem keine Zeile ankommt, liegt die Sperre **mit hoher Wahrscheinlichkeit vor dem Backend** — also am Server-Flag bzw. an einem Container-Neustart um ~12:07 mit alter/ohne `.env`-Zeile. Das ist die naheliegendste, aber noch **nicht bewiesene** Ursache; Schritt 1 des Plans beweist oder widerlegt sie.

## Plan

**Schritt 1 — Ursache beweisen (kein Rätselraten)**
- Testaufruf der Edge Function `ocpp-persistent-api` mit `action=log-messages-batch` und einem Dummy-Frame. Kommt `{inserted: 1}` zurück und erscheint die Zeile in der DB, ist das Backend sauber → Ursache liegt auf dem Hetzner-Container.
- Antwortet die Funktion `skipped: "ocpp_message_logging_disabled"`, ist die Ursache das Settings-/Notfall-Gate (dann Cache-TTL bzw. Wertformat prüfen).
- Zusätzlich die Edge-Logs der Funktion rund um 10:00–10:15 UTC prüfen (Fehler „settings lookup failed" setzt den Cache auf Notfallmodus).

**Schritt 2 — Fix je nach Ergebnis**
- Fall A (Server-Flag aus): in `docs/ocpp-persistent-server/.env` auf dem Hetzner-Host `OCPP_FRAME_LOGGING_ENABLED=true` setzen und den Container neu starten. Dazu liefere ich eine laienverständliche Schritt-für-Schritt-Anleitung als Markdown-Datei im Ordner des OCPP-Servers.
- Fall B (Backend-Gate): Settings-Wert korrigieren bzw. das Fail-Closed-Verhalten des Settings-Lookups entschärfen (kurzer Retry statt sofortigem „Logging aus"), damit ein einzelner DB-Timeout nicht stundenlang alles Logging abschaltet.

**Schritt 3 — Damit das nicht mehr unbemerkt passiert**
- `/health` des OCPP-Servers um `frameLogging: true|false` erweitern.
- In der UI (OCPP-Log-Ansicht der Ladepunkt-Detailseite) ein deutliches Banner anzeigen, wenn seit > 15 Minuten keine Zeile eingegangen ist, mit Hinweis „Frame-Logging ist deaktiviert" statt einer nur leeren Liste.

## Technische Details

- Betroffene Dateien: `docs/ocpp-persistent-server/src/config.ts`, `src/index.ts` (Health), `supabase/functions/ocpp-persistent-api/index.ts` (Settings-Fallback), OCPP-Log-Komponente im Frontend, neue Update-Anleitung unter `docs/ocpp-persistent-server/`.
- Keine Schema-Änderung nötig; die Partitionierung/Rollups von gestern sind nicht beteiligt (`ocpp_message_log` ist davon unberührt).
