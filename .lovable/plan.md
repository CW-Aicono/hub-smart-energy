# Tiefenrecherche: AICONO White-Label-Image auf Basis Home Assistant

## Kurze, ehrliche Antwort

**Nein – ein zu 100 % „echtes" White-Label von Home Assistant (HA) als auslieferbares AICONO-Image können wir nicht seriös garantieren.**

Technisch ist sehr viel möglich (Logo, Farben, Domain, vorinstalliertes Add-on, eigenes Image für SD-Karte und x86-Industrie-PC). Rechtlich und betrieblich gibt es aber harte Grenzen, die ein „echtes" White-Label (Endkunde sieht *nichts* von Home Assistant) unsicher machen.

Wir sollten deshalb klar trennen zwischen:

1. **Was sicher geht** (empfohlen, produktionsreif)
2. **Was technisch geht, aber rechtlich grau ist** (Risiko)
3. **Was nicht geht / sich nicht lohnt**

---

## 1. Was sicher und produktionsreif geht

Das ist der Weg, den wir als „AICONO Gateway" verkaufen können, ohne Try & Error:

- **Offizielles HAOS-Image** (Home Assistant Operating System) als Basis, unverändert.
- **Eigenes Repository `CW-Aicono/ha-addons`** mit dem AICONO-EMS-Gateway-Add-on (haben wir bereits).
- **Vorkonfiguriertes Image bauen** über den offiziellen `home-assistant/operating-system`-Build (Buildroot, Apache-2.0-Lizenz) – inklusive:
  - vorinstalliertem AICONO-Add-on,
  - vorhinterlegtem Repository,
  - Auto-Start + Auto-Update des Add-ons,
  - eigenem Hostname (`aicono.local`),
  - eigenem AICONO-Branding **im Add-on-Frontend** (Ingress-UI, Logo, Farben, Texte → bereits umgesetzt).
- **Auslieferung** als `.img.xz` für:
  - Raspberry Pi (SD-Karte / SSD),
  - Generic x86-64 (Industrie-PC, NUC, Mini-PC).
- **Flash-Tool**: Raspberry Pi Imager oder Balena Etcher – beides für Endkunden geeignet.
- **Onboarding**: HA-Standard-Onboarding (Benutzer anlegen) → danach öffnet sich automatisch die AICONO-Oberfläche im Ingress.

Bewertung: **Funktioniert zuverlässig, ist lizenzkonform (Apache 2.0), skaliert auf Industrie-PCs.**
Einschränkung: Der Endkunde sieht beim *ersten* Start kurz „Home Assistant" (Onboarding-Screen, Setup-Wizard, Footer).

---

## 2. Was technisch geht, aber rechtlich heikel ist

Ein „echtes" White-Label, bei dem der Endkunde *nirgends* mehr „Home Assistant" sieht, würde bedeuten:

- HAOS forken,
- alle Logos, Texte, Markennamen in Frontend, Supervisor, Onboarding, Dokumentation, About-Dialogen ersetzen,
- eigenes Branding in der Polymer/Lit-Weboberfläche kompilieren,
- eigene Update-Channels betreiben.

**Lizenz (Apache 2.0):** Das *Forken und Umlabeln* des Codes ist erlaubt.

**Markenrecht – das ist der Knackpunkt:**

- „Home Assistant" und das Logo sind Marken der **Open Home Foundation / Nabu Casa**.
- Apache 2.0 gewährt **keine** Markenrechte (Section 6 der Lizenz).
- Es gibt **keine offizielle Whitelabel-/OEM-Lizenz** für Home Assistant. Kommerzielle Partner (z. B. Apollo Automation, HomeAssistant Green, Yellow) verkaufen **Hardware mit HA**, nicht „eigene Marke statt HA".
- Wer HA umlabelt und unter eigener Marke vertreibt, riskiert eine markenrechtliche Abmahnung durch die Open Home Foundation.
- Verschärfend: Der Supervisor lädt regelmäßig Updates, UI-Strings und Brand-Assets aus offiziellen HA-Quellen nach – ein dauerhaftes, sauberes Umlabeln erfordert eigenen Update-Server und permanente Pflege bei jedem HA-Release (alle ~4 Wochen).

Bewertung: **Technisch machbar, aber kein „Image bauen und fertig" – es ist ein eigenes Produkt mit eigener Build-Pipeline, eigenem Update-Channel, dauerhafter Wartung und rechtlichem Restrisiko.** Das können wir nicht zu 100 % als „zuverlässig" zusichern.

---

## 3. Was sich nicht lohnt

- Eigener HAOS-Fork **nur** wegen Logo-Tausch im Onboarding-Screen.
- Eine reine Skript-Lösung „nach dem ersten Boot Logos überschreiben" – wird bei jedem HA-Update wieder überschrieben.
- Versuche, den Supervisor-Login oder das Onboarding komplett zu entfernen – HA verweigert dann Updates und Add-on-Store-Funktion.

---

## Empfehlung

**Variante A („Powered by Home Assistant", produktionsreif – empfohlen):**

- AICONO als sichtbare Hauptmarke (Hostname, Add-on-Ingress, Dokumentation, Verpackung).
- Home Assistant als technische Basis bleibt sichtbar (Onboarding, Footer „powered by HA").
- Wir liefern: vorgefertigtes Image (Pi + x86), vorinstalliertes Add-on, Auto-Start in AICONO-UI nach Login.
- Lizenz- und markenrechtlich sauber, langfristig wartbar, kein Eigenbau-Update-Channel nötig.

**Variante B (Vollständiges White-Label):**

- Nur sinnvoll, wenn ein juristisch geprüfter Lizenz- oder Partnervertrag mit Nabu Casa / Open Home Foundation existiert.
- Sonst nicht empfehlenswert – das ist genau das „Try & Error", das du vermeiden willst.

---

## Technische Details (für die Umsetzung von Variante A)

Build-Komponenten:

- `home-assistant/operating-system` (Buildroot) → liefert `haos_rpi*-XX.X.img.xz` und `haos_generic-x86-64-XX.X.img.xz`.
- `home-assistant/builder` → baut Add-on-Container.
- Eigenes Overlay in `buildroot-external/rootfs-overlay/` für:
  - `/etc/hostname` → `aicono`,
  - vorinstallierte Repository-Definition unter `/usr/share/hassio/addons/git/`,
  - First-Boot-Script, das das AICONO-Add-on automatisch installiert und startet.
- GitHub Actions Workflow, der pro HAOS-Release (z. B. 13.x, 14.x) ein AICONO-Image baut und als Release-Asset bereitstellt.

Auslieferung:

- `aicono-gateway-<version>-rpi5.img.xz`
- `aicono-gateway-<version>-x86_64.img.xz`
- Anleitung (laienverständlich): Raspberry Pi Imager → Image auswählen → flashen → booten → `http://aicono.local:8123` → Benutzer anlegen → fertig.

Wartung:

- Bei jedem HAOS-Release neues AICONO-Image bauen (CI).
- Add-on-Updates laufen unabhängig über das `CW-Aicono/ha-addons`-Repository – kein neues Image nötig.

---

## Entscheidung, die wir brauchen

Bitte wähle den Weg, bevor wir weiterbauen:

- **A**: „Powered by Home Assistant" – AICONO-Image mit vorinstalliertem Add-on, sichtbare HA-Basis. Sicher, schnell, wartbar.
- **B**: Vollständiges White-Label – nur mit vorheriger rechtlicher Klärung mit Nabu Casa.
- **C**: Image-Idee verwerfen, beim reinen Add-on-Vertrieb über das HA-Repository bleiben.
