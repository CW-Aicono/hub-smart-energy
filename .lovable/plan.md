## Root Cause

`resolveLoxoneHost()` in `docs/loxone-ws-worker/index.ts` (Zeile 249–268) ist zu tolerant:

```ts
const finalUrl = r.url;   // bei fehlgeschlagenem Redirect: "https://dns.loxonecloud.com/504F94A2BAA2"
if (finalUrl && finalUrl.toLowerCase().includes(serial.toLowerCase())) {
  const host = new URL(finalUrl).host;   // → "dns.loxonecloud.com"
  dnsCache.set(serial, host);            // GIFT: falscher Host wird für immer gecacht
}
```

Wenn der 307-Redirect beim ersten Auflösen (z.B. wegen Race beim Registrieren des neuen Miniservers oder undici-Timing) nicht gefolgt wurde, landet `dns.loxonecloud.com` selbst im Cache — der Serial ist ja in der URL enthalten, die Prüfung schlägt fälschlich an. Alle folgenden Verbindungsversuche gehen dann gegen `https://dns.loxonecloud.com/jdev/...` und Loxone antwortet mit HTTP 404 → `[WS] Verbindung fehlgeschlagen ... Error: Request failed with status code 404`.

Log-Beleg des Users: `[WS] verbinde 504F94A2BAA2 → dns.loxonecloud.com` (die anderen zwei zeigen die echte dyndns-Adresse).

Die zwei bereits laufenden Miniserver haben ihren korrekten Host beim allerersten Auflösen bekommen und sind seither zufriedene Cache-Hits — deshalb funktionieren sie.

## Fix im Worker (`docs/loxone-ws-worker/index.ts`)

Zwei kleine, defensive Änderungen — keine Logik-Umstellung, keine anderen Miniserver betroffen:

**1. Strengere Validierung in `resolveLoxoneHost()`** — nur akzeptieren, wenn der aufgelöste **Host** (nicht die ganze URL) etwas anderes ist als `dns.loxonecloud.com` und den Serial enthält:

```ts
const host = new URL(finalUrl).host;
const hostLc = host.toLowerCase();
if (hostLc !== "dns.loxonecloud.com" && hostLc.includes(serial.toLowerCase())) {
  dnsCache.set(serial, host);
  return host;
}
// sonst: nichts cachen, unten Fallback nehmen
```

Fallback (`<serial>.dns.loxonecloud.com`) NICHT dauerhaft cachen — nur zurückgeben, damit der nächste Reconnect erneut versucht, die echte Cloud-Adresse aufzulösen.

**2. Cache invalidieren bei Verbindungsfehlern** — im `catch`-Block von `connect()` (um Zeile 585):

```ts
} catch (err) {
  dnsCache.delete(state.serialNumber);   // zwingt Neu-Auflösung beim nächsten Versuch
  log("warn", `[WS] Verbindung fehlgeschlagen ${state.serialNumber}: ${err}`);
  ...
}
```

## Danach — Copy/Paste für den User

```bash
cd /opt/loxone-ws-worker-live
# neue index.ts wird von Lovable synchronisiert / manuell reingelegt (wie beim CP-Fix zuvor)
docker build -t loxone-ws-worker:latest .
docker rm -f loxone-ws-worker-live
docker run -d --name loxone-ws-worker-live --restart unless-stopped \
  -p 8081:8080 --env-file /opt/loxone-ws-worker-live/.env \
  loxone-ws-worker:latest
docker logs -f loxone-ws-worker-live | grep -E "504F94A2BAA2|DNS|WS"
```

Erwartung: `[DNS] 504F94A2BAA2 → 2a01-4f8-c010-2f7--1.504F94A2BAA2.dyndns.loxonecloud.com:54146` und anschließend `LoxAPP3.json geladen`.

## Warum nicht anders

- User-Credentials sind bestätigt (getkey2 = 200).
- Cloud-Tunnel steht (getPublicKey = 200).
- Es gibt keinen sinnvollen Workaround „im UI" — der Bug sitzt im Worker-Cache. Ein Worker-Restart alleine würde reichen **für diesen einen Miniserver**, aber der Bug tritt bei jedem neu hinzugefügten Miniserver mit ungünstigem Timing wieder auf.

## Umfang

- 1 Datei, ~10 Zeilen Änderung: `docs/loxone-ws-worker/index.ts`
- Keine Änderung an Cloud/Edge-Functions, keine DB-Migration.
