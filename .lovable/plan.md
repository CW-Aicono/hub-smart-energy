

## Schneider Panel Server – HTTPS Publication Setup-Anweisungen & Credentials

### Was sich ändert

Der Schneider EcoStruxure Panel Server benötigt eine konfigurierte HTTPS-Publikation mit Server-URL, Port, Pfad sowie Benutzername/Passwort. Diese Informationen müssen dem Nutzer nach Anlage der Integration angezeigt werden, und die Credentials müssen bei eingehenden Pushes validiert werden.

### Änderungen

**1. `src/lib/gatewayRegistry.ts`**
- Neue Felder `push_username` und `push_password` zum `schneider_panel_server` Gateway-Typ hinzufügen (required)
- Neues optionales Feld `setupInstructions` zur `GatewayDefinition` Interface hinzufügen (Typ: String-Array oder Objekt mit Server/Port/Pfad-Infos)

**2. `src/components/integrations/IntegrationCard.tsx`**
- Für `schneider_panel_server`-Typ: Setup-Infobox anzeigen mit den Verbindungsinformationen, die im Panel Server konfiguriert werden müssen:
  - **Server**: `xnveugycurplszevdxtw.supabase.co` (aus VITE_SUPABASE_URL)
  - **Port**: `443`
  - **Pfad**: `/functions/v1/gateway-ingest?action=schneider-push&tenant_id=...`
  - **Verbindungsmethode**: ID-Authentifizierung
  - **Benutzername / Passwort**: aus der gespeicherten Config anzeigen
- Die Box wird nur angezeigt, wenn die Integration konfiguriert ist

**3. `supabase/functions/gateway-ingest/index.ts`**
- In `handleSchneiderPush`: Zusätzlich zur bestehenden GATEWAY_API_KEY-Validierung auch Basic-Auth-Credentials aus dem Request-Header prüfen
- Credentials werden gegen die in der `location_integrations.config` gespeicherten `push_username`/`push_password` validiert
- Damit kann der Panel Server sich per Benutzername/Passwort authentifizieren (Standard-HTTPS-Publikation), ohne dass ein API-Key im Gerät hinterlegt werden muss

**4. `src/lib/__tests__/gatewayRegistry.test.ts`**
- Tests für die neuen Felder erweitern

### Technischer Ablauf

```text
Panel Server                    gateway-ingest
    |                                |
    |  POST /gateway-ingest          |
    |  ?action=schneider-push        |
    |  &tenant_id=xxx                |
    |  Authorization: Basic user:pw  |
    |  Body: { measurements: [...] } |
    | -----------------------------> |
    |                                | 1. Parse Basic Auth
    |                                | 2. Lookup location_integration by tenant_id + type
    |                                | 3. Verify username/password vs config
    |                                | 4. Insert readings
    |  <-- { success: true }         |
```

### Dateien
1. `src/lib/gatewayRegistry.ts` – 2 neue Felder + setupInstructions
2. `src/components/integrations/IntegrationCard.tsx` – Setup-Infobox für Schneider
3. `supabase/functions/gateway-ingest/index.ts` – Basic-Auth-Validierung im Schneider-Push-Handler
4. `src/lib/__tests__/gatewayRegistry.test.ts` – Tests anpassen

