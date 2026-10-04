# Update: Gemeinsames Passwort zwischen Ladeserver und Cloud

Damit sich niemand mehr als Ladepunkt ausgeben kann, bekommen Ladeserver und Cloud ein gemeinsames Passwort.
Reihenfolge unbedingt einhalten – sonst stoppt das Laden.

1. Auf dem OCPP-Server: in den Ordner des Ladeservers wechseln.
2. Neuesten Stand holen (git pull) und in die Datei `.env` diese Zeile eintragen:
   `OCPP_BACKEND_SECRET=<Passwort>`
3. Ladeserver neu bauen und starten: `docker compose up -d --build`
4. Erst danach in der Cloud das Secret `OCPP_BACKEND_SECRET` mit demselben Passwort setzen.
5. Prüfen: ein Ladepunkt meldet sich, ein Ladevorgang lässt sich starten.
