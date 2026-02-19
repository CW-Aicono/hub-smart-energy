
## Aktueller Stand

Der Gateway Worker läuft stabil:
- Zyklus 1: DNS wird 41× parallel aufgelöst (einmalig beim Start, da alle Promises gleichzeitig starten)
- Zyklus 2+: 0 DNS-Requests, alle 41 Meter aus dem Cache → 41/41 in ~2 Sekunden

Das ist technisch korrekt, aber der erste Zyklus könnte bei sehr aggressivem Rate-Limiting des Loxone Cloud-DNS trotzdem Probleme machen. Die saubere Lösung: **DNS-Warmup vor dem parallelen Polling**.

## Ursache des Verhaltens im 1. Zyklus

```
Promise.allSettled([poll(m1), poll(m2), ..., poll(m41)])
```

Alle 41 Promises starten gleichzeitig. Jedes prüft den Cache — der ist noch leer. Alle 41 starten einen DNS-Request. Der erste schreibt ins Cache. Aber die anderen 40 haben ihren Request schon abgesendet, bevor der Cache-Eintrag da ist.

## Lösung: Pre-Warmup vor dem parallelen Polling

In `pollCycle()` wird vor dem `Promise.allSettled(...)` ein einmaliger Warmup eingefügt:

```typescript
// Einmalige DNS-Auflösung pro Seriennummer BEVOR paralleles Polling startet
const uniqueSerialNumbers = new Set(
  meters
    .map(m => (m.location_integration?.config as any)?.serial_number as string | undefined)
    .filter(Boolean)
);
for (const serial of uniqueSerialNumbers) {
  await resolveLoxoneBaseUrl(serial!);
}
```

Dieser sequentielle Warmup:
1. Sammelt alle eindeutigen Seriennummern (hier: 3 Stück — `504F94D107EE`, `504F94A2BAA2`, `504F94A22D9C`)
2. Löst sie **der Reihe nach** auf (nicht parallel) → genau 3 DNS-Requests
3. Füllt den Cache
4. Erst dann startet `Promise.allSettled(...)` → alle 41 treffen auf vollen Cache

## Ergebnis

| | Aktuell | Nach Fix |
|---|---|---|
| DNS-Requests Zyklus 1 | 41 | **3** (eine pro Miniserver) |
| DNS-Requests ab Zyklus 2 | 0 | 0 |
| Rate-Limit-Risiko | gering (funktioniert) | **null** |

## Technische Änderung

Einzige Datei: `docs/gateway-worker/index.ts`

In der Funktion `pollCycle()`, direkt nach `log("info", `Found ${meters.length} active meters...`)` und **vor** dem `Promise.allSettled(...)`:

```typescript
// DNS-Warmup: alle Seriennummern sequenziell auflösen, bevor paralleles Polling startet
const uniqueSerials = [...new Set(
  meters
    .map(m => (m.location_integration?.config as any)?.serial_number as string | undefined)
    .filter(Boolean) as string[]
)];
for (const serial of uniqueSerials) {
  await resolveLoxoneBaseUrl(serial);
}
log("info", `DNS cache warmed for ${uniqueSerials.length} Miniserver(s)`);
```

Keine anderen Änderungen nötig.

## Schritt-für-Schritt auf dem Raspberry Pi

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

**Erwartetes Ergebnis** (ab sofort auch der 1. Zyklus nur noch 3 DNS-Requests):
```
[INFO] ── Poll cycle started ──
[INFO] Found 41 active meters with gateway assignments
[INFO] [Loxone] DNS resolved: 504F94D107EE → https://...
[INFO] [Loxone] DNS resolved: 504F94A2BAA2 → https://...
[INFO] [Loxone] DNS resolved: 504F94A22D9C → https://...
[INFO] DNS cache warmed for 3 Miniserver(s)
[INFO] ✓ Ingest: 41 inserted, 0 skipped
[INFO] ── Poll cycle done in Xms (41/41 readings) ──
[INFO] ── Poll cycle started ──
[INFO] ✓ Ingest: 41 inserted, 0 skipped
[INFO] ── Poll cycle done in Xms (41/41 readings) ──
```

Genau 3 DNS-Lookups im gesamten Leben des Prozesses — danach nie wieder.
