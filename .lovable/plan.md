# ELMI All-in-One (AiO) als Vorlage einbinden – Ladestation + Batteriespeicher

## Ziel
Die ELMI AiO (DC-Schnelllader 180/360 kW, 2 Ladepunkte A/B, eingebauter Batteriespeicher) wird als fertige Vorlage angelegt. Beim Einrichten entstehen automatisch:
- **Ladestation** mit 2 Anschlüssen – Steuerung über OCPP 1.6J (Standard) oder wahlweise nur Lesen über Modbus.
- **Batteriespeicher** – Messwerte und Steuerung über Modbus TCP über das AICONO-Gateway vor Ort.
- **Zähler** für Netzbezug/-einspeisung der AiO, Speicher-Ladestand und Ladeenergie je Ladepunkt, damit alles im Energiemonitoring, im Energiefluss und im Verbrauchsprofil der Liegenschaft erscheint.

## Was der Nutzer sieht
1. **Portal → Wallbox-Vorlagen:** neue Vorlage „ELMI All-in-One" (Hersteller ELMI Power, DC, 180/360 kW) mit hinterlegtem Modbus-Registersatz und den OCPP-Einstellungen aus dem Hersteller-Excel.
2. **Ladeinfrastruktur → Ladepunkt anlegen:** Auswahl „ELMI All-in-One" → Assistent fragt IP-Adresse (Standard 192.168.2.2), Port 502, Unit-ID 1, Gateway und Liegenschaft. Er legt Ladepunkt + Speicher + Zähler in einem Schritt an.
3. **Speicher-Seite:** Ladestand (SOC), Lade-/Entladeleistung, verfügbare Lade-/Entladeleistung, Temperaturen, Status „Externe Steuerung aktiv/Offline-Strategie".
4. **PV-Überschussladen:** Für die AiO-Ladegruppe neue Option „Überschuss zuerst in Speicher, dann Auto" bzw. „Auto zuerst". Überschuss am Netzverknüpfungspunkt wird als Ladesollwert an die AiO gegeben.
5. **Verbrauchsprofil / Energiebilanz der Liegenschaft:** Speicher lädt = Verbrauch, Speicher entlädt = Erzeugung/Quelle; Ladeenergie der Autos separat als Unterzähler, keine Doppelzählung.
6. Handbuch (4 Sprachen) mit Inbetriebnahme-Checkliste: interner EMS-Plan und Offline-Strategie der AiO müssen vom Errichter geprüft werden; Mindestleistung 5 kW.

## Steuerlogik (wichtig für Sicherheit)
```text
PV-Überschuss am NVP (Referenzzähler)
        |
 solar-charging-scheduler (Cloud, minütlich)
        |  Sollwert kW (+ laden / - entladen)
        v
 Loxone Miniserver (oder AICONO-Gateway) vor Ort  --Modbus TCP-->  AiO Register 1200 (Sollwert)
   sendet Heartbeat alle 10 s            Register 1204 (Heartbeat)
   prüft Rückmeldung 1078                Register 1070/1072 (Ist-Leistung)
```
- Unter 5 kW Überschuss wird nicht geregelt (Sollwert 0), da die AiO 0–5 kW sonst auf 5 kW hochsetzt und Netzbezug entstünde.
- Sollwert wird auf die Grenzen aus Register 1074/1076 begrenzt.
- Fällt Cloud oder Gateway aus, stoppt der Heartbeat → AiO geht nach 30 s in ihre eigene Offline-Strategie. Kein Dauerbefehl bleibt hängen.
- Entladen ins Netz nur, wenn ausdrücklich freigegeben (Standard: aus; nur Entladen zur Eigenverbrauchsdeckung bis Netzbezug 0).

## Umsetzungsschritte
1. Vorlage + Registersatz anlegen (Lesen: 1000–1078, 1300–1310, 1350–1360; Schreiben: 1200, 1202, 1204).
2. Gateway-Modbus-Bridge erweitern: U32/SINT32 Big-Endian, Faktor 0,1, Heartbeat-Schreiber, Rückgabe der Werte als Speicher- und Zählerwerte.
3. Speicher-Datensatz mit Gateway/Modbus-Instanz verknüpfen; Ladestand und Leistung laufend aktualisieren.
4. Assistent „ELMI All-in-One" in Ladeinfrastruktur.
5. Überschuss-Scheduler um Speicher-Sollwert erweitern (Priorität Speicher/Auto, 5-kW-Schwelle, Grenzen).
6. Speicher im Energiefluss und Verbrauchsprofil der Liegenschaft einbinden (vorzeichenrichtig).
7. Tests für die Regeln: 5-kW-Schwelle, Begrenzung auf 1074/1076, Vorzeichen Laden/Entladen, Registerumrechnung (Beispiele aus dem Herstellerdokument: 0x000185D8 → 9.980 W; 10 kW Entladen → 0xFFFE7960 bzw. Herstellerbeispiel prüfen).
8. Handbuch 4 Sprachen, Changelog, Release Notes, Version 1.12.0, Roadmap-Eintrag.

## Offene Punkte (vor dem Bau zu klären)
- Ist vor Ort ein AICONO-Gateway im selben Netz wie die AiO? Ohne Gateway ist Modbus aus der Cloud nicht erreichbar.
- Soll die AiO auch ins Netz entladen dürfen (Peak-Shaving/Arbitrage) oder nur Eigenverbrauch?
- Im Herstellerbeispiel 6.1 steht „Entladen 10 kW" mit positivem Wert und Funktionscode 0x03 – widerspricht dem Text (negativ = Entladen, Schreiben = 0x10). Wird beim ersten Test vor Ort bestätigt; bis dahin gilt der Text.

## Technische Details
- Bestehende Strukturen werden genutzt: `wallbox_modbus_templates`/`wallbox_modbus_instances`, `docs/ha-addon/modbus-wallbox-bridge.ts`, `energy_storages` (gateway_device_id, current_soc_pct), `solar_charging_config` + `solar-charging-scheduler`, Ladepunkt-Zähler-Spiegelung (`sync_charge_point_meter`).
- Migration (idempotent): Vorlage-Seed, `energy_storages.modbus_instance_id`, Speicher-Steuerfelder (`control_mode`, `allow_grid_discharge`, `last_setpoint_kw`, `last_heartbeat_at`), Option Priorität in `solar_charging_config`.
- Neuer Gateway-Befehl `storage_setpoint` über `gateway_commands`; Heartbeat lokal im Gateway (nicht aus der Cloud), damit Netzaussetzer sicher in die Offline-Strategie führen.
- HA-Add-on-Änderung muss zusätzlich im Repo CW-Aicono/ha-addons veröffentlicht werden.
