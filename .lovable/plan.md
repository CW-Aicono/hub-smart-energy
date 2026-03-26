
## Analyse-Ergebnis (aus Logs + Code + Endpoint-Checks)

1. In den Backend-HTTP-Logs gibt es **keinen einzigen POST** auf `gateway-ingest` für Schneider (`action=schneider-push`).
2. Der korrekte Endpoint (`https://xnveugycurplszevdxtw.supabase.co/functions/v1/gateway-ingest?...`) antwortet erreichbar mit `{"error":"Unauthorized"}` (erwartbar ohne gültige Auth).
3. Der App-/Published-Domain-Pfad (`https://hub-smart-energy.lovable.app/functions/v1/gateway-ingest?...`) liefert **404 Website-Seite** statt Function.
4. Damit ist der wahrscheinlichste Root Cause: **Panel Server sendet nicht gegen den echten Backend-Host** (oder mit falschem Pfadformat), daher kommt der Push gar nicht in `gateway-ingest` an.

## Strategie

### Phase 1 – Sofortige Betriebs-Validierung (ohne Code)
- Im Schneider Panel Server prüfen/korrigieren:
  - **Server:** `xnveugycurplszevdxtw.supabase.co`
  - **Port:** `443`
  - **Pfad:** `/functions/v1/gateway-ingest?action=schneider-push&tenant_id=0ce0c43a-c0b4-417b-9fd5-4131907e7504`
  - **Auth-Methode:** ID/Basis-Auth mit `SecurityAdmin` / `Esb2024`
- Ziel: Es muss danach ein POST im `gateway-ingest`-Traffic erscheinen.

### Phase 2 – Robuster machen (Code-Hardening)
1. **`src/components/integrations/SchneiderSetupInfo.tsx`**
   - Zusätzlich zum Server/Port/Pfad eine kopierbare Zeile **„Vollständige URL“** anzeigen.
   - Klarer Warnhinweis: „Nicht die App-Domain (`hub-smart-energy.lovable.app`) verwenden.“
   - Tenant-ID direkt aus der Integration/Location-Datenquelle ableiten (nicht nur aus `useTenant`-Fallback), damit nie `<tenant_id>` kopiert wird.

2. **`supabase/functions/gateway-ingest/index.ts`**
   - Basic-Auth-Parsing robuster:
     - Schema case-insensitive (`basic`, `Basic`, etc.)
     - Base64-Decode in `try/catch`
     - `trim()` auf Username/Passwort
   - Bei Auth-Fehlern `WWW-Authenticate: Basic realm="Schneider"` zurückgeben (bessere Geräte-Kompatibilität).
   - Tenant-Scoping für Credential-Lookup über **Location-Zuordnung** absichern (tenant über `locations`), nicht nur indirekt über Integrationsfilter.
   - Fallback-Handling: Wenn POST mit Basic-Auth und `tenant_id`, aber `action` fehlt/abweicht, auf Schneider-Handler routen (toleranter gegenüber Geräte-Eigenheiten).

3. **`supabase/functions/gateway-ingest/index.test.ts`**
   - Neue Tests für:
     - Basic-Auth happy path
     - falsche Credentials
     - lowercase auth scheme
     - fehlendes/ungültiges base64
     - falscher Host kann nicht getestet werden, aber fehlendes `action`-Fallback kann getestet werden.

### Phase 3 – Nachweis & Abnahme
- Erfolg gilt erst, wenn:
  1. `gateway-ingest` POST-Calls in Logs sichtbar sind,
  2. keine 401 mehr für Schneider-Push auftreten,
  3. `meter_power_readings` Einträge mit korrekter `tenant_id` entstehen,
  4. optional `device_mapping`-Skips separat im Response/Log nachvollziehbar sind (nicht als Auth-Fehler).

## Technische Details

```text
Wahrscheinliche Fehlerkette:
Schneider Panel -> falscher Host (App-Domain) oder falsches Pfadformat
-> Request landet nicht bei gateway-ingest
-> Gerät meldet generisch "Authentifizierung HTTPS fehlgeschlagen"

Soll-Ziel:
Schneider Panel -> xnveugycurplszevdxtw.supabase.co:443/functions/v1/gateway-ingest?action=schneider-push&tenant_id=...
-> gateway-ingest verarbeitet Basic Auth
-> Messwerte werden gespeichert
```

## Geplante Dateien für Umsetzung
1. `src/components/integrations/SchneiderSetupInfo.tsx`
2. `supabase/functions/gateway-ingest/index.ts`
3. `supabase/functions/gateway-ingest/index.test.ts`
