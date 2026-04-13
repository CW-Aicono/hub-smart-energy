

# PV-Überschussladen – Überarbeiteter Plan

## Kernidee

Ladepunkte passen ihre Leistung dynamisch an den aktuellen PV-Überschuss an. Der Überschuss wird über einen **bestehenden Einspeisezähler** (bidirektionaler Zähler mit `meter_function = "bidirectional"`) ermittelt – oder der Nutzer wird aufgefordert, einen virtuellen Zähler zu erstellen.

## 1. Überschuss-Quelle: Automatische Erkennung

**Logik bei der Konfiguration:**
- System prüft, ob am Standort ein bidirektionaler Zähler existiert (`meter_function = "bidirectional"`)
- **Wenn ja:** Dieser wird als Referenzzähler vorgeschlagen/vorausgewählt. Der negative Leistungswert = Einspeisung = verfügbarer Überschuss
- **Wenn nein:** Hinweisbox mit Anleitung: *„Kein Einspeisezähler gefunden. Erstellen Sie einen virtuellen Zähler mit der Formel: Erzeugung − Gesamtverbrauch = PV-Überschuss"* – mit Link zur Zählerverwaltung

## 2. Datenbank

**Neue Tabelle `solar_charging_config`:**
- `id`, `tenant_id`, `location_id`
- `reference_meter_id` → Verweis auf den Einspeise-/Überschuss-Zähler
- `min_charge_power_w` (Standard: 1400 W / 6A)
- `safety_buffer_w` (Standard: 200 W)
- `priority_mode`: `first_come` | `equal_split` | `manual`
- `is_active`

**Neue Spalte auf `charge_point_connectors`:**
- `charging_mode`: `immediate` | `pv_surplus_only` | `pv_priority` (Standard: `immediate`)

## 3. UI-Komponenten

**Konfigurationsseite** (neuer Tab unter Ladeinfrastruktur → Energiemanagement):
- Standort-Auswahl
- Referenzzähler-Auswahl mit automatischer Erkennung + Hinweis bei fehlendem Einspeisezähler
- Mindestladeleistung, Sicherheitspuffer, Priorisierungsmodus
- Modus-Auswahl pro Ladepunkt (☀️ Nur Überschuss / ⚡ PV-Vorrang / 🔌 Sofort)

**Ladepunkt-Detailseite:**
- Anzeige des aktuellen Modus
- Live-Werte: verfügbarer Überschuss, zugewiesene Leistung

## 4. Steuerungslogik (Edge Function)

Scheduler-Edge-Function (alle 30–60s):
1. Aktuellen Leistungswert des Referenzzählers auslesen
2. Negativer Wert = Einspeisung → `Überschuss = |Wert| − Sicherheitspuffer`
3. Überschuss auf aktive Ladevorgänge im PV-Modus verteilen
4. OCPP `SetChargingProfile` an betroffene Ladepunkte senden
5. Ausführung loggen

## 5. Betroffene Dateien

| Aktion | Datei |
|---|---|
| Neu | `supabase/migrations/…` (Tabelle + Spalte) |
| Neu | `src/hooks/useSolarChargingConfig.tsx` |
| Neu | `src/components/charging/SolarChargingConfig.tsx` |
| Neu | `supabase/functions/solar-charging-scheduler/index.ts` |
| Editieren | `src/pages/ChargePointDetail.tsx` (Modus-Anzeige) |
| Editieren | Ladeinfrastruktur-Navigation (neuer Tab) |

## Technische Details

- Einspeisezähler-Erkennung: `meters.filter(m => m.meter_function === "bidirectional" && m.location_id === selectedLocationId)`
- Überschuss-Berechnung: Negativer Leistungswert am bidirektionalen Zähler = Einspeisung ins Netz = ungenutzter PV-Strom
- Virtual-Meter-Hinweis nutzt bestehende `VirtualMeterFormulaBuilder`-Komponente als Referenz

