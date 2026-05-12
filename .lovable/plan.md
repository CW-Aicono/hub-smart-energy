## Befund

Das aktuelle Log zeigt diesmal nicht primär einen PIN-/Watchdog-Fehler, sondern: Der Supervisor wartet 120 Sekunden darauf, dass auf Port `8099` etwas erreichbar wird – aber das Add-on öffnet den Port nicht rechtzeitig. Danach kommen die Ingress-Fehler `Cannot connect to host 172.30.33.1:8099`, weil schlicht kein Webserver im Container lauscht.

Der kritischste Codepunkt ist in `docs/ha-addon/index.ts`: Der lokale Webserver wird erst nach Offline-Cache-Initialisierung gestartet, danach laufen noch Cloud-/HA-Initialabfragen. Zusätzlich kann bei fehlenden Credentials der Setup-Wizard den Hauptserver ersetzen. Für Home Assistant ist das riskant, weil Ingress/Startprüfung sehr früh eine Antwort auf Port 8099 erwartet.

## Plan

1. **Port 8099 sofort beim Boot öffnen**
   - `startServer()` ganz früh in `main()` starten, bevor Cloud-, HA-, Mapping-, Automation- oder Setup-Schritte laufen.
   - Dadurch bekommt Home Assistant sofort eine Antwort und der 120s-Starttimeout wird verhindert.

2. **Health-Endpoint maximal robust machen**
   - `/api/status` darf keine langsamen oder potenziell blockierenden Operationen enthalten.
   - Die MAC-Adresse dort nicht live über `/network/info` holen, sondern nur gecacht/fallbackfähig ausgeben.
   - Ziel: `/api/status` antwortet auch dann mit `200`, wenn Cloud, HA API, PIN oder MAC-Ermittlung gerade Probleme haben.

3. **Setup-/Credentials-Fall Ingress-tauglich machen**
   - Wenn `gateway_username` oder `gateway_password` fehlen, nicht in einen separaten Wizard blockieren, der den Bootfluss übernimmt.
   - Stattdessen soll der bereits gestartete Server weiterlaufen und `/api/status` `credentials_configured: false` melden; die UI kann Setup/Login anzeigen.
   - So startet das Add-on auch bei kaputter/alter Konfiguration und bleibt reparierbar.

4. **Startphase entkoppeln**
   - Initiale Cloud-/HA-Aufrufe (`checkCloudConnectivity`, `fetchHAVersion`, `fetchMeterMappings`, `syncAutomationsFromCloud`) nicht mehr vor “Gateway läuft” blockierend erzwingen.
   - Diese Aufgaben nach Serverstart im Hintergrund ausführen und Fehler nur loggen, nicht den Prozess beenden.

5. **Version synchronisieren**
   - `package.json` steht noch auf `3.1.4`, `config.yaml` bereits auf `3.2.0`. Das sollte vereinheitlicht werden, damit HA nicht weiterhin alte 3.1.4-Builds zieht.

6. **Kurztest ergänzen/ausführen**
   - Minimal prüfen, dass `/api/status` ohne PIN/Cookie und auch ohne Credentials erreichbar bleibt.
   - Keine Änderung an der Cloud-Datenbank nötig.

## Sofort-Hinweis für dich

Solange das Update noch nicht installiert ist: Die Meldung `Cannot connect to host 172.30.33.1:8099` bedeutet, dass das Add-on intern gar keinen Webserver geöffnet hat. Deshalb helfen PIN deaktivieren oder Watchdog ausschalten allein nicht zuverlässig.