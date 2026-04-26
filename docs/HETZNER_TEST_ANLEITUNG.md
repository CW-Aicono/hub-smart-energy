# Hetzner OCPP-Server – Test- und Update-Anleitung

> **Für absolute Anfänger geschrieben.** Du kopierst Befehle aus den grauen Kästen, fügst sie ein, drückst Enter. Das war's.

---

## Wofür ist diese Anleitung?

Wir wollen prüfen, ob dein Hetzner-OCPP-Server (`ocpp.aicono.org`) funktioniert.
Dazu machst du **zwei Tests** (dauert ca. 5 Minuten) und schickst mir das Ergebnis.

**Mache nichts anderes**, bevor du nicht beide Tests durchgeführt hast.
**Stell die Wallboxen NICHT um, bevor Test 1 grün ist.** Sonst gehen sie offline.

---

## Vorbereitung: Wie kopiere ich Befehle?

Du siehst graue Kästen mit Befehlen. So nutzt du sie:

1. **Markieren:** Mit der Maus den Text im Kasten markieren.
2. **Kopieren:** `Strg + C` (Windows) oder `Cmd + C` (Mac).
3. **Einfügen ins Terminal:** Im Terminal-Fenster `Strg + Shift + V` (Windows/Linux) oder `Cmd + V` (Mac), oder rechte Maustaste.
4. **Ausführen:** `Enter` drücken.

> Pro Kasten: immer den **kompletten Inhalt** kopieren.

---

# TEST 1 — Simulator-Test im Browser

**Ziel:** Wir testen, ob sich eine simulierte Wallbox mit dem Hetzner verbinden kann.
**Du brauchst dafür kein Terminal.** Alles passiert im Browser.

## Schritt 1.1 — App öffnen

1. Öffne deinen Browser.
2. Gehe zu: <https://hub-smart-energy.lovable.app>
3. Logge dich als **Super-Admin** ein (so wie immer).

## Schritt 1.2 — Simulator-Seite aufrufen

In der Adresszeile des Browsers anhängen:

```
/super-admin/ocpp/simulator
```

Die komplette URL sieht dann so aus:

```
https://hub-smart-energy.lovable.app/super-admin/ocpp/simulator
```

Drücke `Enter`. Es erscheint die **OCPP-Simulator-Seite**.

## Schritt 1.3 — Simulator konfigurieren

1. **Wallbox-Auswahl:** Klicke das Dropdown an und wähle **`testbox01`** aus.
   (Wenn `testbox01` nicht da ist, sag mir Bescheid — dann lege ich es nochmal an.)
2. **Server-URL:** Tippe (oder kopiere) genau diese Zeile in das Feld:

   ```
   wss://ocpp.aicono.org/
   ```

   ⚠ **Wichtig:** Mit `wss://` (zwei „s"), und mit Schrägstrich am Ende.

3. Klicke auf den Knopf **„Verbinden"** (oder „Connect").

## Schritt 1.4 — Was siehst du?

Auf der Seite erscheinen Log-Zeilen. Suche nach diesen Texten:

### ✅ Wenn TEST 1 GRÜN ist:
Du siehst nacheinander:
```
INFO  Connecting via proxy → wss://ocpp.aicono.org/testbox01
INFO  Connected (subprotocol: ocpp1.6)
```
…und es **bleibt offen** für mindestens 30 Sekunden, **kein** „Disconnected".

→ **Glückwunsch!** Hetzner funktioniert. Springe direkt zu **TEIL 3 – Wallboxen umstellen** weiter unten.

### ❌ Wenn TEST 1 ROT ist:
Du siehst:
```
INFO  Disconnected (code=1006)
```
oder einen anderen Disconnect-Text **innerhalb der ersten 5 Sekunden**.

→ **Mach jetzt TEST 2 weiter unten** und schicke mir die Ausgabe.

---

# TEST 2 — Hetzner-Server-Logs ansehen

