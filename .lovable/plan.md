
# Ladeinfrastruktur mit OCPP-Backend

## Uebersicht

Neuer Sidebar-Oberpunkt **"Ladeinfrastruktur"** mit Unterpunkten **"Ladepunkte"** und **"Abrechnung"**, plus ein OCPP-Backend basierend auf dem Open Charge Point Protocol. Die OCPP-Kommunikation wird ueber eine Edge Function realisiert, die als OCPP Central System (WebSocket-Server) agiert. Die UI wird im bestehenden App-Stil entwickelt.

## Architektur

```text
+------------------+       WebSocket (OCPP-J 1.6)        +----------------------+
|  Ladestationen   | <--------------------------------->  | Edge Function         |
|  (Charge Points) |                                      | "ocpp-central"        |
+------------------+                                      |                       |
                                                          | - Boot Notification   |
                                                          | - Heartbeat           |
                                                          | - StatusNotification  |
                                                          | - StartTransaction    |
                                                          | - StopTransaction     |
                                                          | - MeterValues         |
                                                          +----------+------------+
                                                                     |
                                                          Schreibt in Datenbank
                                                                     |
                                                          +----------v------------+
                                                          |  Datenbank-Tabellen    |
                                                          |  - charge_points       |
                                                          |  - charging_sessions   |
                                                          |  - ocpp_transactions   |
                                                          |  - charging_tariffs    |
                                                          +----------+------------+
                                                                     |
                                                          +----------v------------+
                                                          |  React Frontend        |
                                                          |  - Ladepunkte-Seite    |
                                                          |  - Abrechnung-Seite    |
                                                          +------------------------+
```

## Schritt 1: Datenbank-Tabellen

Neue Tabellen mit RLS-Policies (tenant-basiert):

- **charge_points** - Ladepunkte-Verwaltung
  - id, tenant_id, location_id (FK), ocpp_id (eindeutige OCPP-Kennung), name, status (available/charging/faulted/unavailable/offline), connector_count, max_power_kw, last_heartbeat, firmware_version, vendor, model, created_at, updated_at

- **charging_sessions** - Ladevorgaenge
  - id, tenant_id, charge_point_id (FK), connector_id, transaction_id, id_tag (RFID/Auth), start_time, stop_time, energy_kwh, meter_start, meter_stop, stop_reason, status (active/completed/error), created_at

- **charging_tariffs** - Tarife fuer Abrechnung
  - id, tenant_id, name, price_per_kwh, base_fee, currency, is_active, created_at

- **charging_invoices** - Abrechnungen
  - id, tenant_id, session_id (FK), tariff_id (FK), total_energy_kwh, total_amount, currency, status (draft/issued/paid), invoice_number, issued_at, created_at

Realtime wird fuer charge_points und charging_sessions aktiviert, damit Status-Updates live angezeigt werden.

## Schritt 2: OCPP Central System (Edge Function)

Edge Function **`ocpp-central`** die als OCPP 1.6 JSON Central System agiert:

- Empfaengt OCPP-Nachrichten (BootNotification, Heartbeat, StatusNotification, StartTransaction, StopTransaction, MeterValues)
- Schreibt Status-Updates in charge_points
- Erstellt/aktualisiert charging_sessions bei Start/Stop Transaction
- Speichert Zaehlerstaende aus MeterValues
- Bietet REST-Endpunkte fuer Remote-Befehle (RemoteStartTransaction, RemoteStopTransaction, Reset)

Da Edge Functions kein persistentes WebSocket-Hosting unterstuetzen, wird ein HTTP-basierter Ansatz verwendet: Die Ladestationen senden OCPP-Nachrichten als HTTP-POST, die Edge Function verarbeitet sie und antwortet synchron.

## Schritt 3: Sidebar-Navigation

Neuer Eintrag in **DashboardSidebar.tsx** nach "Energiedaten":

```text
Ladeinfrastruktur (Icon: Zap)
  +-- Ladepunkte (Icon: PlugZap)
  +-- Abrechnung (Icon: Receipt)
```

Folgt dem bestehenden Collapsible-Pattern mit TranslationKeys.

## Schritt 4: Neue Seiten

### Ladepunkte-Seite (`/charging/points`)
- Uebersicht aller Ladepunkte mit Status-Badges (Verfuegbar/Laden/Gestoert/Offline)
- Live-Status via Realtime-Subscription
- Dialog zum Hinzufuegen/Bearbeiten von Ladepunkten
- Zuordnung zu Standorten
- Remote-Befehle (Start/Stop/Reset)
- Detail-Ansicht mit aktuellem Ladevorgang und Historie

### Abrechnung-Seite (`/charging/billing`)
- Uebersicht aller Ladevorgaenge mit Energie, Dauer, Kosten
- Tarif-Verwaltung (Preis pro kWh, Grundgebuehr)
- Rechnungserstellung aus abgeschlossenen Sessions
- Filter nach Zeitraum, Ladepunkt, Status
- Export-Funktion

## Schritt 5: Hooks und Komponenten

- **useChargePoints** - CRUD + Realtime fuer Ladepunkte
- **useChargingSessions** - Ladevorgaenge abfragen + Realtime
- **useChargingTariffs** - Tarif-Verwaltung
- **useChargingInvoices** - Rechnungen erstellen/verwalten

## Schritt 6: Translations

Neue Keys in allen 4 Sprachen (de/en/es/nl) fuer Navigation, Status-Labels, Formulare und Fehlermeldungen.

## Schritt 7: Modul-System

Neues Modul `ev_charging` in `ALL_MODULES` registrieren, damit es pro Mandant aktiviert/deaktiviert werden kann.

## Technische Details

- **OCPP-Version**: 1.6 JSON (am weitesten verbreitet)
- **Kein externer OCPP-Server**: Die Logik wird direkt in der Edge Function und den DB-Tabellen abgebildet, da ein vollstaendiger WebSocket-basierter OCPP-Server nicht in Edge Functions lauffaehig ist
- **Ansatz**: HTTP-basierte OCPP-Nachrichtenverarbeitung -- Ladestationen senden Messages via HTTP POST an die Edge Function, diese verarbeitet sie und gibt OCPP-konforme Responses zurueck
- **Realtime**: Status-Aenderungen werden ueber Supabase Realtime an die UI gepusht
- **RLS**: Alle Tabellen mit tenant_id-basierter Row Level Security
