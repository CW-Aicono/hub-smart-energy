
## Problem

In `pollLoxone()` (Zeile 165–168) wird bei jedem der 41 Meter ein separater DNS-Request gemacht:

```
http://dns.loxonecloud.com/{serial_number}
```

Da alle 41 Meter am selben Miniserver hängen, passiert das **41 Mal gleichzeitig** (Promise.allSettled). Der Loxone Cloud-DNS blockt diese parallelen Anfragen → alle 41 schlagen fehl. 30 Sekunden später: Limit zurückgesetzt → alle 41 funktionieren. Daher das Wechselmuster ✓ ✗ ✓ ✗.

Da die IP des Miniservers **fest** ist (ändert sich nur bei Hardware-Austausch), reicht ein **permanenter In-Memory-Cache** — kein TTL nötig. Die IP wird genau einmal beim ersten Start aufgelöst, danach nie wieder.

---

## Technische Änderung in `docs/gateway-worker/index.ts`

### 1. Permanenter DNS-Cache (nach Zeile 115, nach `isSpike`)

```typescript
// Permanenter DNS-Cache: serial_number → baseUrl
// IP ändert sich nur bei Hardware-Austausch → kein TTL nötig
const loxoneBaseUrlCache = new Map<string, string>();
```

### 2. Hilfsfunktion `resolveLoxoneBaseUrl()` (vor `pollLoxone`)

```typescript
async function resolveLoxoneBaseUrl(serialNumber: string): Promise<string | null> {
  // Cache-Hit: sofort zurückgeben (kein Netzwerk-Request)
  if (loxoneBaseUrlCache.has(serialNumber)) {
    return loxoneBaseUrlCache.get(serialNumber)!;
  }
  // Einmaliger DNS-Lookup
  try {
    const dnsResponse = await fetch(
      `http://dns.loxonecloud.com/${serialNumber}`,
      { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) }
    );
    const urlObj = new URL(dnsResponse.url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    loxoneBaseUrlCache.set(serialNumber, baseUrl);
    log("info", `[Loxone] DNS resolved: ${serialNumber} → ${baseUrl}`);
    return baseUrl;
  } catch (err) {
    log("warn", `[Loxone] DNS lookup failed for ${serialNumber}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
```

### 3. `pollLoxone()` vereinfachen (Zeilen 163–168 ersetzen)

Die 4 DNS-Zeilen werden durch einen einzigen Aufruf ersetzt:

```typescript
// Vorher (4 Zeilen, DNS bei jedem Aufruf):
const dnsUrl = `http://dns.loxonecloud.com/${config.serial_number}`;
const dnsResponse = await fetch(dnsUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
const urlObj = new URL(dnsResponse.url);
const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

// Nachher (1 Zeile, aus Cache):
const baseUrl = await resolveLoxoneBaseUrl(config.serial_number);
if (!baseUrl) return null;
```

---

## Ergebnis

| | Vorher | Nachher |
|---|---|---|
| DNS-Requests pro Zyklus | 41 | 0 (nach erstem Zyklus) |
| DNS-Requests gesamt | unbegrenzt | 1 (einmalig beim Start) |
| Rate-Limit-Problem | jeder 2. Zyklus schlägt fehl | komplett gelöst |

---

## Schritt-für-Schritt auf dem Raspberry Pi

Sobald Lovable die Datei gespeichert hat — diese 5 Befehle der Reihe nach ausführen:

**Schritt 1 — Alten Container stoppen:**
```bash
docker stop gateway-worker && docker rm gateway-worker
```

**Schritt 2 — Alte index.ts löschen:**
```bash
rm ~/gateway-worker/index.ts
```

**Schritt 3 — Neue index.ts aus Lovable kopieren:**
1. In Lovable links auf `docs/gateway-worker/index.ts` klicken
2. Alles markieren: **Strg+A** → Kopieren: **Strg+C**
3. Im Terminal:
```bash
nano ~/gateway-worker/index.ts
```
Einfügen → **Strg+X → Y → Enter**

**Schritt 4 — Docker-Image neu bauen:**
```bash
cd ~/gateway-worker && docker build -t gateway-worker .
```

**Schritt 5 — Container starten und Logs prüfen:**
```bash
docker run -d --name gateway-worker --restart unless-stopped \
  -e SUPABASE_URL="https://xnveugycurplszevdxtw.supabase.co" \
  -e GATEWAY_API_KEY="sk_live_odclyxINkLa0XcHuIXbeeNw44lwzzDHp" \
  -e POLL_INTERVAL_MS=30000 \
  gateway-worker

docker logs gateway-worker
```

**Erwartetes Ergebnis** (beim ersten Zyklus einmalige DNS-Meldung, danach alle Zyklen 41/41):
```
[INFO] [Loxone] DNS resolved: AABBCCDD → http://192.168.x.x
[INFO] ✓ Ingest: 41 inserted, 0 skipped
[INFO] ── Poll cycle done (41/41 readings) ──
[INFO] ── Poll cycle started ──
[INFO] ✓ Ingest: 41 inserted, 0 skipped
[INFO] ── Poll cycle done (41/41 readings) ──
```

Kein einziger `[WARN] fetch failed` mehr — da der DNS ab dem 2. Zyklus überhaupt nicht mehr angefragt wird.
