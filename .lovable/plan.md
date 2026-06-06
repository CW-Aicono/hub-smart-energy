# Ladeinfrastruktur – Feature-Gap-Analyse (ohne Roaming)

## 1. Bestandsaufnahme (was es schon gibt)

Beim Sichten des Codes vorhanden:

- **OCPP 1.6** persistenter Server (`docs/ocpp-persistent-server`, Edge `ocpp-central`), Live-Status, Heartbeat, Stabilitäts-Score
- **Ladepunkte/Gruppen/Connectoren**, Karten, QR-Code, Public-Status-Link
- **Tarife & Abrechnung** (`ChargingBilling`, `generateChargingInvoicePdf`, `send-charging-invoices`, `generate-monthly-invoices`)
- **PV-Überschussladen** (`solar-charging-scheduler`) + **Cheap-Charging** (`cheap-charging-scheduler`) + **DLM-Scheduler**
- **Auto-Reboot**, **Modbus-Wallbox-Bridge**, **OCPP-Simulator**, **Power-Limit-Scheduler**
- **RFID/idTag-Whitelist** (`ChargingUsersPage`, `AccessControlSettings`)
- **Charging-App (PWA)** für Endnutzer, Stabilitäts-Score, Invoice-Settings
- **OpenChargeMap-Integration**, **Roaming-Tab** (ausgenommen)

## 2. Lücken – was im Modul aktuell fehlt

### 2.1 Rechts- & Eichkonformität (DE)

- **Eichrecht / MID-konforme Messung**: keine signierte Übertragung der Zählerstände (OCMF/SML), keine Aufbewahrung des Signaturzertifikats, keine Transparenz-Software-Export. Pflicht für jede kWh-genaue Abrechnung an Dritte.
- **Kalibrierungs-/Eichgültigkeits-Tracking** pro Ladepunkt (Eichfrist 8 Jahre).
- **THG-Quote Workflow**: kein Erfassen der Fahrzeug-Scheine, kein jährlicher Bündel-Export an Quotenhändler, keine Erlös-Verteilung an Nutzer.
- **Kassensicherungsverordnung / GoBD-Archiv** für Ladevorgangs-Rechnungen (revisionssicher).

### 2.2 Lastmanagement & Netz

- **Statisches DLM** existiert (`dlm-scheduler`), aber **dynamisches DLM auf Hausanschluss-Messung** (Reduktion bei Lastspitze in Echtzeit, <15 s) fehlt sichtbar.
- **§14a EnWG Steuerbare Verbrauchseinrichtung**: kein Modul „Netzdienliche Steuerung" mit Modul 1/2/3, kein FNN-Steuerbox-Protokoll, keine Drosselung auf 4,2 kW bei Netzsignal.
- **Phasenumschaltung 1→3 Phasen** (für PV-Überschuss <4,1 kW) ist nicht modelliert.
- **Reservierung des Hausanschluss-Headrooms** zwischen Wallboxen, Wärmepumpe und Speicher (cross-asset Energiemanagement).

### 2.3 Nutzererlebnis / Treiber-Features

