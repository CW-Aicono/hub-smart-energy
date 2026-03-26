

## Schneider Electric EcoStruxure Panel Server – Gateway-Integration

### Ansatz

Es gibt zwei sinnvolle Integrationswege. Ich empfehle, **beide** als Gateway-Typen anzubieten:

---

### Gateway-Typ 1: `schneider_panel_server` (HTTPS Push-Empfang)

Der Panel Server pusht JSON/CSV-Dateien an einen HTTPS-Endpunkt. Wir erweitern die bestehende `gateway-ingest` Edge Function um eine Route, die das Schneider-Publikationsformat entgegennimmt und in `meter_power_readings` schreibt.

**Dateien:**
- `src/lib/gatewayRegistry.ts` – Neuer Gateway-Typ `schneider_panel_server` mit Feldern:
  - `webhook_secret` (Password) – optionaler Shared Secret zur Authentifizierung der eingehenden Pushes
  - `device_mapping` (Text) – optionale Zuordnung Schneider Device-IDs zu Meter-IDs
- `supabase/functions/gateway-ingest/index.ts` – Neue Route `POST ?action=schneider-push` die das Schneider JSON-Format parst (Geräte-Messwerte mit Zeitstempeln) und als Power-Readings einfügt

**Schneider JSON-Format** (vereinfacht):
```json
{
  "header": { "senderId": "PAS800_xxxx", "timestamp": "..." },
  "measurements": [
    {
      "deviceId": "modbus:2",
      "deviceName": "PM5560",
      "values": [
        { "name": "PkWD", "timestamp": "...", "value": 12.5 }
      ]
    }
  ]
}
```

### Gateway-Typ 2: `schneider_cloud` (EcoStruxure Energy Hub API)

Für Kunden, die bereits die Schneider Cloud nutzen. Abruf über OAuth2 Client Credentials.

**Dateien:**
- `src/lib/gatewayRegistry.ts` – Neuer Gateway-Typ `schneider_cloud` mit Feldern:
  - `api_url` (URL) – EcoStruxure API-Endpunkt
  - `client_id` (Text) – OAuth2 Client ID
  - `client_secret` (Password) – OAuth2 Client Secret
  - `site_id` (Text) – Site/Building ID
- `supabase/functions/schneider-api/index.ts` – Neue Edge Function für OAuth2-Token-Abruf und Polling der Energy Hub API
- `supabase/config.toml` – Eintrag für `schneider-api`

### Gateway-Typ 1 zuerst, da:
- Kein Schneider-Cloud-Konto nötig
- Funktioniert mit jedem Panel Server (PAS600, PAS800)
- Nutzt das native HTTPS-Publikationsfeature des Geräts
- Schnellste Time-to-Value für den Kunden

### Zusammenfassung der Änderungen
1. **`src/lib/gatewayRegistry.ts`** – Zwei neue Gateway-Definitionen hinzufügen
2. **`supabase/functions/gateway-ingest/index.ts`** – Schneider-JSON-Parser-Route
3. **`supabase/functions/schneider-api/index.ts`** – Neue Edge Function (Cloud-Variante)
4. **`supabase/config.toml`** – Config für `schneider-api`
5. **`src/lib/__tests__/gatewayRegistry.test.ts`** – Tests für neue Typen erweitern

