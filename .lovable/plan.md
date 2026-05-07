## Befund

Seit 09:47 UTC (≈ 11:47 Uhr DE) schlagen alle periodischen Syncs für Loxone und Shelly mit `"Ungültiges Token"` fehl (DB: 320× loxone, 164× shelly innerhalb der letzten 1,5 h, kontinuierlich alle ~1 min). Daher kommen seit 12:00 keine neuen Werte mehr in `meter_power_readings_5min` (letzter Bucket: gestern 23:55 UTC).

Die Standorte werden trotzdem als „Online" angezeigt, weil dieser Status anhand des **letzten erfolgreichen Heartbeats des Loxone Miniservers / der Shelly Cloud** ermittelt wird – nicht anhand erfolgreicher Cloud-Syncs. Der Miniserver ist also von außen ansprechbar, aber unsere Edge Function lehnt die periodische Anfrage ab, bevor sie ihn überhaupt kontaktiert.

### Root Cause

`loxone-periodic-sync` und `shelly-periodic-sync` rufen die jeweilige API-Edge-Function mit `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` auf. Die API-Funktionen erkennen Server-to-Server-Calls per **Strict-String-Equality**:

```ts
const isServiceRole = token === supabaseServiceKey;
```

Wenn Supabase den Service-Role-Schlüssel rotiert oder das neue API-Key-System (legacy `eyJ…` JWT vs. neues `sb_secret_…`) aktiviert, kann der von `periodic-sync` gesendete Wert nicht mehr exakt mit dem in `loxone-api` gelesenen Wert übereinstimmen (z. B. weil eine Funktion auf einen älteren Cache/Deployment-Snapshot zugreift oder zwei verschiedene Schlüssel im Umlauf sind). Folge: Fall durchfällt in den User-JWT-Pfad → `auth.getUser(serviceToken)` → 401 „Ungültiges Token".

Dieselbe brüchige Prüfung steckt vermutlich in **mehreren** Adapter-Functions (loxone, shelly, abb, siemens, brighthub, tuya, homematic, omada – alle teilen das Muster aus dem `rg`-Fund).

## Lösung

Die Service-Role-Erkennung robust machen, statt auf Byte-Gleichheit zu verlassen.

### Änderungen in `supabase/functions/loxone-api/index.ts` und `supabase/functions/shelly-api/index.ts`

Ersetze die String-Equality durch eine Erkennung anhand der JWT-Payload `role === "service_role"` mit Equality als Fallback:

```ts
function isServiceRoleToken(token: string, serviceKey: string): boolean {
  if (token === serviceKey) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}
```

Damit greift der Server-to-Server-Pfad zuverlässig, unabhängig von Key-Rotation oder unterschiedlichen Snapshots. User-JWTs (`role: "authenticated"`) gehen weiterhin in den `auth.getUser`-Pfad.

### Zusätzlich

- Im Loxone- und Shelly-Sync-Logger die HTTP-Statuscode des `loxone-api`/`shelly-api`-Aufrufs mitloggen, damit künftige 401er sofort als Auth-Problem erkennbar sind (statt als generischer „Sync failed").
- Aktuell offene `integration_errors` mit `error_message = 'Ungültiges Token'` automatisch als resolved markieren, sobald wieder ein erfolgreicher Sync läuft (greift bereits, da `error_type = 'connection'` vom bestehenden Auto-Resolve abgedeckt ist – keine Codeänderung nötig).

### Optional, falls Zeit

Dasselbe Pattern in den anderen betroffenen Adapter-Functions (`abb-api`, `siemens-api`, `brighthub-sync`, `tuya-api`, `homematic-api`, `omada-api`) prophylaktisch fixen, damit diese nicht beim nächsten Key-Rotate dasselbe Problem haben.

## Test

1. Nach Deploy: `supabase--curl_edge_functions` mit Service-Token gegen `loxone-api` aufrufen → muss `success: true` liefern.
2. `loxone-periodic-sync` manuell triggern → Edge-Logs sollen wieder „Successfully synced integration …" zeigen.
3. Neue Buckets in `meter_power_readings_5min` prüfen.

## Hinweis zum „Online"-Badge

Das ist korrekt – der Miniserver ist tatsächlich erreichbar. Der Badge spiegelt Geräteerreichbarkeit, nicht Datensync-Erfolg. Falls gewünscht, kann ich in einem Folgeschritt den Standort-Badge so erweitern, dass er bei `> 30 min` ohne erfolgreichen Sync auf „Sync-Fehler" (gelb) wechselt – sag Bescheid.
