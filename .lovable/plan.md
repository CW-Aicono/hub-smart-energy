## Verifizierte Ursache (neu)

Der ursprüngliche Verdacht "Basic-Auth schlägt fehl" war falsch. Was tatsächlich passiert:

**`handleDeviceSnapshot` behandelt das Ergebnis von `validateApiKey` falsch und crasht bei jedem erfolgreichen Auth mit HTTP 502.**

Belege (verifiziert soeben):
- Curl mit korrekten Basic-Auth-Credentials (`aicono` / `Aicono2023!`, `x-gateway-mac: b827eb2b1d07`) → **HTTP 502 Bad Gateway**.
- Function-Logs: `TypeError: First argument to 'respondWith' must be a Response or a promise resolving to a Response` — mehrfach 11:23–11:24 Uhr, exakt getaktet mit den Push-Versuchen des Add-ons.
- Log-Zeile `[device-snapshot] auth failed` ist **irreführend** — sie feuert auch bei erfolgreichem Auth, weil die Bedingung nur die Wahrheit prüft.

Code (`supabase/functions/gateway-ingest/index.ts`, Zeilen 2405–2410):

```ts
async function handleDeviceSnapshot(req: Request): Promise<Response> {
  const authErr = await validateApiKey(req);
  if (authErr) {                    // ❌ falsch
    console.warn("[device-snapshot] auth failed");
    return authErr;                 // gibt bei Erfolg ein GatewayAuthContext-Objekt zurück
  }
  ...
}
```

`validateApiKey` gibt entweder eine `Response` (Fehler) oder ein `GatewayAuthContext` (`{ tenantId }`) zurück. Bei Erfolg ist das Objekt truthy → wird als "Response" zurückgegeben → Deno-Runtime crasht → 502.

Alle anderen Handler in derselben Datei verwenden korrekt den Type-Guard `isAuthError(...)` (siehe z. B. Zeile 549, 649, 830, 952, 1137 …). Nur `handleDeviceSnapshot` wurde bei einem früheren Refactor falsch gemustert.

Warum das WS-Onboarding trotzdem funktioniert: der WebSocket-Kanal (`gateway-ws`) hat einen eigenen Auth-Pfad, ist deshalb "Online" — nur der HTTP-Snapshot-Push schlägt fehl.

Warum bei früheren Test-Gateways alles ging: die früheren Inventory-Einträge (`21afa7b1` = 31 Zeilen etc.) stammen aus einer Version **vor** diesem Bug. Seit dem Refactor wird kein Snapshot mehr erfolgreich verarbeitet — nur alte Zeilen sind noch sichtbar. Das erklärt auch, warum du bei dem neuen Gateway nichts siehst: es hatte noch nie einen erfolgreichen Snapshot.

## Fix (minimal)

`supabase/functions/gateway-ingest/index.ts` Zeilen 2405–2410:

```ts
async function handleDeviceSnapshot(req: Request): Promise<Response> {
  const auth = await validateApiKey(req);
  if (isAuthError(auth)) {
    console.warn("[device-snapshot] auth failed");
    return auth;
  }
  ...
}
```

Ein einziger Handler, ein Type-Guard-Aufruf. Kein weiterer Change nötig — das restliche `handleDeviceSnapshot` funktioniert bereits korrekt (verwendet weiter unten `getSupabase()`, MAC-Lookup und Upsert, alles unverändert).

## Verifikation nach dem Fix

1. Curl `POST /gateway-ingest?action=device-snapshot` (Basic Auth) liefert 200 statt 502.
2. Function-Logs: kein `respondWith`-TypeError mehr; stattdessen `Upserted N device inventory rows`.
3. `SELECT count(*) FROM gateway_device_inventory WHERE gateway_device_id='7d08d320…'` > 0 innerhalb von 2 Min (nächster Add-on-Push-Tick).
4. Dialog „Gefundene Geräte" im Cloud-UI listet Shelly-Plug-S, shellyht-3E4480 etc. auf.

## Was NICHT gemacht wird

- Kein UX-Hinweis im `SensorsDialog` (Problem verschwindet an der Wurzel).
- Kein Add-on-Update — der Add-on-Code ist korrekt.
- Kein Passwort-Reset — Credentials sind bereits richtig gesetzt.
