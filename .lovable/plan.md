# OCPP Live-Daten (Voltage / Current / Power) — Aktivierung, Persistierung, Anzeige, EMS

## Ist-Zustand (geprüft)

- Duosida „Ost 1" sendet nur `Energy.Active.Import.Register` (kWh) alle ~15 min. Keine Voltage/Current/Power.
- Persistent-Server loggt MeterValues bereits in `ocpp_message_log`, parst aber nichts strukturiert.
- `pending_ocpp_commands` + Dispatcher unterstützen `ChangeConfiguration` bereits. `GetConfiguration` fehlt noch.
- `charge_points` hat schon `supports_change_configuration` und `supports_charging_profile`.

## OCPP-Standardisierung — wichtig

`MeterValuesSampledData`, `MeterValueSampleInterval`, `MeterValuesAlignedData`, `ClockAlignedDataInterval` sowie die Measurand-Namen sind **OCPP-1.6-Standard**. Funktioniert mit ABL/Bender, Alfen, KEBA, go-e, Wallbe, Mennekes, etc.

ABER: Was eine Wallbox tatsächlich liefern kann, variiert. Daher: **Capability Discovery vor Konfiguration**. Per `GetConfiguration` ermitteln, was die Wallbox kennt, und nur unterstützte Measurands aktivieren. Modelle wie die Duosida liefern oft nur Energy.

## Plan

### Schritt 1 — Datenbank
- Neue Tabelle `ocpp_meter_samples` (charge_point_id, connector_id, transaction_id, measurand, phase, unit, value, context, sampled_at, created_at) + RLS pro tenant, Realtime an.
- Neue Tabelle `charge_point_capabilities` (charge_point_id PK, supported_measurands text[], max_sample_length int, min_sample_interval int, raw_config jsonb, last_probed_at).
- `pending_ocpp_commands` bekommt zusätzlichen Command-Typ `GetConfiguration` im Dispatcher (kein Schema-Change nötig).

### Schritt 2 — Hetzner OCPP-Server-Update
- `ocppHandler.ts`: MeterValues parsen → pro `sampledValue` einen Eintrag in `ocpp_meter_samples` via neuem Backend-Endpoint `insert-meter-sample`. Bei `Power.Active.Import` zusätzlich Forward in `meter_power_readings` wenn der CP mit einem Meter verknüpft ist.
- `commandDispatcher.ts`: `GetConfiguration` ergänzen. Bei Response → Capabilities in `charge_point_capabilities` upserten.
- `backendApi.ts`: Endpoints `insert-meter-sample`, `upsert-capabilities`.
- Edge Function `ocpp-persistent-api`: neue Actions ergänzen.

### Schritt 3 — UI (Ladepunkt-Detail)
- Button „Messgrößen prüfen" → triggert `GetConfiguration` → zeigt unterstützte Measurands.
- Button „Live-Daten aktivieren" → triggert `ChangeConfiguration` mit Schnittmenge aus Wunsch-Profil und Capabilities. Fallback-Kaskade bei Rejected.
- Live-Panel: Power (kW), Voltage (V), Current (A) je Phase, kWh, letzter Sample. Realtime via `ocpp_meter_samples`.

### Schritt 4 — EMS-Integration
- Optionale CP → Meter Zuordnung in `charge_points` (neue Spalte `linked_meter_id uuid`). Persistent-Server schiebt Power.Active.Import als `meter_power_readings`. Damit erscheint Wallbox in Energy-Flow, Charts, Automationen.

## Umsetzungsreihenfolge
1. Migration (Tabellen + linked_meter_id) — **dieser Commit**
2. Edge Function ocpp-persistent-api: neue Actions
3. Hetzner-Server: MeterValues-Parser + GetConfiguration-Dispatcher + Capability-Upsert
4. UI Ladepunkt-Detail
5. EMS-Forward

OCPP 2.0.1 bleibt out-of-scope, Tabellen sind protokoll-neutral.
