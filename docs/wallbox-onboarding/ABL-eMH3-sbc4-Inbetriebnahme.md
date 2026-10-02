# ABL eMH3 (sbc4) – Inbetriebnahme-Anleitung (OCPP 1.6J)

Diese Anleitung beschreibt Schritt für Schritt, wie eine **ABL eMH3** Wallbox
mit der Steuerplatine **sbc4** (Firmware ab `1.7.x`) an den AICONO OCPP-Server
angebunden wird.

> **Voraussetzung:** Im Super-Admin → „Ladepunkt anlegen" wurde der Ladepunkt
> bereits angelegt. Sie haben aus Schritt 3 des Assistenten:
>
> - **OCPP-ID** (z. B. `AICONO-1A2B3C4D` oder die Wallbox-Seriennummer)
> - **Backend-URL** (z. B. `wss://ocpp.aicono.org/AICONO-1A2B3C4D`)
> - **Benutzername** (= OCPP-ID)
> - **Passwort** (Basic-Auth)

---

## 1. Verbindung zur Wallbox herstellen

ABL eMH3 wird über die **ABL Configuration Software (ABL CS)** oder das
**Webinterface** konfiguriert.

### Variante A – Webinterface (empfohlen, ab sbc4 FW 1.7)

1. Wallbox per **LAN-Kabel** mit demselben Netzwerk wie Ihr Laptop verbinden.
2. IP-Adresse der Wallbox ermitteln:
   - DHCP-Lease im Router prüfen, **oder**
   - Wallbox neu starten und nach 2 Min. den Bonjour-Namen `ABL_<seriennr>.local`
     im Browser öffnen.
3. Im Browser aufrufen: `https://<IP-Wallbox>` (Zertifikatswarnung akzeptieren).
4. Login:
   - **Benutzer:** `admin`
   - **Passwort:** Werkspasswort steht auf dem Aufkleber im Gehäuse
     (oder `2detoo4ydsBuwit2` bei älteren Modellen).

### Variante B – ABL Configuration Software

1. ABL CS von [ablmobility.de](https://www.ablmobility.de) laden und installieren.
2. Wallbox per **USB-C** an den Laptop anschließen.
3. In der CS auf **„Verbinden"** klicken → Wallbox wird automatisch erkannt.

---

## 2. OCPP-Konfiguration setzen

Im Webinterface unter **„OCPP" → „OCPP 1.6J"** (bei CS: Reiter „Backend"):

| Feld                          | Wert                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| **OCPP aktiv**                | ✅ Ein                                                         |
| **OCPP-Version**              | `OCPP 1.6J` (JSON über WebSocket)                              |
| **ChargeBoxIdentity**         | `<OCPP-ID aus Assistent>` (z. B. `AICONO-1A2B3C4D`)            |
| **Backend-URL**               | `wss://ocpp.aicono.org/<OCPP-ID>`                              |
| **Authentifizierung**         | `Basic Authentication`                                         |
| **Benutzername**              | `<OCPP-ID>` (identisch zur ChargeBoxIdentity)                  |
| **Passwort**                  | `<Passwort aus Assistent>`                                     |
| **WebSocket-Ping-Intervall**  | `30` Sekunden                                                  |
| **Heartbeat-Intervall**       | `60` Sekunden                                                  |
| **MeterValues-Intervall**     | `30` Sekunden                                                  |
| **MeterValuesSampledData**    | `Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage,SoC` |
| **StopTxnSampledData**        | `Energy.Active.Import.Register`                                |
| **TLS-Zertifikat**            | „Werkszertifikat verwenden" **oder** „Selbstsigniertes erzeugen" |
| **TLS-Server-Verifikation**   | ✅ Ein (ABL akzeptiert Let's Encrypt seit FW 1.7.4)            |

> **Hinweis Server-Zertifikat:** Der AICONO-Server nutzt ein Let's Encrypt-
> Zertifikat (ISRG Root X1). ABL eMH3 ab Firmware `1.7.4` hat dieses im
> Trust-Store. Bei älterer Firmware **vorher Firmware-Update durchführen**
> oder TLS-Verifikation deaktivieren.

---

## 3. Speichern & Neustart

1. Auf **„Übernehmen"** klicken.
2. Wallbox neu starten (Button im Webinterface oder Spannung kurz trennen).
3. Nach ca. 30 Sekunden sollte die LED-Statusanzeige **dauerhaft grün** leuchten.

---

## 4. Verbindung im AICONO Super-Admin verifizieren

1. Zurück im Onboarding-Assistenten → **Schritt 3 „Verifikation"**.
2. Sobald die Wallbox sich meldet, wechselt der Status auf
   **„WebSocket verbunden ✅"** und der **Heartbeat** wird live gezählt.
3. Schritt 3 mit **„Abschließen"** beenden.

---

## 5. Fehlerbehebung

| Symptom                                | Ursache / Lösung                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| LED bleibt rot                         | Keine Internet-Verbindung. Router/Firewall prüfen (Port `443/tcp` ausgehend zu `ocpp.aicono.org`).      |
| LED gelb, kein Heartbeat               | Falsche Backend-URL oder ChargeBoxIdentity. Beide Werte müssen exakt mit dem Assistenten übereinstimmen.|
| `401 Unauthorized` im ABL-Log          | Basic-Auth-Passwort falsch. Im Assistenten neu generieren und in der Wallbox erneut eintragen.          |
| `TLS handshake failed`                 | Firmware veraltet. ABL-Firmware auf `≥ 1.7.4` aktualisieren oder TLS-Verifikation temporär deaktivieren.|
| `Unable to resolve host`               | DNS-Problem. In der Wallbox unter „Netzwerk" einen öffentlichen DNS setzen (`1.1.1.1` oder `8.8.8.8`).   |

---

**Stand:** Mai 2026 · Geprüft mit ABL eMH3 sbc4 Firmware 1.7.5
