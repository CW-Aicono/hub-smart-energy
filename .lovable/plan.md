## Übersicht

Vier Themen im Modul **Ladeinfrastruktur**:

1. OCPP-ID beim Anlegen optional → später bei Inbetriebnahme nachtragbar
2. „Ladepunkt duplizieren" – Standort, Modell, Hersteller, Stecker, Leistung übernehmen
3. Öffentlicher Status-Link: jeden Stecker einer Mehrfach-Wallbox einzeln zeigen + nach Ladestationsgruppen optisch gruppieren
4. Bugfix: belegte/ladende Ladepunkte werden fälschlich als „Verfügbar" angezeigt, Status nicht live

---

## 1 · OCPP-ID optional machen

**Datenbank**
- Migration: `ALTER TABLE public.charge_points ALTER COLUMN ocpp_id DROP NOT NULL;`
- Falls vorhanden: bestehenden Unique-Index auf `ocpp_id` ersetzen durch **partiellen** Unique-Index, der nur greift, wenn `ocpp_id IS NOT NULL` (mehrere Ladepunkte ohne OCPP-ID dürfen parallel existieren).

**Frontend**
- `src/pages/ChargingPoints.tsx`: Pflichtfeld-Validierung im Anlegen-Formular entfernen (`disabled={!form.name || !form.ocpp_id}` → nur noch `!form.name`); Feld als „optional, später nachtragbar" labeln, Vorschau-URL nur einblenden, wenn OCPP-ID gesetzt.
- `src/components/charging/ChargePointDetailDialog.tsx`: gleiche Anpassung im Bearbeiten-Dialog; **OCPP-ID nachträglich editierbar** behalten, damit sie bei Inbetriebnahme gesetzt werden kann.
- Liste/Karten zeigen ohne OCPP-ID einen klaren Hinweis-Badge **„OCPP-ID fehlt – nicht in Betrieb"** statt der Mono-ID-Anzeige.
- Status solcher Ladepunkte erzwingen auf `unconfigured` in der Anzeige (auch im öffentlichen Link), damit niemand sie für nutzbar hält.

---

## 2 · Ladepunkt duplizieren

**Frontend (keine DB-Änderung nötig)**
- In der Ladepunkt-Liste (`src/pages/ChargingPoints.tsx`) je Zeile neuen Button **„Duplizieren"** (Copy-Icon) neben Bearbeiten/Löschen.
- Klick öffnet den existierenden „Ladepunkt hinzufügen"-Dialog mit vorausgefüllten Feldern aus dem gewählten Ladepunkt:
  - übernommen: `address`, `latitude`, `longitude`, `vendor`, `model`, `connector_type`, `connector_count`, `max_power_kw`, `connection_protocol`, `auth_required`, `group_id`
  - **leer gelassen**: `name`, `ocpp_id`, `ocpp_password` (neu generiert)
- Anzeige im Dialog-Header: „Dupliziert von: <Originalname>".
- Speichern erzeugt regulär einen neuen Ladepunkt – keine eigene Backend-Logik nötig.

---

## 3 · Öffentlicher Link: Mehrfach-Stecker + Gruppen-Darstellung

**Edge Function** `supabase/functions/public-charge-status/index.ts`
- `charge_points`-Select zusätzlich um `group_id` erweitern.
- Zweite Query: `charge_point_groups` (id, name, color, display_order) für den Tenant laden und im Response unter `groups` zurückgeben.

**Frontend** `src/pages/PublicChargeStatus.tsx`
- Mehrfach-Stecker werden bereits einzeln gerendert (Code-Stelle ist vorhanden, Zeilen 118-135). **Verifizieren**, warum es beim Nutzer offenbar nicht greift:
  - Wahrscheinliche Ursache: Connectors-Tabelle ist für die betroffenen Wallboxen nicht oder nur mit einem Eintrag gefüllt → wir prüfen Live-Daten via `read_query` und greifen ggf. auf `connector_count` zurück (Fallback: wenn `connector_count > 1`, aber weniger Connector-Rows existieren, virtuelle Kacheln aus `connector_count` erzeugen).
- Karten nach `group_id` gruppieren:
  - Pro Gruppe ein Abschnitt mit Gruppen-Header (Name + farbiger Akzent), darunter das vorhandene Grid.
  - Ladepunkte ohne Gruppe in einen letzten Block „Ohne Gruppe".
  - Gruppen-Filter-Chip oben (zusätzlich zu den bestehenden Status-Filtern), damit man eine Gruppe gezielt einblenden kann.

---

## 4 · Bugfix: Live-Status (immer „Verfügbar")

**Ursache (im Code identifiziert)**
`src/pages/PublicChargeStatus.tsx`, `normalizeStatus()` Zeilen 53–62:
- OCPP-1.6-Status `Preparing`, `Finishing`, `SuspendedEV`, `SuspendedEVSE` werden alle auf **available** abgebildet.
- Reiner OCPP-Status `Occupied` (manche Wallboxen) wird nicht erkannt.
- Default-Fallback `return "available"` verschleiert unbekannte Status.

**Fix**
- Mapping korrigieren:
  - `charging`, `occup`, `suspendedev`, `suspendedevse`, `preparing`, `finishing`, `reserved` → **charging** (= belegt/in Nutzung)
  - `available`/`avail` → **available**
  - Default künftig **unconfigured** statt „available", damit unbekannte Werte sichtbar werden.
- Gleiches Mapping zentral in eine Helper-Datei (`src/lib/chargePointStatus.ts`) auslagern und auch in `ConnectorStatusGrid.tsx`, `ChargePointDetail.tsx`, `ChargingPoints.tsx` verwenden – damit Liste und öffentlicher Link identisch sind.

**Live-Update prüfen**
- Polling im öffentlichen Link liegt aktuell bei **15 s** (Zeile 104). Beibehalten, zusätzlich Realtime-Subscription auf `charge_point_connectors` und `charge_points` einrichten (Supabase Realtime) – Status-Wechsel sind dann unter 1 s sichtbar.
- Validierung via `supabase--read_query` an einer aktiven Wallbox: liegt in `charge_point_connectors.status` tatsächlich „Charging"/„SuspendedEV" an, wenn ein Fahrzeug lädt? Falls nein, Ursache im OCPP-Server (`docs/ocpp-persistent-server/src/ocppHandler.ts`, `StatusNotification`-Handler) prüfen – dort wird der Status bereits per `updateConnectorStatus()` geschrieben, sollte also ankommen.
- In der internen Ladepunkt-Liste (`ChargingPoints.tsx`) ebenfalls Realtime-Subscription ergänzen, sonst bleibt die Liste bis zum nächsten Reload „verfügbar".

---

## Reihenfolge der Umsetzung

1. Migration `ocpp_id` nullable + partieller Unique-Index
2. Frontend-Anpassungen Anlegen/Bearbeiten ohne OCPP-ID
3. „Duplizieren"-Button
4. Status-Helper auslagern + Mapping-Fix + Realtime-Subscription (Bugfix zuerst sichtbar machen)
5. Edge Function um `groups` erweitern + öffentliche Seite gruppieren + Mehrfach-Stecker-Fallback