- **Reservierung** eines Ladepunkts (`ReserveNow` OCPP) für bestimmte Zeitslots/Nutzer fehlt.
- **Wartelisten / Auto-Move** wenn vollgeladen: keine Push-Benachrichtigung „Bitte Fahrzeug entfernen", keine Blockiergebühr automatisch.
- **Ad-hoc-Zahlung per QR** (Gastnutzer ohne RFID) mit Stripe/Apple/Google Pay – nicht vorhanden.
- **Plug & Charge (ISO 15118-2/-20)** inkl. Vehicle-Zertifikate, optional auch AutoCharge (MAC-basiert) – nicht vorhanden.
- **Push-Notifications** „Ladevorgang fertig", „Fehler", „Kabel gezogen" für die Charging-PWA.
- **In-App Trip-Planner / SoC-Ziel** („Lade bis 80 % bis 07:00 Uhr") als Endnutzer-Eingabe.

### 2.4 Flotten- & Dienstwagen

- **Dienstwagen-Lademanagement**: 0,30 €/kWh-Pauschale §3 Nr. 46 EStG, Heim-Lade-Erstattung an Mitarbeiter, monatlicher Beleg pro Mitarbeiter (HR-/DATEV-Export).
- **Kostenstellen-Splitting**: Ladevorgang → Mitarbeiter → Kostenstelle → SAP/DATEV-CSV.
- **Fahrzeug-Stammdaten** (Kennzeichen, VIN, max. Ladeleistung, OEM) für Reporting/Anomalieerkennung.

### 2.5 Wartung & Betrieb

- **Predictive Maintenance**: Auto-Reboot ist da, aber keine Fehlerquoten-Heatmap, kein Trend („Fehler steigen seit 7 Tagen"), keine automatischen Tickets.
- **Remote-Firmware-Update (OCPP UpdateFirmware/GetDiagnostics)** als UI fehlt.
- **Cable-Lock-Override** und **Reset-Button** Hardware-Diagnose im UI.
- **Service-Logbuch / Inspektionsplan** pro Wallbox (Sichtprüfung, DGUV V3, RCD-Test).

### 2.6 Reporting & Business

- **ESG-/CO₂-Report je Ladevorgang** mit echtem Strommix-Zeitstempel (UBA-Daten) statt Jahresdurchschnitt.
- **Auslastungs-Heatmap** Wochentag×Stunde je Ladepunkt → Standort-Optimierung.
- **Standort-ROI**: Investitionskosten vs. Erlös/Auslastung, Payback-Rechner – fehlt.
- **Tarif-A/B-Test**, Saison- und Tageszeit-Tarife (peak/off-peak Multiplier) – Cheap-Charging gibt es, dynamische Verkaufstarife noch nicht.

### 2.7 Integrationen

- **Backend-Webhooks** „Session started/ended/failed" für Kunden-IT (kein Roaming).
- **Modbus/SunSpec-Bridge zum Wechselrichter** für noch genauere PV-Überschuss-Berechnung.
- **OCPP 2.0.1** Migrationspfad (Smart-Charging-Profile, ISO 15118 Tunneling) – heute nur 1.6.

## 3. Killer-Feature-Kandidaten (Priorisierungsvorschlag)


| #   | Feature                                             | Warum „Killer"                                                                                 | Aufwand                                                                                   | &nbsp; |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| K1  | **Eichrecht + Transparenz-Export (OCMF)**           | Pflicht für jede €-Abrechnung an Dritte, Tür­öffner für Vermieter/Hotels/Arbeitgeber           | hoch                                                                                      | &nbsp; |
| K2  | **§14a EnWG Netzdienliche Steuerung**               | Ab 2024 für jede neue Wallbox >4,2 kW relevant; kein Wettbewerber im KMU-Segment hat es sauber | mittel                                                                                    | &nbsp; |
| K3  | **Dienstwagen-Heim-Lade-Erstattung + DATEV-Export** | Direkter Geldwert für jeden Firmen­kunden mit E-Flotte; kaum jemand bietet es integriert       | mittel                                                                                    | &nbsp; |
| K4  | **THG-Quoten-Bündelung**                            | Echter Cashback für Endnutzer, Differenzierungs­merkmal, jährlich wiederkehrend                | mittel                                                                                    | &nbsp; |
| K5  | **Plug & Charge / AutoCharge**                      | „Einstecken, fertig" – Premium-Erlebnis, hebt von Wettbewerb ab                                | hoch (ISO 15118 Stack)                                                                    | &nbsp; |
| K6  | **Dynamisches DLM auf Hausanschluss-Messung**       | &nbsp;                                                                                         | Verhindert teure Netzausbau-Investitionen, sofort spürbar bei Mehrfach-Wallbox-Standorten | mittel |
| K7  | **Auslastungs-Heatmap + Standort-ROI**              | Verkaufsargument für Betreiber/Investoren; nutzt vorhandene Session-Daten                      | niedrig                                                                                   | &nbsp; |
| K8  | **Reservierung + Blockiergebühr-Automatik**         | Löst das größte Alltagsproblem in Mehrnutzer-Standorten                                        | niedrig–mittel                                                                            | &nbsp; |
| K9  | **Predictive-Maintenance-Dashboard + Auto-Tickets** | Verzahnt sich mit Task-Modul, reduziert Ausfälle                                               | niedrig                                                                                   | &nbsp; |
| K10 | **OCPP 2.0.1 Smart-Charging-Profiles**              | Pflicht-Roadmap für künftige Hardware, schaltet ISO 15118 frei                                 | hoch                                                                                      | &nbsp; |


## 4. Empfehlung Reihenfolge (nur Vorschlag, noch nicht umgesetzt)

1. **Quick Wins / hoher Sales-Impact**: K7 (Heatmap+ROI), K8 (Reservierung), K9 (Predictive Maintenance) – nutzt vorhandene Daten, kein neuer Stack.
2. **Compliance & Differenzierung**: K1 (Eichrecht), K2 (§14a EnWG), K3 (Dienstwagen-Erstattung), K4 (THG).
3. **Premium-Tech-Stack**: K6 (dyn. DLM), K5 (Plug & Charge), K10 (OCPP 2.0.1).

## 5. Nicht Teil dieses Plans

- Implementierung – das ist nur eine Recherche/Lückenanalyse.
- Roaming (OCPI, Hubject, e-clearing) – auf Wunsch ausgenommen.
- Hardware-spezifische Wallbox-Firmware-Themen außerhalb OCPP.

**Nächster Schritt:** Bitte 1–3 Features aus Abschnitt 3 auswählen, dann erstelle ich pro Feature einen detaillierten Umsetzungsplan (Datenmodell, Edge-Functions, UI, Tests).  
  
Bitte diese Features planen:  
- K2: **§14a EnWG Netzdienliche Steuerung**  
**- K6: Dynamisches DLM auf Hausanschluss-Messung**  
**- K7: Auslastungs-Heatmap + Standort-ROI**