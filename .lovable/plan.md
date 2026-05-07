## Phase 5: Modbus-TCP-Wallbox-Bridge mit Hersteller-Templates

Ziel: Gateway als Modbus↔OCPP-Bridge — pro Wallbox eine eigene OCPP-1.6J-Client-Verbindung zum bestehenden `ocpp-ws`-Backend. Hersteller-Templates werden zentral gepflegt und ans Gateway gepusht.

### Architektur

```text
Wallbox (Modbus TCP)
   ↑↓  Polling (2-5s status/power, 30s energy)
Gateway (HA-Addon)
   - lädt wallbox_modbus_templates per gateway-ws
   - ModbusWallboxBridge je Instanz
   - hält pro Wallbox einen OCPP-1.6J WS-Client
   ↑↓  WebSocket (OCPP 1.6J)
ocpp-ws (Cloud) → bestehende EV-Pipeline
```

### 1. Datenbank-Migration

**`wallbox_modbus_templates`** (Super-Admin, `tenant_id IS NULL`):
- `id`, `vendor`, `model`, `firmware_min`, `firmware_max`, `default_unit_id`, `default_port` (502)
- `read_map jsonb` — Array `{address, function_code, data_type, byte_order, scale, target_field, poll_group}`
- `write_map jsonb` — `{set_current, start_charge, stop_charge, unlock}` mit Register/Wert/Datentyp
- `status_map jsonb` — Hersteller-Statuscode → OCPP `ChargePointStatus`
- `poll_intervals jsonb` — `{fast_ms: 3000, slow_ms: 30000}`
- `is_active`, `version`, `created_by`, timestamps
- RLS: alle authentifizierten Tenants lesen, nur `super_admin` schreibt

**`wallbox_modbus_instances`** (pro Tenant):
- `id`, `tenant_id`, `location_id`, `gateway_id` (FK `gateway_devices`), `template_id`
- `modbus_host`, `modbus_port`, `unit_id`
- `charge_point_id` (FK `charge_points`) — verlinkt zur OCPP-Instanz
- `provision_status` (`pending`/`active`/`error`/`offline`), `last_error`, `last_seen_at`
- `version`, timestamps
- RLS: tenant_isolation + `gateway.manage`

**Trigger**: beim Insert einer Instance automatisch passenden `charge_points`-Eintrag (vendor/model aus Template) anlegen, falls noch nicht vorhanden.

### 2. Edge Function `wallbox-template-control`

- `GET /templates` — Liste verfügbarer Templates (alle Tenants)
- `POST /templates` — Super-Admin: neues Template anlegen (oder JSON-Import)
- `PUT /templates/:id` — Super-Admin: Template-Update (bumpt `version`)
- `GET /templates/:id/export` — JSON-Export
- `POST /instances` — Tenant-Admin: Wallbox provisionieren (template_id + modbus_host + gateway_id)
  → erstellt `wallbox_modbus_instances`, `charge_points`, enqueued `provision_wallbox` an Gateway
- `PUT /instances/:id` — Update (Host, Unit-ID, Template-Wechsel)
- `DELETE /instances/:id` — Entfernen + Gateway-Cleanup-Befehl
- `POST /instances/:id/test` — einmaliger Modbus-Connect-Test

### 3. Gateway-Worker (`docs/ha-addon/index.ts`)

Neues Modul `modbus-wallbox-bridge.ts` (lokal im Worker):
- `ModbusWallboxBridge`-Klasse pro Instance:
  - öffnet Modbus-TCP-Socket (`modbus-serial` package)
  - öffnet OCPP-1.6J WebSocket zu `wss://…/functions/v1/ocpp-ws/<charge_point_id>` mit `OCPP_GATEWAY_PASSWORD` (siehe Schritt 6)
  - schickt `BootNotification` mit vendor/model aus Template
  - Polling-Loop liest Register laut Template, mapped auf interne Felder, sendet `StatusNotification` / `MeterValues` an OCPP-Backend
  - Befehle vom Backend (`RemoteStartTransaction`, `RemoteStopTransaction`, `ChangeConfiguration[CurrentLimit]`) → Modbus-Write laut `write_map`
  - SQLite-Persistierung in neuer Tabelle `wallbox_modbus_instances` (lokal) für Offline-Restart
- Neue Command-Handler:
  - `provision_wallbox` → Bridge starten + persistieren
  - `update_wallbox` → Template/Host neu laden
  - `remove_wallbox` → Bridge stoppen, lokal löschen
  - `reload_template` → Templates aus Cloud nachziehen
- Bridge-Restart bei Worker-Boot aus SQLite

### 4. Template-Seed (Migration, Super-Admin)

Initial werden 6 Templates angelegt (`is_active = true` nur für Mennekes, Rest als Stub mit `is_active = false`):
- **Mennekes Amtron Charge Control** — vollständig (Holding-Register lt. Manual: Status 0x0100, Power 0x010C, Energy 0x010E, Set-Current 0x012E, ...)
- **KEBA KeContact P30** — Stub-Template mit dokumentierten Standard-Registern (TCP-DSR-Mapping)
- **ABB Terra AC** — Stub
- **Alfen Eve Single/Pro-line** — Stub (SCN-fähig)
- **go-e Charger HOMEfix** — Stub (HTTP-API-Hinweis im Kommentar, Modbus optional)
- **Webasto Live / Next** — Stub

Templates als JSON in Migration eingebettet, damit Super-Admin sie später per UI verfeinern kann.

### 5. Frontend

**Tenant-UI** (`src/pages/EvCharging.tsx` / Wallbox-Hinzufügen-Dialog):
- Neuer Connector-Typ „Modbus TCP (Gateway)"
- Wizard:
  1. Gateway auswählen
  2. Template auswählen (Dropdown vendor/model)
  3. Modbus-Host + Port + Unit-ID eingeben
  4. „Verbindung testen" → ruft `wallbox-template-control/instances/:id/test`
  5. Speichern → erstellt Instance + Charge Point

**Super-Admin-UI** (`src/pages/SuperAdminWallboxTemplates.tsx`):
- Liste aller Templates mit Vendor/Model/Version/aktiv
- Detail-Editor mit JSON-Editor für `read_map`/`write_map`/`status_map` (Monaco oder simples Textarea mit Validierung)
- Buttons: Neu, Importieren (JSON), Exportieren, Aktivieren/Deaktivieren
- Route `/super-admin/wallbox-templates` + Sidebar-Eintrag

### 6. OCPP-Auth fürs Gateway

- Neuer Secret `GATEWAY_OCPP_PASSWORD` (geteilt) — Gateway nutzt diesen für die WS-Auth pro Charge Point
- `charge_points`-Insert-Trigger setzt für gateway-stammende CPs `auth_required = true` und einen vom Gateway abgeleiteten Passwort-Hash
- `ocpp-ws` akzeptiert wie bisher

### Bewusst NICHT in Phase 5

- ISO 15118 / Plug & Charge
- Eigener OCPP-Server **im** Gateway
- Erweitertes Lastmanagement (kommt über bestehende `pv-surplus-charging`)

### Reihenfolge der Umsetzung

1. Migration (Tabellen + Seed-Templates + Trigger)
2. Edge Function `wallbox-template-control`
3. Super-Admin-UI für Templates
4. Tenant-UI Wizard
5. Gateway-Worker `modbus-wallbox-bridge.ts` + Command-Handler
6. End-to-End-Test mit Mennekes Amtron Charge Control

Soll ich mit Schritt 1 (Migration + Seed) starten?
