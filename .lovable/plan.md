## Problem

Die Wallbox sendet bei `StartTransaction` den idTag **roh** (z. B. `440393FC`). Für `Authorize` wird der Tag im Edge-Endpoint `ocpp-persistent-api` bereits gemäß `rfid_read_mode` der Wallbox normalisiert (z. B. „Hex-Stellen je Byte tauschen" → `443039CF`) und so gegen `charging_users.rfid_tag` gematcht — Freigabe funktioniert.

Bei `create-charging-session` wird der idTag dagegen **unverändert** (`440393FC`) in `charging_sessions.id_tag` geschrieben. Der Resolver `useIdTagResolver` (Map über `rfid_tag`) findet daher in der Ladevorgangs-Übersicht keinen Nutzer und zeigt nur die rohe ID an (Screenshot 2, Zeile „Wallbe West Rechts → 440393FC").

## Ziel

Die in `charging_sessions.id_tag` gespeicherte Tag-ID soll **identisch zu dem Wert sein, mit dem auch autorisiert wurde** — also die normalisierte Form. Damit greift der bestehende Resolver automatisch und der Ladevorgang wird dem richtigen Nutzer zugeordnet (analog zu den anderen Zeilen mit `010 Hartmut Walzel` etc., die per RFID-Label gefunden werden).

## Änderungen

### 1. `supabase/functions/ocpp-persistent-api/index.ts` — Normalisierung in `create-charging-session`

Vor dem Insert dieselbe Logik wie in `authorize-id-tag`:

- `rfid_read_mode` der Wallbox aus `charge_points` laden (Default `raw`).
- `normalizedIdTag = normalizeRfidTag(idTag, readMode)` berechnen.
- In `charging_sessions.id_tag` **`normalizedIdTag`** speichern (statt rohem `idTag`).
- Die Idempotenz-Prüfung (`sameTag`-Vergleich in Zeile 256) ebenfalls auf den normalisierten Wert umstellen, sonst schlagen Retries der Wallbox fehl.
- Konsolen-Log zur Nachvollziehbarkeit: `raw="..." mode="..." normalized="..."`.

### 2. `supabase/functions/ocpp-persistent-api/index.ts` — `update-charging-session` (Stop)

`StopTransaction` läuft heute über `getChargingSessionByTransaction(chargePointPk, transactionId)` — kein idTag-Vergleich nötig. **Keine Änderung erforderlich**, nur kurz verifizieren.

### 3. Bestehende Datensätze (einmaliger Backfill)

Bestehende offene/abgeschlossene Sessions mit rohem idTag bleiben unzugeordnet. Wir korrigieren das per Migration:

- SQL-Migration, die in `public.charging_sessions` für alle Rows der betroffenen Tenants die `id_tag` so umrechnet, wie es `normalizeRfidTag` mit dem `rfid_read_mode` der zugehörigen Wallbox tun würde.
- Implementiert als PL/pgSQL-Funktion `public.normalize_rfid_tag(text, text)` (gleiche Logik wie TS-Util: Whitespace/Trenner entfernen, Uppercase, dann je nach Mode Byte-Reverse und/oder Nibble-Swap; nicht-hex Tags unverändert lassen).
- Update-Statement: `UPDATE charging_sessions cs SET id_tag = normalize_rfid_tag(cs.id_tag, cp.rfid_read_mode) FROM charge_points cp WHERE cs.charge_point_id = cp.id AND cp.rfid_read_mode IS NOT NULL AND cp.rfid_read_mode <> 'raw';`
- Die Hilfsfunktion danach belassen (kann später vom Insert-Pfad mitbenutzt werden, falls nötig).

### 4. Frontend-Resolver (optional, defensiv)

`src/hooks/useChargingSessions.tsx` matcht bereits per `toUpperCase()`. Das ist ausreichend, **sobald** die DB normalisiert speichert. **Keine Logik-Änderung**, nur ein kurzer Test, ob bestehende Tags (z. B. `443039CF`) jetzt aufgelöst werden.

## Nicht im Scope

- Keine Änderungen an `docs/ocpp-persistent-server/src/ocppHandler.ts` — der ruft nur `createChargingSession` über `backendApi.ts → ocpp-persistent-api` auf; die Normalisierung passiert serverseitig im Edge.
- Keine Änderung der UI / Spalten / Übersetzungen.
- Kein Eingriff in `Authorize`-Flow (funktioniert bereits).

## Verifikation

1. Mit `rfid_read_mode = nibble_swap` einen Tag scannen → `charging_sessions.id_tag` enthält den **normalisierten** Wert; ID-Tag-Spalte zeigt den Nutzernamen aus `charging_users`.
2. Migration auf Testdaten: vorhandene Zeile `440393FC` wird zu `443039CF` und matcht dann den User mit RFID-Tag `443039CF`.
3. Doppelte `StartTransaction` (Retry der Wallbox) → wird weiterhin als Duplicate erkannt (sameTag jetzt auf normalisiertem Vergleich).
