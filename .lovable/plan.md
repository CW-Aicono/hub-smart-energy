
## Problem: Auth Code 400 — Falsches Authentifizierungsprotokoll

Der Miniserver läuft auf Config 10.x und erwartet das **JWT-Token-basierte Auth-Protokoll** (eingeführt in Config 9.0, ab 9.3 Pflicht). Der aktuelle Code im Gateway Worker nutzt das alte, seit Config 9.3 entfernte `jdev/sys/getkey` + HMAC-SHA1-Passwort-Verfahren.

**Was die Miniserver-Dokumentation vorschreibt (ab Config 10.2):**

```text
Schritt 1: AES-Session-Key einrichten (Verschlüsselung)
  GET jdev/sys/getPublicKey → RSA Public Key (X.509)
  Generate AES-256 Key + IV (random)
  RSA-encrypt "{aesKey}:{iv}" → encrypted-session-key (Base64)
  SEND jdev/sys/keyexchange/{encrypted-session-key}

Schritt 2: Token anfordern (verschlüsselt)
  GET jdev/sys/getkey2/{user} → { key, salt }
  pwHash = SHA1("{password}:{salt}").toUpperCase()
  hash = HMAC-SHA1("{user}:{pwHash}", key) (hex, unchanged case)
  SEND (encrypted) jdev/sys/getjwt/{hash}/{user}/4/{clientUUID}/GatewayWorker
  → Antwort enthält { token, validUntil }

Schritt 3: Mit Token authentifizieren
  tokenHash = HMAC-SHA1(token, key_from_new_getkey).hex
  SEND (encrypted) authwithtoken/{tokenHash}/{user}
  → Code 200 = erfolgreich authentifiziert
```

Das ist erheblich komplexer als das alte Verfahren, weil alle sensiblen Commands (getjwt, authwithtoken) per AES256 verschlüsselt über den WebSocket gesendet werden müssen.

## Was zu ändern ist

**Einzige Datei:** `docs/gateway-worker/index.ts`

Die `loxoneWsAuth`-Funktion (Zeilen 209–263) wird durch eine vollständige JWT-basierte Auth-Implementierung ersetzt:

### 1. RSA Key Exchange (Verbindungsaufbau)

```typescript
// HTTP-Request: jdev/sys/getPublicKey
// → X.509 RSA Public Key
// AES-256 Key + IV (32 + 16 Byte) generieren
// RSA-OAEP encrypt("{aesKey}:{iv}", publicKey) → session key
// WebSocket: jdev/sys/keyexchange/{base64(sessionKey)}
```

Node.js `crypto`-Modul unterstützt RSA-OAEP nativ — keine neue Abhängigkeit nötig.

### 2. Passwort-Hashing (getkey2)

```typescript
// jdev/sys/getkey2/{user} → { key, salt }
// pwHash = crypto.createHash("sha1").update(`${password}:${salt}`).digest("hex").toUpperCase()
// hash = crypto.createHmac("sha1", key).update(`${user}:${pwHash}`).digest("hex")
```

### 3. Token-Anforderung (verschlüsselt)

```typescript
// Command: jdev/sys/getjwt/{hash}/{user}/4/{uuid}/GatewayWorker
// Vor dem Senden: AES-256-CBC-encrypt mit Session-Key
// Senden als: jdev/sys/enc/{base64url(cipher)}
// Antwort: { token, validUntil } — ebenfalls AES-verschlüsselt zurück
```

### 4. Token-Authentifizierung (verschlüsselt)

```typescript
// Neuen getkey holen für tokenHash
// tokenHash = HMAC-SHA1(token, key)
// Encrypted send: authwithtoken/{tokenHash}/{user}
// Code 200 → authentifiziert
```

### 5. Token-Persistenz (im Speicher)

Tokens haben eine Lebensdauer von ~4 Wochen (App-Permission = 4). Der Worker speichert das Token pro Miniserver im State und verwendet es für folgende Verbindungen (nach Reconnects), ohne es jedes Mal neu anzufordern. Erst wenn `validUntil` abgelaufen ist, wird ein neues Token angefragt.

### 6. Keepalive-Mechanismus

Die Dokumentation schreibt vor: Bei keinem Command für >5 Minuten schließt der Miniserver die Verbindung. Ein `setInterval` sendet alle 4 Minuten `keepalive` — der Miniserver antwortet mit Header-Byte 0x06.

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `docs/gateway-worker/index.ts` | `loxoneWsAuth()` komplett ersetzen durch JWT-Token-Flow (RSA Key Exchange + AES Encryption + Token Persistenz + Keepalive) |

Keine anderen Dateien werden berührt — Flush-Logik, Reconnect-Logik, HTTP-Polling-Fallback und alle anderen Gateway-Typen bleiben unverändert.

## Technische Details zur AES-Verschlüsselung

Laut Dokumentation:
- AES-256-CBC
- Zero-Byte-Padding
- Base64 (NoWrap) — d.h. ohne `\n`-Umbrüche

In Node.js:
```typescript
const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, aesIv);
cipher.setAutoPadding(false);
// payload: "salt/{salt}/{cmd}" → padded to 16-byte block size mit Nullbytes
```

## Deployment nach der Änderung

Identische Schritte wie bisher — nur `index.ts` aktualisieren:

```bash
docker stop gateway-worker && docker rm gateway-worker
nano ~/gateway-worker/index.ts  # neuen Inhalt einfügen
docker build -t gateway-worker .
docker run -d --name gateway-worker --restart unless-stopped \
  -e SUPABASE_URL="https://xnveugycurplszevdxtw.supabase.co" \
  -e GATEWAY_API_KEY="sk_live_odclyxINkLa0XcHuIXbeeNw44lwzzDHp" \
  -e FLUSH_INTERVAL_MS=1000 \
  gateway-worker
```

**Erwartete Logs nach dem Fix:**
```
[INFO] [Loxone] Key exchange successful: 504F94D107EE
[INFO] [Loxone] Token acquired: 504F94D107EE (valid until: 2026-03-19)
[INFO] [Loxone] Authenticated: 504F94D107EE
[INFO] [Loxone] Status updates enabled: 504F94D107EE
[INFO] ✓ Flush: 41 inserted (1001ms)
```

Statt der aktuellen Fehler:
```
[WARN] [Loxone] Auth failed (code 400): ...
[INFO] [Loxone] Reconnecting ... in 1000ms...
```