**Ziel:** Wir lesen die Logs vom Hetzner-Server, um zu sehen, warum die Verbindung abgebrochen ist.
**Du brauchst dafür ein Terminal-Programm:**
- Windows: `Windows Terminal` oder `PowerShell` (über das Startmenü).
- Mac: `Terminal` (über Spotlight: `Cmd + Leertaste`, dann „Terminal" tippen).

## Schritt 2.1 — Auf dem Hetzner einloggen

Im Terminal eintippen (ersetze `DEINE.SERVER.IP` durch die IP deines Hetzner-Servers; falls du sie nicht weißt: in der Hetzner Cloud Console nachsehen):

```bash
ssh root@DEINE.SERVER.IP
```

→ Beim allerersten Mal fragt es: *„Are you sure you want to continue connecting (yes/no)?"* → tippe `yes` und Enter.
→ Dann fragt es nach dem Passwort. Tippe es ein (du siehst beim Tippen nichts — das ist normal). Enter.

Jetzt siehst du eine Zeile wie:
```
root@OCPP-server:~#
```

→ Du bist eingeloggt.

## Schritt 2.2 — In den OCPP-Server-Ordner wechseln

Kopiere und führe aus:

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
```

→ Wenn du jetzt eine Fehlermeldung wie *„No such file or directory"* siehst, suche den richtigen Ordner mit:

```bash
find / -name "docker-compose.yml" -path "*ocpp*" 2>/dev/null
```

→ Es kommt z. B. `/opt/ocpp-persistent-server/docker-compose.yml`. Dann nimm den Pfad **ohne** `/docker-compose.yml` und benutze:

```bash
cd /opt/ocpp-persistent-server
```

## Schritt 2.3 — Logs ansehen

Kopiere und führe aus:

```bash
docker compose logs --tail=200 ocpp
```

→ Es erscheinen viele Zeilen. **Markiere alles ab den letzten 30 Zeilen** und kopiere es.

## Schritt 2.4 — Logs an mich schicken

1. Öffne den Lovable-Chat (wo du diese Anleitung bekommen hast).
2. Schreibe: **„Hier die Hetzner-Logs:"**
3. Füge die kopierten Logs ein (`Strg + V` / `Cmd + V`).
4. Sende ab.

→ Ich analysiere die Logs **gezielt** und sage dir, welche Korrektur nötig ist. Kein Raten.

---

# TEIL 3 — Wallboxen umstellen (NUR wenn TEST 1 GRÜN war!)

⚠ **Achtung:** Mache das wirklich erst, wenn der Simulator-Test funktioniert hat. Sonst sind beide echten Wallboxen offline und keiner kann mehr laden.

## 3.1 — Welche Wallbox auf welche Adresse?

| Wallbox-Name | Wallbox-Seriennummer | Neue OCPP-Server-URL |
|---|---|---|
| Ost 1 (DUOSIDA) | `0311303102122250589` | `wss://ocpp.aicono.org/0311303102122250589` |
| Compleo Rechts | `CoCSAG773` | `wss://ocpp.aicono.org/CoCSAG773` |

## 3.2 — Wo stelle ich das ein?

Das hängt vom Wallbox-Hersteller ab. Im Allgemeinen:

**DUOSIDA:**
1. Mit dem Smartphone in das WLAN der Wallbox einloggen (steht im Handbuch).
2. Im Browser `http://192.168.4.1` aufrufen.
3. Dort gibt es ein Feld „OCPP Server URL". Trage die neue URL ein.
4. Speichern, Wallbox neu starten.

**Compleo:**
1. In das Wallbox-Webinterface einloggen (IP findest du im Compleo-Manager-Tool).
2. Unter „Backend" / „OCPP Configuration" die URL ändern.
3. Speichern, neu starten.

→ Wenn du die Schritte für deine Wallboxen **nicht** sicher weißt, **mach es nicht** und sag mir Bescheid. Dann recherchiere ich es vorher.

## 3.3 — Wie prüfe ich, ob die Umstellung geklappt hat?

1. Warte 60 Sekunden nach dem Wallbox-Neustart.
2. Im Browser zur Lovable-App, **Super Admin → Wallboxen**.
3. Prüfe, ob bei der Wallbox **„Online"** mit **grünem Punkt** steht und der **„Letzter Heartbeat"** vor weniger als 1 Minute war.

→ Wenn ja: **fertig.** Die Wallbox läuft jetzt über deinen Hetzner.
→ Wenn nicht: **stelle sofort wieder zurück** auf die alte URL (`wss://xnveugycurplszevdxtw.functions.supabase.co/ocpp-ws-proxy/<seriennummer>`) und sag mir Bescheid.

---

# Häufige Fragen

**F: Was passiert mit den schon gespeicherten Daten, wenn ich die Wallbox umstelle?**
A: Nichts. Die Datenbank ist die gleiche. Egal, ob die Wallbox über Cloud oder Hetzner geht — alle Daten landen am selben Ort.

**F: Ich habe Angst, etwas kaputtzumachen. Was ist das Schlimmste, das passieren kann?**
A: Das Schlimmste ist, dass die Wallboxen nicht mehr verbinden. Dann stellst du die alte URL wieder ein und alles ist wie vorher. Es kann **nichts** dauerhaft kaputtgehen.

**F: Muss ich auf dem Hetzner irgendetwas neu starten?**
A: Nein. Der Hetzner-Server läuft bereits. Du musst nur die Wallboxen umstellen.

**F: Was, wenn ich gar nicht über Hetzner laufen will und die Cloud-Lösung reicht?**
A: Dann **musst du gar nichts machen**. Die echten Wallboxen funktionieren bereits über die Cloud. Der Hetzner ist nur eine Alternative für mehr Kontrolle und Ausfallsicherheit.

---

# Zusammenfassung in 3 Sätzen

1. Mache **TEST 1** im Browser.
2. **Grün:** Wallboxen umstellen (Teil 3). **Rot:** **TEST 2** machen und Logs schicken.
3. Stelle die echten Wallboxen **erst nach grünem Test** um.
