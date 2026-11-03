# Ladestations-Vorlagen (Templates) + Vestel Gemini

## Ziel
„Ladepunkt hinzufügen“ startet mit der Auswahl einer Vorlage (Hersteller/Modell/Variante). Alles, was die Vorlage sicher festlegt (AC/DC, Leistung, Stromstärke, Phasen, Steckertyp, Anzahl Ladepunkte, Kabel fest/Steckdose, Verriegelung, Lastmanagement-Weg), wird übernommen und ist **nicht mehr falsch einstellbar**. Nur offene Punkte fragt das Formular ab.

## Ablauf für den Nutzer
```text
Ladepunkt hinzufügen
 1. Vorlage wählen   (oder "Ohne Vorlage / manuell" wie bisher)
 2. Variante wählen  (nur wenn die Vorlage mehrere hat, z. B. Gemini AC22 / AC44, Steckdose / Kabel 5 m / 7 m)
 3. Offene Angaben   (Name, OCPP-ID, Standort, ggf. Leistungsbegrenzung innerhalb der Grenzen)
 4. Speichern        -> Ladepunkt + Anschlüsse werden passend angelegt
```
- Festgelegte Werte erscheinen als gesperrte Anzeige mit Hinweis „aus Vorlage“.
- Beispiel ELMI All-in-One: nur CCS wählbar, DC, kein Typ 2.
- Fest angeschlagenes Kabel (AC oder DC): Knopf „Stecker entriegeln“ wird ausgeblendet und der Befehl serverseitig abgelehnt, damit kein fehlerhafter OCPP-Befehl rausgeht.
- Bestehende Ladepunkte bleiben unverändert; eine Vorlage kann ihnen später zugeordnet werden.

## Vorlage Vestel AC Gemini Dual (aus Datenblatt 05/2024)
- AC, Mode 3, 2 Ladepunkte, OCPP 1.6 JSON, Strom 10–32 A, 230/400 V, 1- oder 3-phasig.
- Varianten: AC15 (2 x 7,4 kW), AC22 (1 x 22 oder 2 x 11 kW), AC44 (2 x 22 kW); je Typ‑2‑Steckdose (verriegelbar) oder Kabel 5 m / 7 m (nicht verriegelbar).
- Lastmanagement: Modbus TCP, Port 502, Unit-ID 255; nur eine Modbus-Verbindung gleichzeitig; Failsafe-Strom, Failsafe-Zeit, Ladestrom und Alive-Signal (Alive alle halbe Failsafe-Zeit). Hinweis in der Vorlage: Die Vestel-eigene dynamische Steuerung (Power Optimizer) funktioniert nur mit Vestel-Zählern (KLEFR); deshalb übernimmt bei uns das AICONO-Lastmanagement die Steuerung über Modbus, mit beliebigem Zähler bzw. Modbus-Server als Messquelle.

## Lastmanagement mit anderen Zählern
- Die Gemini wird als Modbus-Ladestation an das bestehende Standort-Lastmanagement angebunden (gleicher Weg wie die vorhandenen Modbus-Wallbox-Vorlagen).
- Messwert kommt von jedem bereits eingebundenen Zähler oder Modbus-Server am Standort; das EMS rechnet den freien Strom und schreibt Ladestrom + Alive an die Gemini.
- Bei Verbindungsverlust fällt die Station selbst auf den eingestellten Failsafe-Strom zurück.

**Offen / wird nicht geraten:** Die genauen Modbus-Registeradressen der Gemini stehen in keinem der drei PDFs. Die Vorlage wird ohne Schreibregister angelegt und als „Lastmanagement: Registerliste fehlt“ markiert, bis die Vestel-Modbus-Registerliste (EVC04/EVC10 Modbus TCP Dokument) vorliegt. Danach trage ich sie per Datenänderung nach.

## Technische Details
- Migration (idempotent): `charger_models` erweitern um `connector_types text[]`, `connector_count int`, `cable_attached bool`, `supports_connector_lock bool`, `phases int[]`, `min_current_a`, `max_current_a`, `power_kw_options numeric[]`, `variants jsonb` (je Variante: key, Label, Leistung je Punkt, Stecker, Kabel, Verriegelung), `fixed_fields text[]`, `modbus_template_id uuid` (→ `wallbox_modbus_templates`), `dlm_notes text`. Alles nullable → alte Modelle verhalten sich wie bisher.
- `charge_points.charger_model_id uuid`, `charger_variant text`, `cable_attached bool`, `supports_connector_lock bool`.
- Validierungs-Trigger auf `charge_points`/`charge_point_connectors`: wenn Vorlage gesetzt, müssen Steckertyp, Leistung, Anzahl Anschlüsse zur Vorlage/Variante passen (schützt auch API/Importe, nicht nur UI).
- Vorlagen-Daten per Migration: Vestel AC Gemini Dual (Varianten oben), ELMI All-in-One 180/360 ergänzt um CCS/DC/Kabel fest; weitere Modelle bleiben ohne Detaildaten, bis Datenblätter vorliegen.
- `wallbox_modbus_templates`: neuer Eintrag „Vestel EVC10 / Gemini“ (Port 502, Unit 255, Alive/Failsafe-Hinweise, leere write_map bis Registerliste da).
- `ocpp-central`: UnlockConnector abweisen, wenn `supports_connector_lock = false`; UI blendet den Knopf aus (`ChargePointDetail.tsx`, `OcppLogViewer`).
- UI: neuer Schritt `ChargePointTemplateStep` im Dialog in `ChargingPoints.tsx`; gesperrte Felder aus `fixed_fields`; Portal-Seite für Ladestationsmodelle um die neuen Felder erweitern.
- Tests: Vorlagen-Regeln (gesperrte Steckertypen, Kabel → keine Entriegelung, Leistung in Variantengrenzen).
- Handbuch (4 Sprachen), Release Notes, CHANGELOG, SemVer MINOR, Roadmap.
