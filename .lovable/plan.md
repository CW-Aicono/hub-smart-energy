## Ziel

Hybrid-Datenfluss für Loxone:
- **WebSocket-Bridge (Hetzner-Worker, läuft bereits)** → Live-Power (W) + Steuerbefehle
- **HTTP-Snapshot (Edge Function, alle 15 Min)** → Zählerstände `Total / Today / Month / Year`
- **DB-Aggregation (bereits vorhanden)** → Woche / Monat / Quartal / Jahr aus Tagestotals

---

## Aktueller Stand (verifiziert im Code)

- `docs/loxone-ws-worker/index.ts` (Phase 6.3) läuft auf Hetzner, lädt `LoxAPP3.json`, schickt aber nur 60 Live-Events → reicht für Power, nicht für Zählerstände
- `supabase/functions/loxone-periodic-sync/index.ts` ist **per Hard-Code deaktiviert** (gibt HTTP 410 zurück mit Begründung „WS-Bridge only during isolation")
- `supabase/functions/loxone-api/index.ts` existiert noch (kompletter HTTP-Client für Miniserver, `CONTROL_TYPE_MAPPINGS`, totalDay/Week/Month/Year-Felder)
- DB-Aggregation für Woche/Monat existiert (`meter_weekly_totals`, `meter_monthly_totals`, `meter_period_totals`) — wird bereits für andere Gateways genutzt

→ **Wir bauen nichts neu, wir reaktivieren gezielt.**

---

## Plan (Schritt 1–3 in **einem** Patch, danach Validierung)

### Schritt 1 — `loxone-periodic-sync` reaktivieren, aber **auf Zählerstände beschränken**

Datei: `supabase/functions/loxone-periodic-sync/index.ts`

- Den Hard-Stop (Zeilen ~22–32, `return 410 disabled`) entfernen
- Im Sync-Loop nur die **Total-Felder** schreiben (`total_kwh`, `today_kwh`, `month_kwh`, `year_kwh`)
- **Power-Werte (W) NICHT** mehr schreiben — die kommen weiter ausschließlich vom WS-Worker (verhindert Doppel-Schreibungen und Konflikte)
- Schreibziel: gleiche Ingest-Route wie heute (`gateway-ingest?action=...`), nur mit reduziertem Payload

### Schritt 2 — Cron auf 15 Minuten setzen

Tool: `supabase--insert` (kein Migration, weil projektspezifische URL/Key)

```sql
select cron.schedule(
  'loxone-periodic-sync-15min',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/loxone-periodic-sync',
       headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb
     ); $$
);
```

Falls ein alter Cron-Job (z. B. minütlich) existiert: vorher `cron.unschedule(...)`.

### Schritt 3 — Aggregation verifizieren (nur lesen, kein Code)

- `meter_period_totals` (täglich) wird vom Ingest aus `today_kwh`/`total_kwh` bereits befüllt → Loxone-Zähler reihen sich automatisch ein
- Wochen-/Monatsaggregation läuft schon per pg_cron / View-Refresh für alle Gateways
- **Quartal**: per Query aus Monatswerten ableitbar — falls UI das nicht selbst macht, ist das ein separates Frontend-Ticket (nicht Teil dieses Patches)

---

## Was sich für den User ändert

- Live-Power, Energieflüsse, Automatisierung → unverändert, WS-basiert, sofortig
- Zählerstände (Today/Monat/Jahr/Total) → spätestens nach 15 Min aktuell, **driftfrei** (direkt vom Miniserver)
- Wochen-/Quartalswerte → wie heute aus Tagestotals aggregiert
- Server-Last: zusätzlich ~120 HTTP-Requests / 15 Min über alle Miniserver = vernachlässigbar

---

## Validierung nach Deploy (Du führst aus)

1. Edge-Logs `loxone-periodic-sync` → erwartet alle 15 Min ein `success: true` mit Zähleranzahl
2. SQL-Check (Du): `select meter_id, total_kwh, today_kwh, updated_at from meter_cumulative_readings where source = 'loxone' order by updated_at desc limit 20;` → `updated_at` darf nie älter als 16 Min sein
3. UI-Check: ein Loxone-Zähler in Dashboard → Total-Wert muss mit Miniserver-Web-UI übereinstimmen (±0)

---

## Nicht Teil dieses Patches

- Hetzner-Worker bleibt **unverändert** auf Phase 6.3 (läuft, mappt Power live)
- UI-Änderungen für Quartalsansicht (falls überhaupt nötig — separat klären)
- UUID-Mapping der 60 WS-Events (Option B aus vorheriger Diskussion) — nur bei Bedarf, da Zählerstände jetzt über HTTP autoritativ sind