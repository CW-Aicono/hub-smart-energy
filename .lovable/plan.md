

# Plan: Connector-Auswahl via QR-Code & Deep-Link

## Ist-Zustand

- Die App zeigt bei Multi-Connector-Stationen bereits eine Anschluss-Auswahl (Connector 1, 2, …) — funktioniert korrekt
- QR-Codes werden nur pro Ladepunkt erzeugt: `/ev?cp=OCPP_ID`
- Der Deep-Link (`?cp=`) kennt keinen `connector`-Parameter — beim Scannen eines QR-Codes muss der Nutzer den Anschluss manuell wählen

## Geplante Änderungen

### 1. Deep-Link um Connector erweitern

URL-Format wird: `/ev?cp=OCPP_ID&conn=2`

- **`ChargingApp.tsx`**: Deep-Link-Handling und QR-Scanner parsen zusätzlich `conn`-Parameter. Wenn vorhanden, wird der Connector in `StationDetail` vorausgewählt.
- **`StationDetail`**: Erhält optionalen `initialConnector`-Prop, der `selectedConnector` initialisiert.

### 2. QR-Code pro Anschluss erzeugen

- **`ChargePointQrCode.tsx`**: Erhält optionalen `connectorId`-Prop. Wenn gesetzt, wird die URL zu `/ev?cp=OCPP_ID&conn=2` und der Titel zeigt "Anschluss 2".

### 3. QR-Code-Buttons im Admin-UI pro Connector

- **`ChargePointDetail.tsx`** (Admin-Ansicht): Neben dem bestehenden QR-Code-Button für den gesamten Ladepunkt wird bei Multi-Connector-Stationen für jeden Anschluss ein eigener QR-Code-Button angezeigt (z. B. in der Connector-Grid oder als Dropdown).

### Betroffene Dateien
- `src/pages/ChargingApp.tsx` — Deep-Link + QR-Scanner um `conn` erweitern
- `src/components/charging/ChargePointQrCode.tsx` — optionaler `connectorId`-Prop
- `src/pages/ChargePointDetail.tsx` — QR-Code-Buttons pro Connector

