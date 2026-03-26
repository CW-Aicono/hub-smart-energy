

## Fix: Case-insensitive RFID-Tag-Validierung

### Problem
Die RFID-Validierung in der `ocpp-central` Edge Function verwendet einen exakten, case-sensitiven Vergleich (`.eq("rfid_tag", idTag)`). Bender/Nidec Controller senden die Tag-ID möglicherweise in Kleinbuchstaben (`345230cf`), während sie in der Datenbank in Großbuchstaben gespeichert ist (`345230CF`) — oder umgekehrt.

### Lösung

**Datei: `supabase/functions/ocpp-central/index.ts`**

An allen Stellen, wo `rfid_tag` abgefragt wird, `.ilike()` statt `.eq()` verwenden:

1. **`validateIdTag`** (Zeile 291-296): `.eq("rfid_tag", idTag)` → `.ilike("rfid_tag", idTag)`
2. **`isUserInAllowedGroups`** — gleiche Änderung, falls dort ebenfalls per `rfid_tag` gesucht wird
3. **`handleStartTransaction`** — gleiche Änderung bei der RFID-Suche

Das ist eine minimale, risikoarme Änderung (3-4 Zeilen), die das Kern-Problem löst.

### Zusätzlich: Debug-Logging
Temporäres Logging des empfangenen `idTag` im Klartext hinzufügen, damit wir in den Edge Function Logs sehen können, was genau der Controller sendet — falls das Problem doch woanders liegt.

### Dateien
- `supabase/functions/ocpp-central/index.ts` — `.eq` → `.ilike` für RFID-Lookups + Debug-Log

