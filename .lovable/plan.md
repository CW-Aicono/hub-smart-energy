

# Live-Energieanzeige während des Ladevorgangs

## Ist-Zustand

Das Backend (`ocpp-central`) aktualisiert `energy_kwh` in der `charging_sessions`-Tabelle bereits bei jedem eingehenden `MeterValues`-Paket der Ladesäule. Die Berechnung `(aktueller Zählerstand − meter_start) / 1000` läuft korrekt.

**Problem**: Die Lade-App (`ChargingApp.tsx`) hat **keine Realtime-Subscription** auf die `charging_sessions`-Tabelle. Sessions werden einmalig beim Laden der Seite abgefragt und danach nicht mehr aktualisiert. Deshalb zeigt die App während des Ladens `0,00 kWh` an.

Die Backend-Detailseite (`ChargePointDetail.tsx`) nutzt dagegen `useChargingSessions(id)`, das bereits eine Realtime-Subscription enthält — dort funktioniert die Live-Anzeige.

## Plan

### 1. Realtime-Subscription in ChargingApp hinzufügen
- In `ChargingApp.tsx` eine Supabase-Realtime-Subscription auf `charging_sessions` einrichten (analog zu `useChargingSessions.tsx`)
- Bei jedem `UPDATE`-Event wird die lokale Session-Liste aktualisiert, sodass `energy_kwh`, Dauer und Kosten in Echtzeit steigen

### 2. Aktive Session-Anzeige verbessern
- In der aktiven Session-Karte einen visuellen Hinweis ergänzen, dass die kWh-Anzeige live aktualisiert wird (z. B. ein kleines Pulse-Icon neben dem Wert)
- Die Dauer-Anzeige läuft bereits live (nutzt `new Date()` als Fallback), das bleibt so

### 3. ChargePointDetail-Seite prüfen
- Die Detailseite hat bereits Realtime via `useChargingSessions` — dort ist keine Änderung nötig
- Optional: Aktive Sessions in der Session-Tabelle visuell hervorheben (aktueller kWh-Stand + animiertes Icon)

## Technische Details

**Datei: `src/pages/ChargingApp.tsx`**
- `useEffect` mit `supabase.channel('app-sessions-realtime')` hinzufügen
- Events: `UPDATE` auf `charging_sessions` filtern nach den Session-IDs des eingeloggten Nutzers
- Bei Update: `setSessions(prev => prev.map(s => s.id === payload.new.id ? {...s, energy_kwh: payload.new.energy_kwh} : s))`

**Keine DB-Änderungen nötig** — `charging_sessions` ist bereits für Realtime aktiviert (wird von `useChargingSessions` genutzt).

**Keine Backend-Änderungen nötig** — MeterValues-Verarbeitung funktioniert bereits korrekt.

## Aufwand
Gering (1 Datei, ca. 20 Zeilen Code).

