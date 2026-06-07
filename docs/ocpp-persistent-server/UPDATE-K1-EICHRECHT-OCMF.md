# 🛡 K1 – OCPP-Server-Update für Eichrecht (OCMF-Belege)

Diese Anleitung beschreibt **Schritt für Schritt**, wie du den OCPP-Server auf
deinem Hetzner-Server so aktualisierst, dass er die neuen **signierten Messwerte**
(`signedMeterValue`, OCMF) der Wallboxen erkennt, an Lovable Cloud meldet und
die automatische Belegerstellung auslöst.

> Sie ist absichtlich identisch aufgebaut wie `UPDATE-ANLEITUNG.md`, damit du
> nichts Neues lernen musst. Nur die Quelldateien wurden um die OCMF-Logik
> erweitert (`ocppHandler.ts`, `backendApi.ts`).

---

## ⚠ Vorab: Was tut dieses Update?

- Beim Empfang einer **`MeterValues`** mit dem Feld `signedMeterValue` packt
  der Server die Roh-Belege (OCMF / ALFEN) und speichert sie pro Session.
- Beim **`StopTransaction`** ruft der Server zusätzlich die neue Edge Function
  **`ocmf-finalize`** in Lovable Cloud auf. Diese erzeugt den finalen
  prüfbaren Beleg (`charging_sessions.ocmf_payload`).
- **Es ändert sich nichts an den Wallbox-Einstellungen.** Auch ohne dieses
  Update funktioniert OCPP weiter; nur die Belege wären leer.

## ⚠ Keine neuen Secrets nötig

Wir verwenden den vorhandenen `SUPABASE_SERVICE_ROLE_KEY`. Du musst auf dem
Hetzner-Server **nichts an der `.env`-Datei ändern**.

---

## 1️⃣ Auf den Hetzner-Server einloggen

```bash
ssh root@DEINE.SERVER.IP
```

Ersetze `DEINE.SERVER.IP` durch die echte IP. Passwort eingeben → `Enter`.

---

## 2️⃣ In das Server-Verzeichnis wechseln

### a) Test-Umgebung (`ocpp.aicono.org`)

```bash
cd /root/ocpp-server
```

### b) Live-Umgebung (`cp.aicono.org`)

```bash
cd /root/ocpp-server-live
```

> Du musst die Schritte **für jede Umgebung einzeln** durchführen, in der du
> Eichrecht aktivieren möchtest. **Empfehlung:** Erst Test, dann Live.

---

## 3️⃣ Neueste Quelldateien holen

```bash
git pull
```

Du solltest u. a. diese geänderten Dateien sehen:

- `src/ocppHandler.ts`
- `src/backendApi.ts`

Wenn `git pull` mit „Your local changes would be overwritten" abbricht, bitte
**stoppen und melden**. Dann manuell prüfen, nicht raten.

---

## 4️⃣ Container neu bauen (nur diesen einen Service!)

> ⚠ **Niemals** `docker compose down` oder `docker compose up` ohne Service-Name.
> Das würde beide Umgebungen + Caddy gleichzeitig anfassen.

### Test-Umgebung

```bash
docker compose build ocpp
docker compose up -d ocpp
```

### Live-Umgebung

```bash
docker compose build ocpp-live
docker compose up -d ocpp-live
```

Erwartet: `Container ocpp-server  Started` (bzw. `ocpp-server-live`).

---

## 5️⃣ Logs anschauen (Verifikation)

### Test:
```bash
docker logs -f ocpp-server
```

### Live:
```bash
docker logs -f ocpp-server-live
```

Du solltest beim Start sehen:

```
[startup] OK – test charge point found: testbox01
[ocpp] listening on 8080
```

Beende die Log-Ansicht mit `Strg + C`.

---

## 6️⃣ Funktionstest

1. Eine echte Lade-Session an einer eichrechtskonformen Wallbox starten
   (z. B. ABL eMH3) und nach 1–2 Min stoppen.
2. In Lovable Cloud → **Ladepunkt-Detail → Reiter „Ladevorgänge" →** beim
   Vorgang auf **OCMF** klicken.
3. Es sollte ein **Beleg** mit Badge „Signiert & geprüft" erscheinen (oder
   „Unsigniert", falls noch kein Public-Key hinterlegt ist).

Falls nur „Noch nicht generiert" angezeigt wird:

- Im Reiter **Eichrecht** prüfen, ob „Wallbox ist eichrechtsfähig" aktiv ist
  und das **richtige Format** (OCMF / ALFEN) ausgewählt wurde.
- In den Logs (`docker logs ocpp-server`) nach `signedMeterValue` suchen:
  ```bash
  docker logs ocpp-server 2>&1 | grep -i ocmf
  ```
  Wenn dort nichts erscheint, sendet die Wallbox keine signierten Werte —
  dann liegt es nicht am Server, sondern an der Wallbox-Konfiguration.

---

## 7️⃣ Im Fehlerfall: schnell zurückrollen

```bash
git log --oneline -5
git checkout <vorheriger-commit-hash>
docker compose build ocpp        # bzw. ocpp-live
docker compose up -d ocpp        # bzw. ocpp-live
```

Damit ist der Server auf dem vorherigen Stand – **OCPP funktioniert weiter**,
nur OCMF ist dann wieder deaktiviert.

---

## Was passiert nicht?

- ❌ Wallboxen werden **nicht neu konfiguriert**.
- ❌ Bestehende Ladevorgänge werden **nicht** rückwirkend signiert.
- ❌ Es werden **keine** zusätzlichen Secrets benötigt.
- ❌ Caddy / TLS / Domain bleiben unverändert.
