# Plan: WS-Default & Auto-Verknüpfung für neue Miniserver

## Ziel
Neue Loxone-Miniserver sollen ab sofort automatisch:
1. WebSocket-Verbindung als Default-Modus nutzen (statt HTTP-Poll).
2. Beim ersten erfolgreichen Kontakt einen Eintrag in `bridge_miniserver_links` erhalten (inkl. `tenant_id`, `location_id`, `serial_number`).

## Ausgangslage (verifiziert)
- Spalte `location_integrations.loxone_remote_connect_ws_enabled` existiert, **Default = FALSE** (Migration 20260618). Neue Integrationen laufen daher standardmäßig im HTTP-Poll-Modus.
- Im `EditIntegrationDialog` gibt es bereits einen Toggle (setzt manuell true/false).
- `bridge_miniserver_links` wird aktuell weder vom `loxone-ws-worker` noch von `loxone-api` beim ersten Kontakt automatisch angelegt — die Einträge stammen aus Seeds/Migrationen bzw. wurden manuell nachgetragen (siehe letzte Migration für AICONO Zentrale, Jugendzentrum, Testkoffer).

## Umsetzung

### Teil 1 — WS als Default
1. **Migration**
   - `ALTER TABLE location_integrations ALTER COLUMN loxone_remote_connect_ws_enabled SET DEFAULT TRUE;`
   - Optionaler Backfill: bestehende Loxone-Integrationen mit `NULL`/`FALSE` und aktivem Cloud-DNS auf `TRUE` setzen — **nur nach Rückfrage**, um niemanden ungewollt umzustellen. Standard: nur Default ändern, Bestand unverändert.
2. **UI-Anpassung** (`EditIntegrationDialog.tsx`)
   - Initial-State beim Anlegen neuer Loxone-Integrationen auf `true` setzen (Formular-Default), damit auch der explizit übergebene Wert konsistent ist.
   - Kleiner Hinweistext: „Empfohlen: WebSocket (Realtime, geringere Last)".

### Teil 2 — Auto-Verknüpfung `bridge_miniserver_links`
Zwei Trigger-Punkte, damit sowohl WS- als auch HTTP-Nutzer erfasst werden:

**A) im `loxone-ws-worker`** (Hetzner-Repo, außerhalb Lovable — Aufgabe wird nur dokumentiert, nicht hier committet):
- Nach erfolgreichem WS-Handshake und Auslesen der `msInfo.serialNr`:
  - `upsert` auf `bridge_miniserver_links` mit `on_conflict=miniserver_serial` — Felder: `miniserver_serial`, `tenant_id`, `location_id`, `location_integration_id`, `last_seen_at=now()`.

**B) in `supabase/functions/loxone-api/index.ts`** (HTTP-Poll-Pfad, hier im Repo):
- In der Structure-Fetch-Routine (~Zeile 1092) wird `LoxAPP3.json` geladen; darin steht `msInfo.serialNr`. Direkt danach:
  - Prüfen ob Link existiert (`select miniserver_serial from bridge_miniserver_links where miniserver_serial=…`).
  - Falls nicht: `insert` mit den bekannten IDs.
  - Falls vorhanden aber `location_id`/`tenant_id` NULL: `update` mit Backfill.
- Fehler dabei nur loggen, nicht die Response brechen.

**C) RLS/Grants**
- `bridge_miniserver_links` hat bereits Policies. Sicherstellen, dass Service-Role write darf (ist der Fall, da Edge Functions mit Service-Role laufen). Kein Migrationsbedarf erwartet.

### Teil 3 — Sichtbarkeit
- Kein UI-Umbau nötig: Neue Miniserver erscheinen ab dann automatisch mit Seriennummer in „Gateway-Flotte" und werden korrekt in `bridge_event_log` attribuiert.

## Nicht im Scope
- Nachträgliches Umschalten aller bestehenden HTTP-Poll-Integrationen auf WS (opt-in, nicht automatisch).
- UI zum manuellen Editieren von `bridge_miniserver_links` (kann nachgezogen werden, falls gewünscht).

## Reihenfolge
1. Migration (Default → TRUE).
2. Edge Function `loxone-api`: Auto-Link beim Structure-Fetch.
3. UI-Default im Dialog + Hinweistext.
4. Worker-Anpassung (Hetzner-Repo, separates Deployment).

## Offene Frage
Sollen bestehende Loxone-Integrationen (HTTP-Poll) in einem einmaligen Backfill mit auf WS umgestellt werden, oder bleibt WS opt-in für Bestand?
