
# Per-Tenant Ingest-Keys + separater Worker-Key

## Problem

Aktuell teilen sich Hetzner-Worker (`loxone-ws-worker`) und alle Tenants **denselben** globalen `GATEWAY_API_KEY`. Der Tenant sieht diesen Key in `/integrations → API` und könnte damit theoretisch für andere Tenants pushen bzw. den Worker mit-rotieren. Der Tenant sollte den Worker-Key gar nicht kennen.

## Zielbild

- **Tenant-Key**: Jeder Tenant bekommt einen eigenen, tenant-gebundenen API-Key. Nur damit kann er in seine eigene `tenant_id` pushen. Sichtbar & rotierbar im Tenant-UI (`/integrations → API`).
- **Worker-Key**: Der bestehende `GATEWAY_API_KEY` bleibt bestehen und wird zum reinen Worker-/Bridge-Key. Er kann in **alle** Tenants pushen (weil Hetzner-Bridges für mehrere Tenants senden). Nur im Super-Admin sichtbar/rotierbar.
- Migration ohne Downtime: Hetzner-Worker laufen unverändert weiter, Tenants sehen ab sofort ihren neuen eigenen Key.

## Änderungen

### 1. Datenbank (Migration)

Neue Tabelle `tenant_api_keys`:

```text
id uuid pk
tenant_id uuid -> tenants(id) on delete cascade
key_hash text (SHA-256, unique)
key_prefix text (erste 8 Zeichen, für UI-Anzeige "aic_xxxxxxxx...")
label text (default 'default')
created_by uuid -> auth.users
created_at, last_used_at, revoked_at timestamptz
```

- RLS: Tenant-User (admin/user) sehen nur `tenant_id = tenant_id_of(auth.uid())`. Super-Admin sieht alles.
- GRANT SELECT/INSERT/UPDATE/DELETE an `authenticated`, ALL an `service_role`.
- Klartext-Key existiert nur einmal (bei Generierung), Rest ist Hash. Prefix wie `aic_live_` erleichtert Erkennung.

### 2. Edge Function `gateway-ingest` (Auth-Logik anpassen)

Neue Reihenfolge beim Auth-Check:

1. Bearer-Token extrahieren.
2. Hash bilden → `tenant_api_keys` lookup.
   - Treffer: `tenant_id` fixieren. Payload-Readings müssen exakt diese `tenant_id` haben, sonst 403.
   - `last_used_at` aktualisieren (fire-and-forget).
3. Kein Treffer → Vergleich mit `GATEWAY_API_KEY` (Worker-Key).
   - Treffer: `tenant_id` aus Payload/Meter-Zuordnung übernehmen (aktuelles Verhalten, keine Einschränkung).
4. Sonst 401.

Damit läuft der Hetzner-Worker unverändert weiter, und Tenant-Keys sind sauber tenant-scoped.

### 3. Neue Edge Functions

- `tenant-api-key-create` — generiert neuen Key (`aic_live_<32 rand>`), speichert Hash, gibt Klartext **einmalig** zurück. Nur für Admin des Tenants oder Super-Admin.
- `tenant-api-key-list` — listet Prefix + Label + Zeitstempel (nie Klartext).
- `tenant-api-key-revoke` — setzt `revoked_at` (Lookup ignoriert revoked Keys).

### 4. Tenant-UI (`src/components/settings/ApiSettings.tsx`)

- „API-Key"-Feld ersetzen durch Liste eigener Keys (Prefix, Label, letzter Zugriff, Revoke-Button).
- Button „Neuen Key erzeugen" → Dialog, der den Klartext einmalig anzeigt (Copy-to-Clipboard + Warnung „wird nicht erneut angezeigt").
- Bestehendes `api-key-info` liefert nicht mehr den Worker-Key, sondern nur noch Endpoint + Tenant-ID.

### 5. Super-Admin-UI (neue Sektion)

Unter Super-Admin → Infrastruktur → „Bridge-Worker-Keys":

- Anzeige des aktuellen `GATEWAY_API_KEY` (maskiert, Reveal via Button, Copy).
- Button „Worker-Key rotieren" → ruft `secrets--update_secret` Flow (Hinweis: erfordert danach Redeploy des Hetzner-Workers, wird im UI vermerkt).
- Nur `super_admin`.

### 6. Dokumentation

- `docs/loxone-ws-worker/README` (falls vorhanden) klarstellen: Worker verwendet `GATEWAY_API_KEY` (globaler Bridge-Key), nicht Tenant-Key.
- Kurze Notiz für Tenants: „Für eigene Push-Integrationen (Schneider Panel etc.) hier einen Key generieren."
- Memory-Update: `mem://technical/security/ingest-key-model` mit dem neuen Zwei-Key-Modell.

## Technische Details

- **Key-Format**: `aic_live_` + 32 Zeichen base32 (kollisionssicher, gut erkennbar in Logs).
- **Hashing**: SHA-256 (schnell genug für jeden Ingest-Call, kein bcrypt nötig da hoher Entropie-Input).
- **Rate-Limiting**: unverändert (existiert nicht explizit, kein Scope-Creep).
- **Payload-Validierung**: bei Tenant-Key MUSS jedes `reading.tenant_id === key.tenant_id` sein, sonst 403 mit klarer Fehlermeldung. Bei Worker-Key wie bisher.
- **Backward-Compat**: Der Worker-Key funktioniert unverändert. Bestehende Kundenintegrationen, die noch den alten globalen Key verwenden, würden brechen — daher: Tenants explizit auffordern, in der UI einen neuen Key zu erzeugen, bevor wir den globalen Key aus dem Tenant-UI entfernen. (Cut-over-Zeitfenster als Kommunikation, nicht als Code.)

## Nicht Teil dieses Plans

- Per-Worker-Keys (User hat sich für einen globalen Worker-Key entschieden).
- Automatische Rotation des Worker-Keys (manuell via Super-Admin bleibt).
- OCPP/Simulator-Key-Modell (separates Thema).
