## Ziel

Die beiden Karten „Loxone-Abfrage-Intervalle" und „Loxone-WebSocket-Worker (Hetzner)" gehören inhaltlich zur Gateway-Flotte und werden dorthin verschoben. Zusätzlich bekommt die Karte „Loxone-Abfrage-Intervalle" eine echte Funktion: eine **Master-Drosselung (Hard Floor)** für IO-Notfälle.

## Verschiebung

- Beide Karten aus der bisherigen Super-Admin-Übersicht entfernen und in die Seite **Gateway-Flotte** (Super-Admin) einhängen, direkt unter der bestehenden Flottenübersicht.
- Layout: zweispaltig auf Desktop, gestapelt auf Mobile.
- Bestehende Datenquellen und Polling (30 s) bleiben unverändert.

## Master-Drosselung (Hard Floor)

**Konzept**
- Neuer Wert in `system_settings`: `loxone_master_poll_floor_minutes` (Integer, 1–60, `null`/leer = deaktiviert).
- Semantik im HTTP-Pull (`loxone-periodic-sync`): effektives Intervall = `max(tenant_config_minutes, master_floor_minutes)`.
- Wirkt nur nach oben (verlängert Intervalle) — Tenants mit ohnehin längerem Intervall bleiben unberührt.
- Kein Opt-out pro Standort (bewusst einfach gehalten).

**UI in der Karte „Loxone-Abfrage-Intervalle" (auf Gateway-Flotte)**
- Kopfzeile mit zwei Badges:
  - Drosselungs-Flag (`loxone_respect_poll_interval`) — unverändert.
  - **Neu:** Master-Floor-Status (`Aus` / `Aktiv: N Min`).
- Kompakter Steuerblock (nur `super_admin`): Nummerneingabe 1–60 + Speichern + „Deaktivieren"-Button. Kurzer Hilfetext: „Überschreibt kürzere Tenant-Intervalle. Für IO-Notfälle."
- Preset-Buttons: `Aus`, `15 Min`, `30 Min`, `60 Min` für Ein-Klick-Notfall.
- Tabelle bekommt eine zusätzliche Spalte **Effektiv (Min)** — zeigt `max(konfiguriert, floor)`; wenn Floor greift, Badge „durch Master-Floor" an der Zeile.

## Backend

- `system_settings`-Zeile wird lazy angelegt (kein Migration nötig, `useSetSystemSetting` upsertet bereits).
- `supabase/functions/loxone-periodic-sync/index.ts` (bzw. der Ort, an dem `poll_interval_minutes` gelesen wird): Master-Floor einmal pro Run laden und auf jedes Tenant-Intervall anwenden.
- Kurzer In-Function-Cache (60 s), um zusätzliche `system_settings`-Reads zu vermeiden.

## Audit

- Änderungen des Master-Floors werden über `writeAuditLog` protokolliert (`action: "loxone.master_floor.update"`, before/after).

## Nicht enthalten

- Kein Worker-Kill-Switch (bewusst ausgeklammert).
- Keine Standort-Ausnahmen.
- Keine Änderungen am WS-Worker-Verhalten.

## Technische Details

- Neue Komponenten: keine — bestehende `LoxonePollingOverviewCard` erweitern und in die Gateway-Flotte-Seite einhängen; die bestehende Karte für den WS-Worker (Hetzner) 1:1 mitverschieben.
- Betroffene Dateien (ungefähr):
  - `src/pages/SuperAdminGatewayFleet.tsx` (oder Äquivalent) — beide Karten einhängen.
  - Bisheriger Einbindungsort — Karten entfernen.
  - `src/components/super-admin/LoxonePollingOverviewCard.tsx` — Master-Floor-UI + effektive Spalte.
  - `supabase/functions/loxone-periodic-sync/index.ts` — Floor anwenden.
- Zugriff: Steuerblock nur bei `is_support_user`/`super_admin`; Lesezugriff bleibt wie bisher.
