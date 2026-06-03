## Ziel

Pro Ladepunkt optionaler **täglicher Auto-Reboot** zur festen Uhrzeit, Soft oder Hard. Default: **deaktiviert**. Edge Function läuft **einmal pro Tag** (nicht alle 5 Minuten) und schreibt einen `Reset`-Befehl in `charge_point_commands`. Der bestehende Hetzner-OCPP-Server sendet ihn beim nächsten 2-Sekunden-Poll an die Wallbox — **keine Änderung am OCPP-Server nötig**.

## Datenbank-Migration

Neue Spalten an `public.charge_points`:

```sql
ALTER TABLE public.charge_points
  ADD COLUMN auto_reboot_enabled      boolean      NOT NULL DEFAULT false,
  ADD COLUMN auto_reboot_time         time         NOT NULL DEFAULT '04:00',
  ADD COLUMN auto_reboot_type         text         NOT NULL DEFAULT 'Soft'
    CHECK (auto_reboot_type IN ('Soft','Hard')),
  ADD COLUMN auto_reboot_skip_if_charging boolean NOT NULL DEFAULT true,
  ADD COLUMN auto_reboot_last_run_at  timestamptz;
```

Keine Backfill-Probleme — alle Defaults gesetzt, Feature ist aus.

## Edge Function `charge-point-auto-reboot`

- Läuft täglich, schaut sich an, welche Wallbox **heute** (Europe/Berlin) zur gespeicherten Uhrzeit dran ist und noch nicht gelaufen ist.
- Pseudologik:
  1. `SELECT * FROM charge_points WHERE auto_reboot_enabled = true AND (auto_reboot_last_run_at IS NULL OR auto_reboot_last_run_at::date < (now() AT TIME ZONE 'Europe/Berlin')::date) AND auto_reboot_time <= (now() AT TIME ZONE 'Europe/Berlin')::time;`
  2. Falls `skip_if_charging`: prüfen ob aktive `charging_sessions` (status `active`) existiert → skip (kein last_run_at-Update, wird beim nächsten Lauf erneut versucht).
  3. `INSERT INTO charge_point_commands (charge_point_ocpp_id, command, payload, status) VALUES (ocpp_id, 'Reset', jsonb_build_object('type', auto_reboot_type), 'pending');`
  4. `UPDATE charge_points SET auto_reboot_last_run_at = now() WHERE id = ...`

## Scheduling: pg_cron, stündlich

Damit nutzerseitig **beliebige** Uhrzeit möglich ist (z. B. 03:30, 14:15), läuft der Cron **einmal pro Stunde zur vollen Stunde** (`5 * * * *`). Die Function selbst entscheidet pro Wallbox via `auto_reboot_time <= jetzt_lokal AND last_run_at::date < heute`. Das ist trotzdem **massiv weniger Traffic** als alle 5 Minuten (24 statt 288 Läufe/Tag) und erlaubt jede Wunschuhrzeit ohne extra Logik.

> Alternative falls strikt 1×/Tag gewünscht: Cron auf z. B. `0 3 * * *` und das Zeitfeld in der UI entfällt. Empfehlung: stündlicher Cron, weil User explizit „Uhrzeit einstellbar" wollte.

Registrierung via `supabase--insert` (nicht migration), weil URL+anon_key projektspezifisch sind.

## UI

Auf der bestehenden Ladepunkt-Detail-/Bearbeitungsseite (im Tenant-Bereich, evtl. `ChargePointDialog`/Settings-Tab) **eine neue Card "Automatischer Tages-Reboot"**:

- Switch „Aktivieren" → `auto_reboot_enabled`
- TimePicker / `<Input type="time">` → `auto_reboot_time` (default 04:00)
- RadioGroup Soft / Hard → `auto_reboot_type` (default Soft, mit Hinweistext: „Soft ist schonender und reicht in den meisten Fällen aus.")
- Checkbox „Nicht rebooten während aktiver Ladevorgang" → `auto_reboot_skip_if_charging` (default an)
- Anzeige: „Letzter Auto-Reboot: TT.MM.JJJJ HH:MM" wenn `auto_reboot_last_run_at` gesetzt
- Hilfetext: „Empfohlen für Wallboxen, die sich nach mehreren Tagen Laufzeit selten von alleine wieder mit dem Backend verbinden (z. B. einige Duosida-Modelle)."

Speicherung läuft über bestehendes `useChargePoints.updateChargePoint`.

## TypeScript-Typen

`src/integrations/supabase/types.ts` wird vom System automatisch nach der Migration aktualisiert. `ChargePoint`-Interface in `src/hooks/useChargePoints.tsx` um die 5 Felder ergänzen.

## Was NICHT gemacht wird

- Kein Update des Hetzner-OCPP-Servers (`docs/ocpp-persistent-server/...`).
- Keine WebSocket-/Pong-Watchdog-Änderung (Stufe 1 verworfen).
- Keine Tasks-Integration (Stufe 3 verworfen).
- Keine modell-/vendor-basierten Defaults (rein pro Wallbox).

## Verifikation nach Deploy

1. Test-Wallbox: Funktion aktivieren, Zeit auf „in 2 Min" stellen → nach ≤ 1 h kommt automatisch ein `Reset` (Soft) an, `auto_reboot_last_run_at` füllt sich, `ocpp_message_log` zeigt outgoing `Reset`-Frame, Wallbox bootet, neues `BootNotification` folgt.
2. Mit aktivem Ladevorgang + `skip_if_charging=true`: kein Reset, `last_run_at` bleibt leer, beim nächsten Stundenlauf nach Sessionende wird ausgeführt.
3. Function aus: keine Einträge mehr.
