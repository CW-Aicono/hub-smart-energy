
Ziel: Der neu erzeugte Tunnel-Token muss nach Klick auf „Tunnel-Token neu generieren“ stabil sichtbar bleiben, bis du ihn kopiert oder den Dialog selbst geschlossen hast.

1. Wahrscheinliche Hauptursache beheben
- Im Bearbeiten-Dialog die direkte Rückkopplung an die Elternliste entschärfen.
- Konkret: Nach erfolgreicher Tunnel-Erzeugung den Token nur lokal im Dialog anzeigen und nicht sofort nochmals über `onUpdate(...)` die komplette Integrationsliste neu laden.
- Hintergrund: Die Edge Function speichert den neuen Tunnel bereits. Das zusätzliche `onUpdate` ist sehr wahrscheinlich der Auslöser für den kurzen Re-Render/Reset.

2. Dialog-Zustand vollständig vom Refetch entkoppeln
- `tunnelResult`, `tokenCopied` und das sichtbare `api_url`-Feld im Dialog als lokale, führende UI-Quelle behandeln.
- `useEffect` im `EditIntegrationDialog` so umbauen, dass `form.reset(...)` nur noch in 2 Fällen passiert:
  - Dialog wird neu geöffnet
  - Es wird eine andere Integration bearbeitet
- Bei normalem Refetch derselben Integration darf kein Reset mehr passieren.

3. Robuster machen: Dialog außerhalb der Kartenliste halten
- Falls nötig den Edit-Dialog aus `IntegrationCard` herausziehen und zentral in `LocationIntegrationsList` verwalten.
- Dann bleibt der Dialog selbst dann stabil offen, wenn einzelne Karten neu gerendert oder ersetzt werden.
- Das ist die sicherste Variante gegen genau solche „Fenster blitzt kurz auf und verschwindet“-Fehler.

4. UX-Schutz einbauen
- Nach erfolgreicher Generierung:
  - Dialog bleibt offen
  - Token bleibt sichtbar
  - optional: klarer Hinweis „Fenster erst schließen, nachdem der Token kopiert wurde“
- Optional zusätzlich:
  - Button „Token kopieren“ mit bestätigtem Zustand
  - Button „Fertig“ schließt erst bewusst den Dialog

5. Regression-Tests ergänzen
- Test 1: Token bleibt sichtbar, wenn dieselbe Integration neu geladen wird.
- Test 2: Dialog bleibt offen nach erfolgreicher Tunnel-Erzeugung.
- Test 3: Token verschwindet erst beim manuellen Schließen oder beim Wechsel auf eine andere Integration.
- Test 4: Bestehende Integrationskarten bleiben während Background-Refetch sichtbar.

6. Manuelle End-to-End-Prüfung nach Umsetzung
- Integration öffnen
- „Tunnel-Token neu generieren“ klicken
- Warten bis Erfolgsmeldung erscheint
- Prüfen:
  - Dialog bleibt offen
  - Token bleibt mindestens dauerhaft sichtbar
  - Kopieren funktioniert
  - Danach erst manuell schließen

Technische Details
- Betroffene Dateien:
  - `src/components/integrations/EditIntegrationDialog.tsx`
  - ggf. `src/components/integrations/IntegrationCard.tsx`
  - ggf. `src/components/integrations/LocationIntegrationsList.tsx`
  - Tests in `src/components/__tests__/EditIntegrationDialog.test.tsx`
  - Tests in `src/components/__tests__/LocationIntegrationsList.test.tsx`
- Wichtigster Eingriff:
  - Das unmittelbare `await onUpdate(locationIntegration.id, { config: refreshedConfig })` im Erfolgsfall ist der erste Kandidat zum Entfernen/Ersetzen.
- Erwartetes Ergebnis:
  - Kein kurzes Aufflackern mehr
  - Kein automatisches Schließen mehr
  - Token bleibt zuverlässig kopierbar

Reihenfolge der Umsetzung
1. `EditIntegrationDialog` umbauen und sofortiges `onUpdate` nach Token-Generierung entfernen
2. Reset-Logik im `useEffect` härten
3. Falls noch nötig: Dialog-Zustand aus `IntegrationCard` in `LocationIntegrationsList` hochziehen
4. Tests ergänzen
5. End-to-End prüfen
