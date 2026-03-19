

## Fix: RemoteStart "Charge point not found" für Ladepunkt Ost 1

### Ursache

Der Ladepunkt `0311303102122250589` existiert **doppelt** in der Datenbank — einmal im korrekten Tenant (`0ce0c43a...`) und ein zweites Mal als Auto-Registration in einem anderen Tenant (`077f1506...`). 

Die Abfrage in `handleRemoteCommand` verwendet `.single()`, was bei mehreren Treffern fehlschlägt und `null` zurückgibt → "Charge point not found".

### Lösung (2 Schritte)

**1. Daten bereinigen**
- Die doppelte Auto-Registration (Tenant `077f1506...`, ID `27e6536f...`) entfernen

**2. Code absichern gegen künftige Duplikate**

In `supabase/functions/ocpp-central/index.ts`:
- `handleRemoteCommand` → RemoteStartTransaction: Die Charge-Point-Abfrage um einen **Tenant-Filter** erweitern. Der Tenant des aufrufenden Users ist bereits im REST-Handler ermittelt (`profile.tenant_id`) — diesen als Parameter an `handleRemoteCommand` durchreichen und in der Query als `.eq("tenant_id", tenantId)` verwenden.
- Gleiches für RemoteStopTransaction (Session-Join).
- `handleBootNotification` → Auto-Registration: Vor dem `INSERT` prüfen, ob die `ocpp_id` bereits in einem anderen Tenant existiert. Wenn ja, kein Duplikat anlegen.

**3. Unique Constraint (optional, empfohlen)**
- Datenbank-Migration: `CREATE UNIQUE INDEX` auf `charge_points(ocpp_id)` um Duplikate auf DB-Ebene zu verhindern. Alternativ ein Partial Unique Index falls Multi-Tenant-Szenarien mit gleichen OCPP-IDs gewollt sind.

### Betroffene Dateien
- `supabase/functions/ocpp-central/index.ts` — Tenant-Filter in RemoteCommand + Duplikat-Schutz bei Auto-Registration
- Datenbank-Migration — Duplikat entfernen + Unique Index

