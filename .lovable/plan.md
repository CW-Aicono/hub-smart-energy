
## Ziel
Wiederherstellung der Datenanlieferung der drei Loxone-Miniserver. Root Cause ist mit hoher Wahrscheinlichkeit eine Loxone-seitige Änderung (Cloud-Routing oder Auto-Firmware-Update um 20:30), durch die `/data/LoxAPP3.json` per **HTTP Basic Auth** über den Cloud-Tunnel mit **404** statt 401 quittiert wird.

## Schritt 1 – Live-Diagnose (vor jedem Fix)
Edge-Function `loxone-api` mit bestehender Konfiguration testen, Antwort und Header inspizieren:

- Aufruf der `test`-Action (`/jdev/cfg/api`) für eine `location_integration_id` per `curl_edge_functions`. Liefert sie 200 → Basic Auth funktioniert grundsätzlich, dann ist nur der Strukturpfad betroffen. Liefert sie ebenfalls 404/401 → die Cloud-Route wurde komplett umgestellt.
- Direkter Test gegen `http://dns.loxonecloud.com/{serial}` und gegen `https://{serial}.dns.loxonecloud.com/data/LoxAPP3.json` mit den hinterlegten Credentials, um zu sehen, ob der Server tatsächlich 404 (Pfad weg) oder 401 (Auth-Modus geändert) liefert.
- Prüfen, ob die Firmware-Versionen der drei Miniserver heute Abend gewechselt haben (über `loxone-api` Action `getVersion`, sobald sie wieder antwortet, bzw. über das letzte gespeicherte `firmware_version`, falls vorhanden).

## Schritt 2 – Sofort-Fix: Token-Auth implementieren
Loxone unterstützt seit Firmware 9 den **Token-basierten Auth-Flow** (`/jdev/sys/getkey2/{user}` → SHA1/SHA256-Hash → `/jdev/sys/gettoken/...`). Der Cloud-Reverse-Proxy lehnt Basic Auth in neueren Stufen ab; Token-Auth wird weiterhin bedient.

Konkret in `supabase/functions/loxone-api/index.ts`:

1. Helper `getLoxoneToken(baseUrl, user, password)` ergänzen, der den Token-Handshake durchführt und `{token, key, hashAlg}` für 1 h cached (KV-Tabelle `loxone_token_cache` o. Ä.; reicht eine In-Memory-Map pro Function-Instance + DB-Fallback).
2. Strukturabruf umstellen auf `GET {baseUrl}/data/LoxAPP3.json?autht={hash}&user={user}` (URL-Token-Auth) statt `Authorization: Basic …`. Gleiches Schema für `/jdev/sps/io/...` und `/jdev/sys/...`.
3. Bei 401 automatisch Token verwerfen + neu holen, bei 404 weiterhin Fehler werfen (echtes Problem).
4. Basic Auth als Fallback behalten (für ältere Firmware), aber Token-Pfad zuerst probieren.

## Schritt 3 – Resilienz & Beobachtbarkeit
- **Throttling der Fehler-Logs**: Aktuell entsteht pro Miniserver minütlich ein Eintrag in `integration_errors`. Wenn derselbe Fehler bereits in den letzten 30 min für dieselbe Integration existiert, nicht erneut speichern (Tabelle wächst sonst stark).
- **Sync-Status-Banner** im UI: Zeigen, dass der Cloud-Pfad nicht erreichbar ist und ggf. Token-Reauth empfohlen wird.
- Optionaler **Local-Mode-Hinweis**: Wenn ein AICONO-Hub vor Ort läuft, kann die lokale IP statt Cloud-DNS verwendet werden – das umgeht das Cloud-Routing komplett. Im EditDialog der Integration ein Feld „Lokale IP (optional)" anbieten und in `resolveLoxoneCloudURL` bevorzugen.

## Schritt 4 – Validierung
- Nach Deploy `getSensors` für jede der 5 `location_integration_id`s antriggern und prüfen, dass `meter_power_readings` wieder Einträge bekommen.
- `integration_errors` der letzten Stunde löschen/archivieren, damit das Tasks-Dashboard wieder sauber ist (auto-resolve-Hook greift, sobald sync_status = success).

## Technische Details
- Betroffene Dateien: `supabase/functions/loxone-api/index.ts` (Token-Helper + alle 5 Stellen mit `LoxAPP3.json`), evtl. neue Migration für `loxone_token_cache`.
- Keine Datenbank-Schema-Änderungen am Tenant-Modell nötig.
- Migration kompatibel mit Multi-Tenancy-RLS (Cache nur Service-Role-Zugriff).

## Risiken / Offene Fragen
- Falls `test`-Action in Schritt 1 ebenfalls 404 liefert, ist der gesamte Cloud-HTTP-Pfad blockiert; dann hilft auch Token-Auth nicht und wir müssen auf **WebSocket-Auth über `lxcommunicator`** ausweichen (bereits im Code vorhanden für andere Pfade). Das wäre ein größerer Umbau – Entscheidung erst nach Diagnose.
- Vor dem Umbau bitte einmal prüfen, ob nicht schlicht das Loxone-Cloud-Abo eines Standorts ausgelaufen ist (zeigt sich häufig ebenfalls als 404 auf dem Cloud-Tunnel).
