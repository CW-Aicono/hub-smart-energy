## Ziel
Die drei Rückfragen zum zentralen Knoten im Energieflussmonitor auflösen: Gateway-Status verlässlich anzeigen, den redundanten Statuspunkt entfernen und einen Detail-Dialog fürs Gateway anbieten.

## Diagnose zum grauen Status
Der Status wird aktuell nur über `gateway_devices.status` aufgelöst, und zwar ausschließlich für Meter, die eine `gateway_device_id` gesetzt haben (Zeile ~322 in `EnergyFlowMonitor.tsx`). Trifft das auf keinen der verknüpften Zähler zu (typisch bei Loxone-Sub-Outputs, manuellen Zählern oder Simulations-Metern, die stattdessen über `location_id` an ein Gateway hängen), fällt der Status auf `unknown` → grau.

Deshalb ist im Screenshot alles grau, obwohl das Gateway online ist.

## Umsetzung

### 1) `src/components/dashboard/EnergyFlowMonitor.tsx` — Gateway-Status robuster auflösen
- Zusätzlich zu `gateway_device_id` auch über `meters.location_id` alle `gateway_devices` derselben Location laden (Fallback, wenn keine direkte Verknüpfung existiert).
- Wenn beides leer bleibt, greift weiterhin `unknown` (grau) — aber nur noch als echter „keine Daten"-Fall.
- Bewertung wie bisher: `offline > error > online` (offline dominiert Farbe rot, error gelb, sonst grün). Stale-Heartbeat > 3 min = offline (bereits vorhanden).

### 2) `src/components/dashboard/EnergyFlowMonitor.tsx` — Statuspunkt am Zentralknoten entfernen
Der kleine Punkt oben rechts am Zentralknoten (Zeilen ~770–777) ist redundant, weil Ring und Icon-Farbe bereits den Gateway-Status kodieren. Er wird ersatzlos gestrichen. Damit verschwindet der auf der Kreisbahn sichtbare graue Punkt aus dem Screenshot.

### 3) `src/components/dashboard/EnergyFlowMonitor.tsx` — Zentraler Knoten klickbar
- Am Zentralknoten-`<g>` `pointer-events-none` entfernen, `cursor-pointer` setzen und `onClick` binden.
- Neuer State `gatewayDetailOpen: boolean`. Klick öffnet einen neuen `GatewayDetailDialog` (analog zum bestehenden `MeterDetailDialog`, aber schmaler — `max-w-2xl`).

### 4) Neuer Dialog `GatewayDetailDialog` (im selben File, wie `MeterDetailDialog`)
Zeigt für die im Widget relevanten Gateways:
- Gerätename, Typ, Status-Badge (online/offline/error/unknown) mit derselben Farbpalette wie am Knoten
- Lokale IP, MAC, HA-Version, Add-on-Version, verfügbare Version
- Letzter Heartbeat (Europe/Berlin), Offline-Puffer-Anzahl
- Anzahl aktiver/gesamter Automationen (aus `useGatewayDevices`-Metriken bereits vorhanden — wir fetchen die Devices direkt per Query auf `gateway_devices`, die restlichen Metriken sind für diesen Dialog nicht nötig)

Bei mehreren Gateways (mehrere Locations im Widget): Liste als Karten untereinander. Bei genau einem: einzelne Karte.

Keine Änderungen an Backend, Layout-Persistenz, Drag & Drop, Partikel-Animation oder anderen Widgets.

## Verifikation
- Preview öffnen, Widget prüfen: Statusring & Icon farbig, kein orbitierender Punkt mehr, Klick auf zentralen Knoten öffnet den Gateway-Dialog mit korrekten Daten.
- Falls im aktuellen Tenant tatsächlich kein Gateway existiert (rein manuelle Zähler): Ring bleibt grau, Dialog zeigt eine leere-Zustands-Meldung („Kein Gateway verknüpft").
