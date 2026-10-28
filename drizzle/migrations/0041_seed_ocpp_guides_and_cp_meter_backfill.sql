-- v1.13.1: Stammdaten, die bisher nur auf Staging existierten, idempotent für alle Umgebungen.
INSERT INTO public.charger_models (vendor, model, protocol, charging_type, power_kw, notes, is_active)
SELECT 'ELMI Power', v.model, 'ocpp1.6', 'DC', v.kw, 'All-in-One mit Batteriespeicher; Speicher via Modbus TCP (Loxone Miniserver)', true
FROM (VALUES ('All-in-One 180', 180::numeric), ('All-in-One 360', 360::numeric)) AS v(model, kw)
WHERE NOT EXISTS (SELECT 1 FROM public.charger_models c WHERE c.vendor = 'ELMI Power' AND c.model = v.model);

INSERT INTO public.ocpp_integration_guides (charger_model_id, vendor, model, ocpp_version, difficulty, content_md)
SELECT (SELECT id FROM public.charger_models c WHERE c.vendor = 'Mennekes' AND c.model = 'AMTRON 4Business 760 (11/22 kW)' LIMIT 1),
  'Mennekes', 'AMTRON 4Business 760 (11/22 kW)', '1.6J', 'easy', $guide$## Mennekes AMTRON 4Business 760 anbinden

**Wichtig:** Einzelladepunkt mit **1 Anschluss**. Nicht das Amedio-Modell (Doppelsäule, 2 Anschlüsse) verwenden – sonst erscheint ein Anschluss dauerhaft als „Belegt".

### 1. Weboberfläche öffnen
- Im Browser die lokale IP der Wallbox oder `http://amtron-SERIENNUMMER.local` aufrufen
- Mit der Installateur-PIN von der Setup Card anmelden

### 2. Backend / OCPP
- Menü **Backend** bzw. **Kommunikation → OCPP**
- Backend-Anbindung: **aktiv**
- Protokoll: **OCPP 1.6-J**
- Server-Adresse: `wss://ocpp.aicono.org` (ältere Firmware ohne TLS: `ws://ocpp.aicono.org`)
- ChargeBoxIdentity: die OCPP-ID aus AICONO (nicht zusätzlich an die URL hängen)
- Speichern und Wallbox neu starten

### 3. Leistung
- Standard 22 kW. Bei Drosselung auf 11 kW die Leistung im Ladepunkt in AICONO anpassen.

### 4. Prüfen
- Im OCPP-Log erscheinen BootNotification und StatusNotification „Available".$guide$
WHERE NOT EXISTS (SELECT 1 FROM public.ocpp_integration_guides g WHERE g.vendor = 'Mennekes' AND g.model = 'AMTRON 4Business 760 (11/22 kW)');

INSERT INTO public.ocpp_integration_guides (charger_model_id, vendor, model, ocpp_version, difficulty, content_md)
SELECT c.id, 'ELMI Power', c.model, '1.6J', 'advanced', $guide$## ELMI Power All-in-One anbinden

Die Station besteht aus zwei Teilen: **Ladestation** (OCPP) und **Batteriespeicher** (Modbus TCP über den Loxone Miniserver).

### 1. Ladestation per OCPP
- In der Weboberfläche der ELMI-Station **OCPP 1.6-J** aktivieren
- Server-Adresse: `wss://cp.aicono.org/<OCPP_ID>` (ohne TLS: `ws://cp.aicono.org/<OCPP_ID>`)
- OCPP-ID = die ID des Ladepunkts in AICONO
- Speichern, neu starten; im OCPP-Log erscheint BootNotification

### 2. Speicher über Loxone Miniserver
- Im Miniserver einen **Modbus-TCP-Server** mit der IP der Station, Port 502, Unit-ID 1 anlegen
- Sollwert in **Register 1200** (int32, 0,1 W; negativ = Entladen, Funktionscode 0x10)
- **Heartbeat Register 1204** zyklisch vom Miniserver schreiben lassen
- Den Sollwert als **virtuellen Eingang** anlegen und dessen UUID in AICONO beim Speicher eintragen

### 3. In AICONO
- Unter Energiespeicher den Speicher mit Vorlage „ELMI All-in-One" anlegen und mit dem Ladepunkt verknüpfen
- PV-Überschussladen: Speicher und Priorität in der Ladegruppe wählen
- Netzentladung bleibt gesperrt (Vorgabe Netzbetreiber)

Details: Benutzerhandbuch, Abschnitt „ELMI All-in-One".$guide$
FROM public.charger_models c
WHERE c.vendor = 'ELMI Power'
  AND NOT EXISTS (SELECT 1 FROM public.ocpp_integration_guides g WHERE g.vendor = 'ELMI Power' AND g.model = c.model);

-- Nachlauf: Zähler für bestehende Ladepunkte (wiederholbar)
INSERT INTO public.meters (tenant_id, location_id, name, energy_type, unit, capture_type, device_type, meter_function, source_charge_point_id, notes)
SELECT cp.tenant_id, cp.location_id, cp.name, 'strom', 'kWh', 'automatic', 'meter', 'consumption', cp.id, 'Ladepunkt ' || coalesce(cp.ocpp_id, '')
FROM public.charge_points cp
WHERE cp.location_id IS NOT NULL AND cp.linked_meter_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.meters m WHERE m.source_charge_point_id = cp.id);
UPDATE public.charge_points cp SET linked_meter_id = m.id
FROM public.meters m WHERE m.source_charge_point_id = cp.id AND cp.linked_meter_id IS NULL;