
## Problem: Eine Zeile wurde versehentlich gelöscht

Beim letzten Edit wurde in `pollLoxone()` die Zeile:
```typescript
const ll = data?.LL;
```
gelöscht — aber alle 5 Stellen weiter unten, die `ll` verwenden, blieben erhalten. Das ergibt den Fehler `Cannot find name 'll'`.

### Lösung: Eine Zeile wiederherstellen

In `docs/gateway-worker/index.ts`, Zeile 184, direkt nach `const data = await response.json() as any;` wird die fehlende Zeile wieder eingefügt:

```typescript
const data = await response.json() as any;
const ll = data?.LL;   // ← diese Zeile wird wiederhergestellt
if (!ll) return null;
```

Das ist die einzige Änderung. Danach:

### Schritt-für-Schritt auf dem Raspberry Pi

**Schritt 1 — Alten Container stoppen:**
```bash
docker stop gateway-worker 2>/dev/null; docker rm gateway-worker 2>/dev/null
```

**Schritt 2 — index.ts aktualisieren:**
```bash
rm ~/gateway-worker/index.ts
nano ~/gateway-worker/index.ts
```
Inhalt aus Lovable (`docs/gateway-worker/index.ts`) komplett markieren (Strg+A), kopieren (Strg+C), in nano einfügen, dann: **Strg+X → Y → Enter**

**Schritt 3 — Docker-Image neu bauen:**
```bash
cd ~/gateway-worker && docker build -t gateway-worker .
```
Muss ohne Fehler durchlaufen.

**Schritt 4 — Container starten:**
```bash
docker run -d --name gateway-worker --restart unless-stopped \
  -e SUPABASE_URL="https://xnveugycurplszevdxtw.supabase.co" \
  -e GATEWAY_API_KEY="sk_live_odclyxINkLa0XcHuIXbeeNw44lwzzDHp" \
  -e POLL_INTERVAL_MS=30000 \
  gateway-worker
```

**Schritt 5 — Logs prüfen:**
```bash
docker logs gateway-worker
```

Erwartetes Ergebnis:
```
[INFO] Gateway Worker starting...
[INFO]   Supabase URL: https://xnveugycurplszevdxtw.supabase.co
[INFO]   Poll interval: 30000ms
[INFO] ── Poll cycle started ──
[INFO] Found X active meters with gateway assignments
```

Das war der letzte Fehler. `tsconfig.json` ist bereits korrekt (`strict: false`), alle anderen `as any` Casts sind bereits drin — nur diese eine Zeile fehlt.
