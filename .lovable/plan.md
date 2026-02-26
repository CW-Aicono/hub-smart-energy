

# K1: Credential-Verschluesselung fuer brighthub_settings

## Problem
Die Spalten `api_key` und `webhook_secret` in der Tabelle `brighthub_settings` speichern Klartext-Credentials. Laut BSI TR-03181 muessen sensible Daten at-rest verschluesselt sein.

## Loesung: AES-256-GCM via Edge Function

Da Supabase Vault nicht ueber die Standard-API verfuegbar ist, wird die Ver-/Entschluesselung in den Edge Functions implementiert. Die Credentials werden **vor dem Speichern verschluesselt** und **beim Lesen entschluesselt**.

### Architektur

```text
Frontend (BrightHubSettings.tsx)
    |
    v
Edge Function: brighthub-crypto (NEU)
    |  - encrypt(plaintext, key) -> iv:ciphertext:tag (base64)
    |  - decrypt(encrypted, key) -> plaintext
    |  - Key: BRIGHTHUB_ENCRYPTION_KEY (Secret)
    |
    v
brighthub_settings Tabelle (verschluesselter Wert)
```

### Ablauf

1. **Speichern**: Frontend -> `brighthub-crypto?action=save` -> Edge Function verschluesselt api_key + webhook_secret mit AES-256-GCM -> speichert verschluesselten Wert in DB
2. **Laden (Frontend)**: Frontend laedt Settings -> api_key/webhook_secret sind verschluesselt -> werden **nicht** im Klartext ans Frontend gesendet, sondern als maskierter Platzhalter (`****...letzte4`)
3. **Verwenden (Sync)**: `brighthub-sync` und `brighthub-periodic-sync` lesen den verschluesselten Wert, entschluesseln ihn serverseitig mit dem Secret, und verwenden ihn fuer API-Aufrufe

---

## Schritt 1: Neues Secret anlegen

- Name: `BRIGHTHUB_ENCRYPTION_KEY`
- Wert: 32-Byte zufaelliger Hex-String (wird generiert)
- Wird dem Nutzer zur Eingabe vorgelegt

## Schritt 2: Shared Crypto-Modul erstellen

**Neue Datei:** `supabase/functions/_shared/crypto.ts`

- `encrypt(plaintext: string, hexKey: string): string` -- gibt `base64(iv + ciphertext + tag)` zurueck
- `decrypt(encrypted: string, hexKey: string): string` -- entschluesselt
- Verwendet Web Crypto API (in Deno nativ verfuegbar), AES-256-GCM, 12-Byte IV

## Schritt 3: Neue Edge Function `brighthub-crypto`

**Neue Datei:** `supabase/functions/brighthub-crypto/index.ts`

Aktionen:
- `save`: Empfaengt api_key + webhook_secret im Klartext, verschluesselt sie, speichert in DB
- `load`: Liest verschluesselte Werte aus DB, gibt nur maskierte Version ans Frontend zurueck (z.B. `••••••ef3a`)
- `test`: Entschluesselt api_key und fuehrt einen Test-Request gegen BrightHub durch

Auth: JWT-Validierung + Tenant-Pruefung (wie bei brighthub-sync)

## Schritt 4: brighthub-sync und brighthub-periodic-sync anpassen

Beide Functions importieren das Crypto-Modul und entschluesseln `settings.api_key` vor dem API-Aufruf:

```typescript
import { decrypt } from "../_shared/crypto.ts";

const encKey = Deno.env.get("BRIGHTHUB_ENCRYPTION_KEY")!;
const apiKey = decrypt(settings.api_key, encKey);
```

Falls der Wert nicht verschluesselt ist (Legacy-Daten ohne Praefix), wird er direkt verwendet -- so bleibt Abwaertskompatibilitaet erhalten.

## Schritt 5: Frontend anpassen

**Datei:** `src/hooks/useBrightHubSettings.tsx`
- `saveSettings` ruft statt direktem DB-Insert die neue Edge Function `brighthub-crypto?action=save` auf
- `fetchSettings` ruft `brighthub-crypto?action=load` auf, das nur maskierte Keys zurueckgibt
- api_key im Frontend wird nie im Klartext angezeigt (nur bei Neueingabe)

**Datei:** `src/components/settings/BrightHubSettings.tsx`
- Input-Feld fuer api_key zeigt bei bestehenden Settings den maskierten Wert an
- Nur wenn der Nutzer einen neuen Key eingibt, wird dieser gesendet
- Logik: wenn api_key unveraendert (= maskierter Wert), wird er nicht erneut gespeichert

## Schritt 6: Migration bestehender Klartext-Daten

Ein einmaliger Aufruf einer Edge Function (`brighthub-crypto?action=migrate`) verschluesselt alle bestehenden Klartext-api_keys in der DB. Erkennung: Verschluesselte Werte beginnen mit dem Praefix `enc:`, Klartext-Werte nicht.

---

## Zusammenfassung der Dateien

| Aktion | Datei |
|---|---|
| Neu | `supabase/functions/_shared/crypto.ts` |
| Neu | `supabase/functions/brighthub-crypto/index.ts` |
| Aendern | `supabase/functions/brighthub-sync/index.ts` |
| Aendern | `supabase/functions/brighthub-periodic-sync/index.ts` |
| Aendern | `src/hooks/useBrightHubSettings.tsx` |
| Aendern | `src/components/settings/BrightHubSettings.tsx` |
| Config | `supabase/config.toml` (verify_jwt = false fuer brighthub-crypto) |
| Secret | `BRIGHTHUB_ENCRYPTION_KEY` (neues Secret) |

## Abwaertskompatibilitaet

- Werte mit Praefix `enc:` werden als verschluesselt erkannt und entschluesselt
- Werte ohne Praefix werden als Klartext behandelt (Legacy-Support)
- Nach der Migration beginnen alle Werte mit `enc:`

