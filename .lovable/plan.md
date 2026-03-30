

## Analyse: "wrong_channel" Fehler bei Shelly Plug S

### Problem
Der Fehler `HTTP 400 – {"isok":false,"errors":{"wrong_channel":"Could not control this relay channel!"}}` tritt auf, weil der Gen-1 Relay-Control-Aufruf (Zeile 215) die Parameter als **Query-String in einem GET-Request** sendet. Die Shelly Cloud API erwartet für `/device/relay/control` jedoch einen **POST-Request**.

Zusätzlich wird der Fehler doppelt geworfen: Zeile 230-232 prüft `controlRes.ok` (false bei HTTP 400) und wirft den Fehler, bevor die eigentliche Shelly-Fehlerbehandlung in Zeile 236 greifen kann.

### Fix

**Datei: `supabase/functions/shelly-api/index.ts`**

1. **Gen-1 Relay-Control auf POST umstellen** (Zeile 213-215):
   - Statt GET mit Query-Parametern → POST mit JSON-Body oder Form-Data
   - Alle Parameter (`auth_key`, `id`, `channel`, `turn`) im POST-Body senden

2. **Fehlerbehandlung vereinheitlichen** (Zeile 230-238):
   - Bei HTTP 400 nicht sofort `throw`, sondern Response-Body parsen und die Shelly-Fehlermeldung aus `errors` ausgeben

### Technische Details

```typescript
// Vorher (GET – funktioniert nicht):
controlRes = await fetch(`${baseUrl}/device/relay/control?auth_key=...&id=...&channel=0&turn=on`);

// Nachher (POST):
controlRes = await fetch(`${baseUrl}/device/relay/control`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    auth_key: config.auth_key,
    id: deviceId,
    channel: String(channel),
    turn: turnOn ? "on" : "off",
  }),
});
```

Gleiche Korrektur für den Toggle-Status-Abruf (`/device/status`) in Zeile 199, der ebenfalls POST sein sollte.

