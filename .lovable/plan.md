

## Plan – Cloudflare-Domain-Umstellung + Duplikat-Fix

### 1. Datenbank-Cleanup + Unique-Constraint (Migration)

- **Duplikate löschen:** Pro `(tenant_id, device_name)` nur die zuletzt aktive Row behalten (`ORDER BY last_heartbeat_at DESC NULLS LAST, created_at DESC`). Cascade löscht abhängige Metrics automatisch.
- **Unique Index** anlegen: `CREATE UNIQUE INDEX gateway_devices_tenant_device_uq ON gateway_devices(tenant_id, device_name);`
  → Verhindert künftige Duplikate auf DB-Ebene als zweite Verteidigungslinie.

### 2. Edge Function `gateway-ingest` – Upsert statt manueller Existenz-Check

In `handleHeartbeat`:
- Aktuell: `SELECT … maybeSingle()` → bei >1 Row Fehler → Fallback INSERT (= Bug-Quelle)
- Neu: `.upsert(deviceData, { onConflict: 'tenant_id,device_name' })`  
  → Atomar, race-condition-frei, funktioniert auch bei parallelen Heartbeats.

### 3. Edge Function `cf-tunnel-provision` – Domain-Umstellung

- `TUNNEL_DOMAIN = "tunnel.aicono.org"` → **`TUNNEL_DOMAIN = "aicono.org"`**
- Subdomain-Prefix bleibt 12-stellig aus der Tunnel-UUID → `b77488c1-e58.aicono.org`
- Universal SSL von Cloudflare deckt `*.aicono.org` automatisch ab → kein Zusatzcert nötig.
- Eindeutige Zuordnung Gateway ↔ Liegenschaft bleibt durch UUID garantiert.

### 4. Bestehenden Test-Tunnel migrieren

Da nur ein Test-Gateway aktiv ist:
- Alte `location_integrations.config`-Felder (`cloudflare_tunnel_id`, `cloudflare_public_url`, `…token_enc`) auf `NULL` setzen für die betroffene Liegenschaft → triggert Re-Provisioning beim nächsten Klick auf „Tunnel einrichten".
- Alter Tunnel + DNS-Record bleiben in Cloudflare ungenutzt liegen (manuell später aufräumen) – stört nicht.

### 5. Doku-Update

`docs/ha-addon/INSTALLATION.md` + Memory `gateway-worker-installation-guide`: Hinweis ergänzen, dass Public-Hostnames automatisch unter `*.aicono.org` (nicht `*.tunnel.aicono.org`) angelegt werden.

### Reihenfolge der Implementierung
1. Migration: Duplikat-Cleanup + Unique Index
2. `gateway-ingest/index.ts`: Upsert-Refactor
3. `cf-tunnel-provision/index.ts`: TUNNEL_DOMAIN-Konstante ändern
4. SQL-Insert: Test-Liegenschafts-Config zurücksetzen
5. Doku/Memory aktualisieren

### Anschließende Anleitung für den User (nach Implementierung)

Nach dem Deploy bekommst du eine **5-Schritte-Klick-Anleitung** im Chat:
1. Im Browser: alte Gateway-Einträge sind weg, nur eines bleibt sichtbar → Status prüfen
2. Liegenschaft öffnen → Integration „Home Assistant" → **„Tunnel neu einrichten"** klicken
3. Neuen Tunnel-Token kopieren (wird einmalig angezeigt)
4. Im Home Assistant Add-on: Token einfügen → Add-on neu starten
5. Im Browser auf die neue URL `https://<id>.aicono.org` → HA-Login erscheint → fertig

Komplette Schritt-für-Schritt-Anleitung mit Screenshots-Beschreibungen folgt direkt nach Umsetzung.

