
# Charger-Modell-Katalog erweitern

## Ziel
Vorbefuellung der `charger_models`-Tabelle mit gaengigen, oeffentlich dokumentierten OCPP-kompatiblen Wallbox-Modellen, damit diese im User-Backend sofort zur Auswahl stehen.

## Neue Modelle (ca. 30 Eintraege)

| Hersteller | Modell | Protokoll | Hinweise |
|---|---|---|---|
| ABB | Terra AC W7-T-RD-M | ocpp1.6 | SIM/LAN, FW >= 1.6.6 empfohlen |
| ABB | Terra AC W11-T-RD-M | ocpp1.6 | SIM/LAN, FW >= 1.6.6 empfohlen |
| ABB | Terra AC W22-T-RD-M | ocpp1.6 | SIM/LAN, FW >= 1.6.6 empfohlen |
| Alfen | Eve Single S-Line | ocpp1.6 | LAN/SIM, Smart Charging faehig |
| Alfen | Eve Single Pro-Line | ocpp1.6 | LAN/SIM, MID-Zaehler optional |
| Alfen | Eve Double Pro-Line | ocpp1.6 | Dual-Socket, Load Balancing |
| Easee | Home | ocpp1.6 | Cloud-OCPP, Aktivierung ueber Easee Portal |
| Easee | Charge | ocpp1.6 | Cloud-OCPP, Aktivierung ueber Easee Portal |
| EVBox | Elvi | ocpp1.6 | WiFi/LAN, Konfiguration ueber EVSE-Portal |
| EVBox | BusinessLine | ocpp1.6 | LAN/SIM, fuer gewerblichen Einsatz |
| go-e | Charger Gemini | ocpp1.6 | WiFi, Konfiguration ueber go-e App |
| go-e | Charger Gemini Flex | ocpp1.6 | Mobile Variante, WiFi |
| Heidelberg | Energy Control | ocpp1.6 | Benoetigt externen OCPP-Gateway |
| KEBA | KeContact P30 x-series | ocpp1.6 | LAN, Master-faehig fuer c-series |
| KEBA | KeContact P30 c-series | ocpp1.6 | Nur als Slave ueber x-series Master |
| Mennekes | Amtron Charge Control | ocpp1.6 | LAN, eichrechtskonform moeglich |
| Mennekes | Amtron Xtra 11/22 | ocpp1.6 | LAN/SIM |
| NRGkick | NRGkick Smart | ocpp1.6 | Mobile Wallbox, WiFi, OCPP ueber App aktivieren |
| Schneider Electric | EVlink Pro AC | ocpp1.6 | LAN/SIM, Smart Charging |
| Wallbox | Pulsar Plus | ocpp1.6 | WiFi/BT, OCPP ueber myWallbox Portal |
| Wallbox | Pulsar Pro | ocpp1.6 | WiFi/BT/LAN, Power Sharing |
| Wallbox | Commander 2 | ocpp1.6 | Touchscreen, WiFi/LAN/SIM |
| Webasto | Unite | ocpp1.6 | LAN/SIM, MID-Zaehler integriert |
| Webasto | Live | ocpp1.6 | WiFi/LAN |
| Zaptec | Go | ocpp1.6 | Aktivierung ueber Zaptec Portal erforderlich |
| Zaptec | Pro | ocpp1.6 | LAN/SIM, fuer gewerblichen Einsatz |
| DUOSIDA | DSD1-EU 7kW | ocpp1.6 | ws:// nutzen, nur 2.4 GHz WiFi, Heartbeat 30s empfohlen |
| DUOSIDA | DSD1-EU 22kW | ocpp1.6 | ws:// nutzen, nur 2.4 GHz WiFi, Heartbeat 30s empfohlen |

## Umsetzung

### Schritt 1: Datenbank-Migration
Eine SQL-Migration mit INSERT-Statements fuer alle oben genannten Modelle. Bestehende Eintraege (Entratek) bleiben unberuehrt.

```text
INSERT INTO charger_models (vendor, model, protocol, notes, is_active)
VALUES
  ('ABB', 'Terra AC W7-T-RD-M', 'ocpp1.6', 'SIM/LAN, FW >= 1.6.6 empfohlen', true),
  ('ABB', 'Terra AC W11-T-RD-M', 'ocpp1.6', ...),
  ... (alle Modelle aus der Tabelle oben)
```

### Schritt 2: Keine Code-Aenderungen noetig
Die bestehende `useChargerModels`-Hook und die Super-Admin-UI laden automatisch alle Eintraege aus der Tabelle. Die neuen Modelle erscheinen sofort:
- Im Super-Admin unter "OCPP-Backend > Integrationen" in der Modelltabelle
- Im User-Backend bei der Einrichtung neuer Ladepunkte in den Hersteller/Modell-Dropdowns

### Hinweise
- Alle Modelle werden als `is_active = true` angelegt und koennen einzeln deaktiviert werden
- Die Hinweise enthalten jeweils die wichtigsten Konfigurationsbesonderheiten
- DUOSIDA-Modelle enthalten den bereits bekannten Hinweis zu ws:// und 2.4 GHz
- Spaeter koennen weitere Modelle jederzeit ueber die Super-Admin-UI hinzugefuegt werden
