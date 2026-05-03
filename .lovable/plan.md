## Root Cause (bestätigt)

Loxone hat seinen Cloud-DNS-Service zwischen 20:25 und 20:30 Uhr auf eine neue Infrastruktur migriert:

| | Alt (kaputt) | Neu (funktioniert) |
|---|---|---|
| Host | `http://dns.loxonecloud.com/{Serial}` | `https://connect.loxonecloud.com/{Serial}` |
| Antwort | `404 Not Found` (Traefik-Default-Cert) | `307` → `https://{ip-encoded}.{Serial}.dyndns.loxonecloud.com:22809/` |
| Proxy | – | `x-proxied-by: loxone-lcs-proxy/0.0.1` |
| Rate-Limit | – | 10 req/min pro IP (Header `x-ratelimit-*`) |

Loxone Config und die Smart-Home-App nutzen seit Jahren intern bereits `connect.loxonecloud.com` (Loxone Remote Connect). Unsere Edge Function hing am Legacy-Endpunkt fest.

## Fix-Plan

### 1. `loxone-api/index.ts` – Resolver tauschen (Kern-Fix)
- `resolveLoxoneCloudURL()` ruft jetzt **`https://connect.loxonecloud.com/{Serial}`** auf, mit `redirect: "manual"` um den Location-Header sauber zu lesen.
- Antwort-Code 307 → `Location`-Header parsen → `https://{host}:{port}` als `baseUrl` zurückgeben.
- Inklusive Port (22809) – nicht im alten Resolver berücksichtigt.
- Result wird **15 min** in einem Modul-Cache (`Map<serial, {url, expires}>`) gehalten, damit wir das 10-req/min-Limit nie reißen.
- Fallback: wenn `connect.loxonecloud.com` einmal 5xx liefert, einmal alten Endpunkt versuchen, dann sauber abbrechen.

### 2. `LoxoneConfigDialog.tsx` – optionales lokales Override
- Neues Feld `config.local_host` (z. B. `http://192.168.178.50`).
- Wenn gesetzt → bypass Cloud komplett, direkt lokal verbinden.
- Hilfetext: „Nur ausfüllen, wenn der AICONO-Hub im selben LAN steht."

### 3. Error-Throttling (DB-Schutz)
- In `loxone-api` und `loxone-periodic-sync`: vor `insert into integration_errors` prüfen, ob in den letzten 5 min ein offener Fehler mit gleichem `error_code` + `location_integration_id` existiert.
- Wenn ja → nur `last_seen_at` und `occurrence_count` updaten.
- Verhindert die DB-Flut, die wir ab 20:30 hatten (5 Integrations × Sync alle 60 s).

### 4. Resilienz im UI
- `useLoxoneSensors`: bei Fehler den letzten Snapshot weiter anzeigen statt leer (ist heute schon teilweise so – ergänzen für `MiniserverStatus`).

## Reihenfolge der Umsetzung

1. **Sofort (Kern-Fix):** Punkt 1 + 3 → 1 Edge-Function-Deploy, Daten fließen wieder.
2. **Direkt danach:** Punkt 2 + 4 → UI-Polish und langfristige Resilienz.
3. **Nicht nötig:** Token-Auth (alter Plan) – mit funktionierender Cloud-URL bleibt Basic Auth gültig.

Schätzung: 1 Iteration, Daten fließen innerhalb 1 Sync-Zyklus (60 s) nach Deploy wieder.

Bestätige mit „Ok" und ich setze 1–4 in einem Rutsch um.