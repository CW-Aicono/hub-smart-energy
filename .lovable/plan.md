
Ziel: Das Gateway-Onboarding so anpassen, dass es für Nicht-Techniker eindeutig und ohne MAC-/Tenant-ID-Rätsel funktioniert.

1. Onboarding-Logik fachlich bereinigen
- Die aktuelle Rolle der `tenant_id` im Add-on prüfen und vereinheitlichen.
- Da das v3-WebSocket-Onboarding bereits über `MAC + gateway_username + gateway_password` arbeitet und die Zuordnung aus der Cloud zurückkommt, soll `tenant_id` nicht mehr als manuell auszufüllender Pflichtwert wahrgenommen werden.
- Geplante Umsetzung:
  - In der Cloud-Konfigurationshilfe klar anzeigen, welche Werte wirklich manuell eingetragen werden müssen.
  - Falls `tenant_id` für den aktuellen Laufzeitpfad nicht mehr benötigt wird: aus der HA-Add-on-Konfiguration entfernen oder mindestens deutlich als „nicht manuell erforderlich / Legacy“ kennzeichnen.
  - Dadurch verschwindet die heutige Verwirrung aus Screenshot 1.

2. Tenant-ID in der Cloud-Konfigurationshilfe korrekt behandeln
- Den Dialog `HaConfigDialog.tsx` erweitern.
- Wenn `tenant_id` weiterhin technisch notwendig bleibt:
  - neue Copy-Zeile `tenant_id` ergänzen
  - mit klarer Erklärung, wo dieser Wert in Home Assistant einzutragen ist
- Wenn `tenant_id` nicht mehr nötig ist:
  - bewusst nicht anzeigen
  - stattdessen den Hinweistext im Dialog anpassen: „Für die Verbindung werden nur cloud_ws_url, MAC-Adresse, Benutzername und Passwort benötigt.“
- Ergebnis: kein Widerspruch mehr zwischen Cloud-Dialog und HA-Addon-Konfiguration.

3. MAC-Adresse vor finaler Zuordnung sichtbar machen
- Das bestehende Muster mit „unzugeordneten Geräten“ weiter ausbauen.
- In `AiconoGatewayCredentials.tsx` die Liste unzugeordneter Geräte prominenter machen:
  - MAC-Adresse klar sichtbar
  - Benutzername, letzte Meldung und ggf. lokale IP ergänzen
  - Button „Übernehmen“ beibehalten
- Zusätzlich eine laienverständliche Erklärung einbauen:
  - „Gateway zuerst im Home Assistant Add-on starten“
  - „Danach erscheint die MAC hier automatisch“
  - „Dann nur noch übernehmen und speichern“
- So muss die MAC nicht mehr manuell am Raspberry Pi ermittelt werden.

4. Optionalen Null-Fehler-Onboarding-Pfad ergänzen
- Für den AICONO-Gateway-Zuordnungsdialog eine klare Schritt-für-Schritt-Reihenfolge im UI ergänzen:
  1. Add-on in Home Assistant öffnen
  2. Benutzername und Passwort setzen
  3. Add-on speichern und starten
  4. In AICONO auf „Aktualisieren“ klicken
  5. Erkanntes Gateway aus der Liste übernehmen
- Dadurch wird die manuelle Eingabe der MAC nur noch Fallback, nicht Standard.

5. Lokale Add-on-UI als MAC-Quelle weiter absichern
- Die lokale Add-on-UI zeigt die MAC bereits im Dashboard an; diese Anzeige bleibt erhalten.
- Zusätzlich prüfen und sicherstellen, dass die MAC auch ohne abgeschlossene Cloud-Zuordnung zuverlässig im lokalen Status verfügbar bleibt.
- Falls sinnvoll, in der lokalen UI einen noch deutlich sichtbareren Copy-Block für die MAC ergänzen, damit Screenshot-/Support-Fälle einfacher werden.

6. Texte und Hinweise für Anfänger umschreiben
- Alle relevanten Texte in:
  - `HaConfigDialog.tsx`
  - `AiconoGatewayCredentials.tsx`
  - ggf. `docs/ha-addon/ui/index.html`
  so umformulieren, dass klar ist:
  - welche Werte aus AICONO kommen
  - welche Werte in Home Assistant gesetzt werden
  - welche Werte automatisch erkannt werden
  - dass die MAC normalerweise nicht mehr händisch gesucht werden muss

7. Versionierung
- Nach Umsetzung Version auf die nächste gewünschte Add-on-Version anheben.
- Betroffene Stellen:
  - `docs/ha-addon/config.yaml`
  - `docs/ha-addon/package.json`

Technische Details
- Relevante Dateien:
  - `src/components/integrations/gateway/HaConfigDialog.tsx`
  - `src/components/integrations/gateway/AiconoGatewayCredentials.tsx`
  - `docs/ha-addon/config.yaml`
  - `docs/ha-addon/index.ts`
  - `docs/ha-addon/ui/index.html`
- Bereits vorhanden:
  - lokale MAC-Anzeige im Add-on-Dashboard (`/api/status` → `mac_address`)
  - Liste unzugeordneter Geräte über `gateway-credentials?action=pending`
  - Copy/Übernehmen-Mechanik in der Cloud
- Hauptentscheidung bei der Umsetzung:
  - `tenant_id` konsequent entfernen, wenn sie im v3-Flow nicht mehr benötigt wird
  - andernfalls in beiden UIs konsistent sichtbar und erklärt machen

Erwartetes Ergebnis
- Kein Widerspruch mehr zwischen AICONO-Dialog und HA-Konfiguration
- MAC-Adresse muss im Regelfall nicht mehr manuell technisch ermittelt werden
- Zuordnung des Gateways wird für Laien deutlich einfacher und fehlersicherer
