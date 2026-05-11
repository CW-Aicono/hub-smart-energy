# AICONO Hub – Erstinstallation für Anfänger

> **Ziel**: In ca. 15 Minuten ein neues AICONO Hub einrichten, ohne dass
> du irgendetwas mit der Kommandozeile, GitHub oder Programmierung zu tun hast.

---

## Du brauchst nur das hier

| Was | Beispiel | Wofür |
|-----|----------|-------|
| Eine Hardware aus unserer Liste | AICONO Hub Mini, Industrial oder Home | Das Gerät, auf dem das Hub läuft |
| Einen leeren USB-Stick (≥ 8 GB) | beliebige Marke | Zum Übertragen des Images |
| Ein Stromkabel + Netzwerkkabel | wie ein normaler Router | Strom + Internet |
| Den **8-stelligen Pairing-Code** | `ABCD-1234` | Bekommst du aus dem AICONO Backend |
| Einen normalen PC oder Mac | egal welches Betriebssystem | Nur einmalig für das Beschreiben des Sticks |

> **Du brauchst kein** GitHub-Konto, keine Programmierkenntnisse,
> keinen Befehlszeilen-Zauber. Wirklich nicht.

---

## Schritt 1: Den Pairing-Code holen (1 Minute)

1. Im AICONO Backend einloggen.
2. Links auf **Integrationen** klicken.
3. Reiter **AICONO Hub** öffnen.
4. Auf **„Neuer Token"** klicken.
   - Optional kannst du gleich eine Liegenschaft auswählen –
     dann ordnet sich das Hub später automatisch zu.
5. Es erscheint ein Code im Format **`ABCD-1234`**. Diesen Code irgendwo
   notieren (oder das Browserfenster offen lassen).

> Der Code ist 7 Tage gültig und kann nur **ein einziges Mal** verwendet werden.

---

## Schritt 2: Das Hub-Image herunterladen (2 Minuten)

Direkt unter dem Pairing-Code findest du den Bereich
**„AICONO Hub Image"**.

1. Hardware-Variante auswählen:
   - **x86_64** → wenn du einen Mini-PC hast (Intel/AMD).
   - **aarch64** → wenn du HA Yellow, HA Green oder einen Raspberry Pi 5 hast.
2. Auf **„Image herunterladen"** klicken.
3. Eine Datei mit der Endung `.img.xz` (ca. 600 MB) lädt herunter.

---

## Schritt 3: Den USB-Stick beschreiben (5 Minuten)

Das machst du mit einem kostenlosen, offiziellen Programm namens
**Balena Etcher** oder dem **Raspberry Pi Imager**. Beide funktionieren
auf Windows, macOS und Linux gleich.

1. Programm hier herunterladen:
   - **Balena Etcher**: https://etcher.balena.io
   - **Raspberry Pi Imager**: https://www.raspberrypi.com/software/
2. Programm öffnen.
3. **„Image auswählen"** → die `.img.xz`-Datei aus Schritt 2 wählen.
   - Du musst die Datei **nicht** manuell entpacken, das macht das Tool
     automatisch.
4. **„Ziel auswählen"** → deinen USB-Stick wählen.
   > ⚠️ Doppelt prüfen, dass es wirklich der richtige Stick ist –
   > der wird komplett überschrieben!
5. **„Flash!"** klicken und warten (~3–5 Minuten).
6. Wenn fertig: USB-Stick herausziehen.

---

## Schritt 4: Hardware starten (3 Minuten)

### Bei einem Mini-PC oder Industrial-PC:

1. USB-Stick einstecken.
2. Netzwerkkabel anschließen (an deinen Router/Switch).
3. Stromkabel anschließen.
4. Beim ersten Start ggf. **F12 / F11 / F2** drücken (je nach Hersteller),
   um vom USB-Stick zu booten – meistens passiert das aber automatisch.
5. Das Gerät installiert sich selbst auf seine interne Festplatte.
   Das dauert 5–10 Minuten und passiert komplett von alleine –
   einfach warten, bis die LEDs ruhig blinken.

### Bei HA Green, HA Yellow oder Raspberry Pi 5:

1. SD-Karte oder eMMC mit dem Image beschreiben (statt USB-Stick).
2. SD-Karte einstecken bzw. eMMC anschließen.
3. Netzwerkkabel + Strom anschließen.
4. Fertig – die Hardware bootet direkt von der Karte.

---

## Schritt 5: Pairing abschließen (2 Minuten)

Sobald das Hub läuft, erreichst du es im LAN unter:

🔗 **http://aicono.local:8099/setup**

> Funktioniert das nicht (manche Windows-Versionen mögen `.local` nicht):
> Schau in deinem Router nach, welche IP-Adresse das Gerät bekommen hat
> (z. B. `192.168.1.42`) und öffne dann `http://192.168.1.42:8099/setup`.

1. Eine schlichte Eingabeseite öffnet sich.
2. Den **`ABCD-1234`**-Code aus Schritt 1 eintippen.
3. Auf **„Hub verbinden"** klicken.
4. Nach ein paar Sekunden steht da **„✔ Verbunden – Hub startet neu …"**.
5. Das Hub startet sich einmal von selbst neu (~30 Sekunden).

**Fertig.** 🎉 Im AICONO Backend siehst du das Hub jetzt unter
**Integrationen → Gateways** als *online*. Datenpunkte werden ab jetzt
automatisch übertragen.

---

## Was, wenn etwas nicht klappt?

| Problem | Lösung |
|---------|--------|
| `aicono.local` öffnet nicht | Statt mDNS-Name die IP-Adresse aus dem Router nutzen. |
| „Code ungültig" | Code abgelaufen (7 Tage)? Im Backend einen neuen erzeugen. |
| Setup-Seite zeigt sich nicht | Hat das Hub Strom + Netzwerk? LEDs am Gerät leuchten? |
| Falsches Image heruntergeladen | Im Backend nochmals die richtige Variante (x86_64 / aarch64) wählen. |
| Hub erscheint nicht im Backend | Pairing nochmals durchführen – der Code wird beim Pairing einmalig „verbraucht". |

Wenn nichts hilft: Eine kurze Mail an **support@aicono.org** mit
einem Foto des Geräts und der Seriennummer reicht.

---

## Wie kommt das Image überhaupt aufs Hub? (für Neugierige)

Du musst das **nicht** wissen, aber für die Technik-Interessierten in Kurzform:

1. AICONO baut das Image automatisch in GitHub Actions
   (Workflow `build-image.yml` in diesem Repo).
2. Der Workflow lädt das offizielle Home Assistant OS,
   kopiert unser Add-on hinein und packt das Ganze wieder zusammen.
3. Das Ergebnis liegt als **GitHub Release** im Repo
   `CW-Aicono/aicono-os`.
4. Wenn du im Backend auf „Image herunterladen" klickst, holt das
   Backend kurz eine signierte URL und du bekommst die Datei direkt.

So bleiben deine Geräte immer auf dem aktuellen Stand –
und du musst dich um nichts kümmern.
