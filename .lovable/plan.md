

## Siemens Sentron Powercenter 3000 – Gateway-Integration

### Recherche-Ergebnis

Der Powercenter 3000 bietet eine **lokale REST API** (kein Cloud-Service):
- `GET /api/v1/items/{deviceId}/values` — aktuelle Messwerte
- `GET /api/v1/items/{deviceId}/archives/{1|2}/_?internal_name=...&start_time=...&end_time=...&format=json` — historische Daten (10s oder 15min Intervalle)
- Keine Authentifizierung (OAuth blockiert den API-Zugang, wenn aktiviert)
- Das Gerät muss über eine externe URL erreichbar sein (Reverse Proxy, VPN, o.ä.) — genau wie Home Assistant

### Integrationsstrategie

Neue Edge Function `sentron-poc3000-api`, die:
1. Die aktuelle Werte aller konfigurierten Geräte vom Powercenter 3000 abruft
2. Die relevanten Power-Werte (W) extrahiert und als `meter_power_readings` speichert

### Änderungen

**1. `src/lib/gatewayRegistry.ts`** — Neuer Gateway-Typ `sentron_powercenter_3000`:
- `api_url` (URL, required) — Externe URL des Powercenter 3000 (z.B. `https://poc3000.meingebaeude.de`)
- `device_ids` (Text, required) — Kommagetrennte Device-UUIDs aus dem Powercenter (aus der Web-Oberfläche kopierbar)
- `poll_interval` (Text, optional) — Abrufintervall in Sekunden (Standard: 60)

**2. `supabase/functions/sentron-poc3000-api/index.ts`** — Neue Edge Function:
- Ruft `/api/v1/items/{deviceId}/values` für jede konfigurierte Device-ID ab
- Filtert nach Power-Werten (W) mit Aggregation1 (10s-Werte)
- Schreibt die Werte als `meter_power_readings` in die Datenbank
- Unterstützt `action=sync` (aktuelle Werte) und `action=discover` (Geräteliste abrufen)

**3. `supabase/config.toml`** — Eintrag für `sentron-poc3000-api`

**4. `src/lib/__tests__/gatewayRegistry.test.ts`** — Tests für den neuen Gateway-Typ

### Dateien
1. `src/lib/gatewayRegistry.ts` — 1 neuer Gateway-Typ
2. `supabase/functions/sentron-poc3000-api/index.ts` — Neue Edge Function
3. `supabase/config.toml` — Config-Eintrag
4. `src/lib/__tests__/gatewayRegistry.test.ts` — Tests erweitern

