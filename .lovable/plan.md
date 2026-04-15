

# OCPP Integration Seite: ws:// Bereich aktualisieren

## Problem
Die rote "ws:// Fallback"-Card beschreibt noch den **lokalen Gateway Worker auf dem Raspberry Pi** (OCPP_PROXY_PORT=9000, ws://GATEWAY_IP:9000). Das ist veraltet – der Cloud-Proxy auf `ws://ocpp.aicono.org` macht den lokalen Proxy überflüssig.

## Änderung

Die rote Card (Zeilen 178-225 in OcppIntegration.tsx) wird inhaltlich ersetzt:

**Vorher:** "ws:// Fallback für ältere Ladepunkte" → Gateway Worker lokal, Port 9000, LAN/VPN-Warnung

**Nachher:** "ws:// für ältere Ladepunkte" → Cloud-Proxy, gleiche Domain, einfach Port 80 statt 443

### Neuer Inhalt der Card:
- **Titel:** "ws:// für ältere Ladepunkte (ohne TLS)"
- **Beschreibung:** Ältere Wallboxen ohne TLS-Unterstützung können sich über ws:// (unverschlüsselt) verbinden. Der Cloud-Proxy leitet die Verbindung automatisch verschlüsselt an das Backend weiter.
- **URL anzeigen (kopierbar):** `ws://ocpp.aicono.org/<OCPP_ID>`
- **Hinweis:** Die Verbindung zwischen Wallbox und Cloud ist unverschlüsselt. Die Strecke Cloud-Proxy → Backend ist verschlüsselt (wss://).
- **Farbe:** Gelb/Amber statt Rot (es ist ein unterstützter Modus, keine Notlösung)
- Gateway-Worker-spezifische Config (OCPP_PROXY_PORT, OCPP_PROXY_TARGET) entfernen

### Dateien
| Aktion | Datei |
|--------|-------|
| Editieren | `src/pages/OcppIntegration.tsx` – rote ws:// Card ersetzen |

Optional: Die Port-Konfigurationsbox in der oberen Card kann vereinfacht werden, da ws:// jetzt einfach über die gleiche Domain läuft.

