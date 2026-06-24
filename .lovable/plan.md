## Ziel
Live-Werte auf `/live-values` sollen auf jeder Instanz (Lovable Preview, Hetzner, Published) konsistent dieselben Werte zeigen — unabhängig davon, wann der Tab geöffnet wurde oder ob die WebSocket-Verbindung kurz aussetzte.

## Ursache (verifiziert in `src/pages/LiveValues.tsx`)

1. `loadInitialPowerValues` setzt `meterReading` (= „Zählerstand") **immer auf `null`**. Der Zählerstand kommt ausschließlich über `broadcast`-Events mit `role: "total"`. Wer das Event verpasst, sieht den Zählerstand nie → erklärt fehlenden Zählerstand auf Hetzner.
2. Nach dem Initial-Load gibt es **keinen periodischen DB-Reconcile** mehr für Power / `totalDay` / `totalMonth` / `totalYear`. Werte verharren auf dem zuletzt empfangenen Broadcast → erklärt unterschiedliche „Gesamt heute"-Werte (404 vs. 421 kWh) auf beiden Instanzen.
3. Der Diagnose-Filter `Math.abs(ev.value) > 1000` **loggt nur**, übernimmt den Wert aber trotzdem ins State. In den Console-Logs erscheinen `role:"total"`-Events mit 542 908 MWh / 390 545 MWh etc. — solche Müll-Broadcasts können den angezeigten Zählerstand verfälschen.

## Änderungen (nur `src/pages/LiveValues.tsx`)

### 1. Zählerstand aus DB initial laden
- `loadInitialPowerValues` zusätzlich aus `meter_readings` (oder der bereits vorhandenen „Zählerstand"-Quelle für Loxone — vor Implementierung kurz prüfen, welche Tabelle der `total`-Broadcast spiegelt; voraussichtlich `meter_period_totals` mit `period_type = 'cumulative'` oder `bridge_raw_samples` mit Role-Marker) den letzten bekannten Zählerstand je `meter_id` selektieren und in `liveValues.meterReading` setzen — statt hartem `null`.

### 2. Periodischer Reconcile
- Bestehenden `loadInitialPowerValues` zusätzlich in einem `setInterval` aufrufen (z. B. alle 60 s, analog zum `fetchCpVirtualValues`-Intervall). Broadcast-Events bleiben für sub-sekündliche Updates aktiv; der Reconcile heilt verlorene Events.
- Außerdem `loadInitialPowerValues` triggern, wenn das Browser-Tab wieder sichtbar wird (`document.visibilitychange`) — typischer Fall für stehengebliebene Werte nach Sleep.

### 3. Plausibilitätsfilter im Broadcast-Handler
- Verdächtige Events (`Math.abs(ev.value) > SCHWELLE`, getrennt pro Rolle: `pwr` z. B. > 10 000 kW, `total/today/month/year` z. B. > 10 000 000) **verwerfen**, nicht nur loggen. Damit kein Müll-Broadcast den Zählerstand zerschießt.

## Nicht-Ziele
- Keine Änderung am Loxone-WS-Bridge / Broadcast-Sender.
- Keine Änderung an Aggregation, Cron-Jobs oder DB-Schema.
- Keine UI-/Layout-Änderung an der Karte selbst.

## Verifikation
- Beide Instanzen (Lovable Preview + Hetzner) zeigen nach max. 60 s denselben Power-Wert, dasselbe „Gesamt heute" und denselben Zählerstand.
- Nach Tab-Sleep > 5 min: Werte aktualisieren sich beim Re-Fokus.
- Console zeigt keine „suspicious event"-Werte mehr im State (nur noch im Log, mit Hinweis „dropped").
