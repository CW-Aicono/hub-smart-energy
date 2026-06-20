# Worker-Killswitch im Super-Admin-Dashboard

Ziel: Du kannst im Super-Admin-Bereich per Schalter einzelne Worker **anhalten** und **wieder starten** — ohne neues Deployment, ohne SSH, ohne Cron-Eingriff. Effekt ist innerhalb von ≤ 1 Minute aktiv.

## Welche Worker sind steuerbar


| Schalter                  | Was er stoppt                                           | Wo läuft das?  |
| ------------------------- | ------------------------------------------------------- | -------------- |
| `loxone_ws_worker`        | Hetzner Loxone-WebSocket-Worker (Haupt-IO-Verdächtiger) | Hetzner Docker |
| `loxone_periodic_sync`    | Edge-Function `loxone-periodic-sync`                    | Cron + Cloud   |
| `shelly_periodic_sync`    | Edge-Function `shelly-periodic-sync`                    | Cron + Cloud   |
| `gateway_periodic_sync`   | Edge-Function `gateway-periodic-sync`                   | Cron + Cloud   |
| `brighthub_periodic_sync` | Edge-Function `brighthub-periodic-sync`                 | Cron + Cloud   |


Jeder Schalter ist einzeln, unabhängig, jederzeit reversibel. Default: **alle „aktiv"**.

## Wie es technisch funktioniert (eine Quelle der Wahrheit)

1. **Neue Tabelle `worker_controls**` mit einer Zeile pro Worker (`worker_key`, `enabled`, `paused_at`, `paused_by`, `note`). Nur Super-Admins dürfen lesen/schreiben (RLS + GRANT).
2. **Edge-Functions** (`loxone-periodic-sync`, `shelly-periodic-sync`, `gateway-periodic-sync`, `brighthub-periodic-sync`) bekommen **am Anfang einen Killswitch-Check**: Wenn `enabled = false`, sofort `200 OK` mit `{skipped: true}` zurück — keine DB-Schreibarbeit, keine externen Calls.
3. **Hetzner Loxone-Worker** (`docs/loxone-ws-worker/index.ts`) pollt die Tabelle **alle 30 Sekunden**. Wenn `enabled = false`: alle WebSocket-Verbindungen sauber trennen, Flush-/Reload-Loops pausieren, Heartbeat weiterlaufen lassen (damit man sieht: er lebt, ist aber „idle"). Bei Wieder-Aktivierung: normaler Reconnect-Pfad.
4. **UI**: Neuer Tab „Worker-Steuerung" in `SuperAdminDashboard` mit 5 Schaltern, jeweils Status-Badge (Aktiv / Pausiert seit hh:mm, von wem), Notizfeld, „Pausieren"/„Starten"-Button mit Bestätigungsdialog. Live-Refresh alle 15 s.

## Sicherheit & Sichtbarkeit

- Nur `super_admin` darf den Toggle sehen und betätigen (RLS + UI-Guard).
- Jede Schaltung schreibt `audit_logs`-Eintrag (wer, wann, welcher Worker, an/aus, Notiz).
- Im normalen Tenant-UI taucht nichts davon auf.

## Was es **nicht** macht

- Es löscht keine Cron-Jobs und ändert keine Schedules. Cron läuft weiter, die Function antwortet nur sofort mit „skipped". Das hält den Cron-Status sauber und reversibel.
- Es fasst den Loxone-Worker-Container nicht an (kein `docker stop`). Der Prozess läuft, ist aber idle.
- Es ändert keine bestehenden Daten in `meter_power_readings` o. ä.

## Wirkung auf das IO-Budget (Erinnerung)

Das IO-Budget ist ein 24-Stunden-Mittel. Auch mit Killswitch wird der Balken **erst nach ca. 6 h sichtbar**, **nach 24 h vollständig** sinken. Der Schalter ist also gleichzeitig das **saubere Messinstrument**, das wir vorher diskutiert haben: einschalten = Worker still, dann 24 h beobachten, danach Entscheidung.

## Technische Details (für später)

- Migration: `worker_controls` (PK `worker_key text`), 5 Seed-Zeilen, RLS (`has_role(auth.uid(),'super_admin')`), GRANT für `authenticated` + `service_role`.
- Hook `useWorkerControls` mit React-Query, `staleTime: 10s`, `refetchInterval: 15s`.
- Komponente `WorkerControlsPanel.tsx` (neu) eingebunden als neuer Tab in `SuperAdminDashboard.tsx`.
- Edge-Funktionen: ein gemeinsamer Helper `_shared/workerKillswitch.ts` (Service-Role-Read), 4 Funktionen rufen ihn am Anfang auf.
- Hetzner-Worker: Datei `docs/loxone-ws-worker/index.ts` bekommt `pollKillswitch()` (alle 30 s, Service-Role-Key vorhanden), neue Zustände `RUNNING` / `PAUSED`. **Du musst das Worker-Image danach 1× manuell auf Hetzner aktualisieren** (Anleitung folgt nach Implementierung als beginner-sichere Klick-Schritte).

## Reihenfolge der Umsetzung

1. Migration `worker_controls` + Seed + RLS + GRANT.
2. Edge-Helper + Killswitch-Check in den 4 periodischen Functions, redeploy.
3. UI-Panel im `SuperAdminDashboard`.
4. Loxone-Worker-Code-Patch + exakte Hetzner-Update-Anleitung in Deutsch.

Schritt 1–3 wirken sofort nach Approval (Cloud-Teil). Schritt 4 (Hetzner) brauchst **du** für ~5 Minuten am Server, wird Klick-für-Klick erklärt.

## Frage vor Implementierung

Sollen wirklich **alle 5 Worker** steuerbar sein, oder reicht dir für den Anfang **nur `loxone_ws_worker**` (der einzig belegte IO-Treiber)? Variante „nur Loxone" ist deutlich kleiner und billiger — Cron-Worker können wir später nachrüsten, falls nötig.  
  
antwort: mache alle 5 Worker per Switch steuerbar