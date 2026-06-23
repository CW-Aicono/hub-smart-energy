## Ziel
Super-Admin-Navigation verschlanken und Gateway-Themen zentral unter **Gateway-Flotte & Updates** bündeln.

## Änderungen

### 1. Menüpunkt „Karte" entfernen
- In `src/components/super-admin/SuperAdminSidebar.tsx` den Eintrag `/super-admin/map` (Map-Icon, Label „Karte") aus der Navigationsliste löschen.
- In `src/App.tsx` bleibt die Route `/super-admin/map` (mit `SuperAdminMap`) bestehen, damit alte Bookmarks nicht 404en — nur der Sidebar-Link entfällt. (Falls explizit gewünscht, kann ich die Route auch komplett entfernen.)

### 2. Loxone-Monitor verschieben in „Gateway-Flotte & Updates"
- `LoxoneMiniserverMonitorCard` wird in `src/pages/SuperAdminGatewayFleet.tsx` als neuer Tab **„Loxone Miniserver"** eingebunden (neben Flotte / Update-Jobs / Release-Channels / Worker-Steuerung).
- In `src/pages/SuperAdminMonitoring.tsx` wird die Karte entfernt, damit sie nicht doppelt erscheint. Seite „Monitoring" bleibt sonst unverändert.

### 3. Gateway-Typ-Filter im Tab „Flotte"
- Über der Tabelle ein **Select-Dropdown** „Gateway-Typ" mit Optionen:
  - „Alle Typen" (Default)
  - „AICONO EMS"
  - „Loxone Miniserver"
- Aktuell liefert die Flotten-Query nur AICONO-EMS-Gateways. Damit der Filter sinnvoll arbeitet, wird die Liste um Loxone-Miniserver-Einträge aus der bestehenden Loxone-Datenquelle (gleiche Query wie im Monitor-Card) ergänzt und in der Tabelle als zusätzlicher Typ angezeigt. Spalten Channel / Auto-Update / Update jetzt sind für Loxone-Zeilen deaktiviert (mit „—"), da der OTA-Update-Mechanismus dort nicht greift.
- Der Filter wirkt nur clientseitig auf die zusammengeführte Liste.

### 4. Worker-Steuerung als Tab integrieren
- Neuer Tab **„Worker-Steuerung"** in `SuperAdminGatewayFleet.tsx`.
- Der bestehende Seiten-Inhalt aus `src/pages/SuperAdminWorkerControls.tsx` (Card-Bereich mit Pause/Aktivieren-Schaltern, Hook `useWorkerControls`) wird in eine eigene Komponente `WorkerControlsPanel` extrahiert und sowohl im neuen Tab gerendert.
- Sidebar-Eintrag „Worker-Steuerung" (`PauseCircle`, Route `/super-admin/worker-controls`) wird **entfernt**.
- Route `/super-admin/worker-controls` in `App.tsx` bleibt bestehen und redirected dauerhaft per `<Navigate to="/super-admin/gateways?tab=workers" replace />` (alternativ: Route entfernen — bitte sagen, falls bevorzugt).
- Tabs in `SuperAdminGatewayFleet.tsx` werden via URL-Param `?tab=` steuerbar gemacht, damit Deep-Links funktionieren.

## Endgültige Tab-Reihenfolge in „Gateway-Flotte & Updates"
1. Flotte (mit Typ-Filter)
2. Update-Jobs
3. Release-Channels
4. Loxone Miniserver
5. Worker-Steuerung

## Nicht-Ziele
- Keine Änderungen an Backend, RLS, Tabellen oder Edge Functions.
- Keine Änderung an Loxone-Monitor-Logik selbst.
- Keine Übersetzungs- oder Branding-Updates über die neuen Tab-Labels hinaus.
