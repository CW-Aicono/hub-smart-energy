# Hetzner-Abuse-Report – Diagnose-Runbook

> **Für absolute Anfänger geschrieben.** Du kopierst Befehle aus den grauen Kästen, fügst sie ins Terminal ein, drückst Enter und liest ab, was das Ergebnis bedeutet.

---

## Worum geht es?

Hetzner (bzw. deren Partner „Skhron") hat gemeldet: Vom OCPP-Server unter der IP `178.105.45.225` (= `ocpp.aicono.org`) gingen mehrere unerwünschte TCP-Verbindungen zu einer fremden Sensor-IP raus — auf typischen **SSH-Ports** (22, 222, 2022, 2222). Dein OCPP-Server hat keinen legitimen Grund, so etwas zu tun. Das deutet darauf hin, dass entweder ein **Angreifer** auf dem Server eingebrochen ist und ihn als Sprungbrett benutzt, oder ein **fremdes Programm/Container** dort läuft.

**Dieses Runbook macht nur eine Sache: prüfen.** Es verändert nichts am System (bis auf harmlose Lese-Befehle). Am Ende weißt du: sauber oder kompromittiert.

⚠ **Wichtig:** Solange nichts bereinigt ist, **die OCPP-Wallboxen NICHT umstellen**. Falls der Server neu aufgesetzt werden muss, ändert sich die IP eventuell nicht — die DNS-Adresse `ocpp.aicono.org` bleibt gleich.

---

## Vorbereitung — Auf dem Hetzner einloggen

Falls du unsicher bist, wie das geht, steht der SSH-Login-Schritt bereits in `docs/HETZNER_TEST_ANLEITUNG.md` (Schritt 2.1). Du brauchst am Ende diese Zeile im Terminal:

```
root@OCPP-server:~#
```

Erst wenn du sie siehst, geht's hier weiter.

---

# Schritt 1 — Läuft gerade ein SSH-Scan raus?

Kopiere und führe aus:

```bash
ss -tunap | grep -E ':(22|222|2022|2222) ' | grep -v 'LISTEN'
```

### ✅ Erwartung
**Keine Ausgabe** (leer). Alles gut, in diesem Moment scannt niemand.

### ❌ Auffällig
Zeilen mit `ESTAB` und einer fremden IP als Ziel-Port 22 / 222 / 2022 / 2222 → **es läuft gerade ein Scan**. Merk dir die Ausgabe und mach mit Schritt 2 weiter.

---

# Schritt 2 — Verdächtige Prozesse

## 2a — Nach bekannten Scanner-/Miner-Namen suchen

```bash
ps auxf | grep -iE 'masscan|zmap|pnscan|sshscan|kinsing|xmrig|kdevtmpfsi|xmr|monero|perl.*/tmp|python.*/tmp'
```

### ✅ Erwartung
Nur die Zeile mit `grep -iE ...` selbst.

### ❌ Auffällig
Jeder andere Treffer ist verdächtig. Kopiere die komplette Zeile.

## 2b — Kompletten Prozessbaum überfliegen

```bash
ps auxf
```

Suche nach:
- Prozessen, die aus `/tmp`, `/var/tmp`, `/dev/shm` oder `/root/.something` laufen.
- Prozessen mit CPU-Auslastung > 50 %, die du nicht kennst.
- Merkwürdigen einzelnen Buchstaben-Namen wie `./a`, `./b`, `./xm`.

Alles Verdächtige notieren.

---

# Schritt 3 — Wer hat sich per SSH eingeloggt?

## 3a — Erfolgreiche Logins

```bash
last -Fa | head -30
```

### ✅ Erwartung
Nur deine eigenen IPs / bekannten Admin-IPs.

### ❌ Auffällig
Fremde IPs mit `still logged in` oder erfolgreichen Logins zu ungewöhnlichen Uhrzeiten.

## 3b — Fehlgeschlagene Login-Versuche

```bash
lastb | head -30
```

### ✅ Erwartung
Egal wie viele — das ist normales Internet-Grundrauschen. **Wichtig ist nur: kein anschließend erfolgreicher Login von derselben fremden IP** (das prüfst du mit 3a).

## 3c — SSH-Journal der letzten 14 Tage

```bash
journalctl -u ssh --since "14 days ago" | grep -iE 'accepted|invalid|failed' | tail -80
```

Suche nach `Accepted password for root from <fremde IP>` oder `Accepted publickey for root from <fremde IP>` — falls dort eine IP steht, die nicht zu dir oder deinem Team gehört, ist das ein starkes Warnsignal.

---

# Schritt 4 — Cronjobs & Timer

Ein häufiger Trick: Angreifer setzen einen Cronjob, der ihr Schadprogramm alle paar Minuten neu startet.

## 4a — Root-Cronjobs

```bash
crontab -l
```

## 4b — Alle User-Crontabs

```bash
for u in $(cut -f1 -d: /etc/passwd); do echo "== $u =="; crontab -u $u -l 2>/dev/null; done
```

## 4c — System-Cron-Verzeichnisse

```bash
ls -la /etc/cron.d/ /etc/cron.hourly/ /etc/cron.daily/ /var/spool/cron/ 2>/dev/null
```

## 4d — systemd-Timer

```bash
systemctl list-timers --all
```

### ✅ Erwartung
Nur bekannte System-Einträge (`apt-daily`, `logrotate`, `certbot`, `docker`, evtl. Backup-Scripts). Alles andere → verdächtig, insbesondere Zeilen mit `curl`, `wget`, `bash -c`, Pfaden aus `/tmp` oder Base64-Strings.

---

# Schritt 5 — Docker-Container & Images

Der OCPP-Server soll ausschließlich diese Container laufen haben:

| Erlaubt | Zweck |
|---|---|
| `ocpp` (bzw. `ocpp-server`) | unser Node-OCPP-Backend |
| `ocpp-caddy` | HTTPS/WSS-Proxy |
| `ocpp-simulator` *(optional)* | nur wenn du den Simulator laufen lässt |

## 5a — Laufende und gestoppte Container

```bash
docker ps -a
```

## 5b — Lokal vorhandene Images

```bash
docker images
```

### ✅ Erwartung
Nur die drei oben genannten Container. Bei den Images: `caddy`, `node:20-alpine` (Build-Basis) sowie deine selbstgebauten `docs-ocpp-*`-Images.

### ❌ Auffällig
Alles andere (z. B. `alpine:latest` mit Startbefehl `sh`, ein Container mit kryptischem Namen, Images wie `oracle-linux`, `xmrig`, `monero`, `nginx:latest` obwohl ihr Caddy nutzt) → **hochverdächtig**.

## 5c — Verdächtigen Container inspizieren

Ersetze `<name>` durch den Container-Namen aus 5a:

```bash
docker inspect <name> | grep -iE '"cmd"|"entrypoint"|"image"'
```

---

# Schritt 6 — Auth-Dateien auf Manipulation prüfen

## 6a — SSH-Keys für root

```bash
ls -la /root/.ssh/authorized_keys && echo '---' && cat /root/.ssh/authorized_keys
```

### ✅ Erwartung
Nur Public-Keys, die du selbst hinterlegt hast (Kommentar am Zeilenende erkennbar, z. B. `admin@laptop`).

### ❌ Auffällig
Zusätzliche Zeilen mit unbekanntem Kommentar (`root@kali`, `mdrfckr`, chinesische Zeichen, gar kein Kommentar). **Jeder unbekannte Key = Vollzugriff für Fremde.**

## 6b — Zusätzliche Benutzer?

```bash
getent passwd | awk -F: '$3>=1000 {print}'
```

### ✅ Erwartung
Nur bekannte Admin-User, oft nur einer.

### ❌ Auffällig
Namen wie `ftpuser`, `test`, `mysql1`, `daemon2`, `guest`.

## 6c — Wurden Auth-Dateien kürzlich verändert?

```bash
stat /etc/passwd /etc/shadow /etc/ssh/sshd_config /root/.ssh/authorized_keys 2>/dev/null | grep -E 'File|Modify'
```

Vergleiche die `Modify:`-Zeiten. Alles, was **nach deinem letzten Login und ohne dass du etwas geändert hast** verändert wurde, ist ein starkes Warnsignal.

---

# Schritt 7 — Auswertung: sauber oder kompromittiert?

## Fall A — Alles ✅
Wenn **jeder Schritt oben sauber war**:
- Vermutlich ein einmaliger, bereits beendeter Scan (oder Fehlalarm).
- Trotzdem empfehlenswert: Server-Härtung planen (SSH nur per Key, Root-Login aus, `fail2ban`, Firewall nur auf Ports 80/443/22 mit Admin-IP-Whitelist). Sag mir Bescheid, wenn du dazu ein separates Hardening-Doku willst.
- **Antwort an Hetzner:** siehe unten (Baustein 1).

## Fall B — Auch nur EIN Punkt ❌
Wenn irgendetwas oben verdächtig war (unbekannter Prozess, unbekannter Container, fremder SSH-Key, fremder User, aktiver Scan-Traffic, mysteriöser Cronjob):

**Der Server gilt als kompromittiert.** Nicht versuchen zu reinigen — Angreifer verstecken Persistenz-Mechanismen an mehreren Stellen. Vorgehen:

1. **Neuen Hetzner-Server bestellen** (gleiche Größe reicht).
2. Auf dem neuen Server frisch deployen nach `docs/ocpp-persistent-server/README.md` (Docker Compose + Caddy + `.env`).
3. Bei der Neuinstallation direkt härten: nur SSH-Key-Login, kein Root-Passwort, Firewall (UFW) auf 22 (nur Admin-IP), 80, 443.
4. DNS `ocpp.aicono.org` auf die IP des neuen Servers zeigen lassen.
5. Alte Instanz **komplett löschen**, nicht nur herunterfahren.
6. Wallboxen brauchen keine Umkonfiguration — sie hängen an der DNS-Adresse.

Sag mir Bescheid, wenn du den Neuaufbau brauchst — dazu gibt es dann einen eigenen Plan.

---

# Antwort an Hetzner / Skhron

## Baustein 1 — bei sauberem Befund (Deutsch)

> Hallo,
>
> vielen Dank für den Hinweis. Wir haben den betroffenen Server (`178.105.45.225`, unser OCPP-Backend `ocpp.aicono.org`) vollständig auditiert: aktive Verbindungen, laufende Prozesse, SSH-Login-Historie der letzten 14 Tage, Cronjobs, systemd-Timer, Docker-Container/Images sowie `authorized_keys` und System-Auth-Dateien. Wir konnten keinen unautorisierten Zugriff, keine fremden Prozesse und keine unbekannten Container feststellen. Der gemeldete Scan-Traffic wurde nicht durch von uns eingesetzte Software verursacht und lässt sich aktuell nicht reproduzieren. Wir haben zusätzlich präventiv die SSH-Härtung überprüft und werden das Monitoring erweitern. Bitte lassen Sie uns wissen, falls weitere Vorfälle auftreten.
>
> Viele Grüße

## Baustein 1 — bei sauberem Befund (Englisch)

> Hello,
>
> Thank you for the notice. We have fully audited the affected server (`178.105.45.225`, our OCPP backend `ocpp.aicono.org`): active connections, running processes, SSH login history for the past 14 days, cron jobs, systemd timers, Docker containers/images as well as `authorized_keys` and system auth files. We could not identify any unauthorized access, foreign processes, or unknown containers. The reported scan traffic was not caused by any software deployed by us and is currently not reproducible. We have additionally reviewed the SSH hardening and will extend our monitoring. Please let us know if further incidents occur.
>
> Best regards

## Baustein 2 — bei kompromittiertem Befund (Deutsch)

> Hallo,
>
> vielen Dank für den Hinweis. Bei der Untersuchung des betroffenen Servers (`178.105.45.225`) haben wir Anzeichen für einen unautorisierten Zugriff festgestellt (Details: [hier kurz einfügen — z. B. „unbekannter SSH-Public-Key in /root/.ssh/authorized_keys" oder „unbekannter Docker-Container mit Scanner-Prozess"]). Wir haben den betroffenen Server außer Betrieb genommen und setzen die Umgebung auf einer neuen Instanz sauber neu auf, inklusive gehärteter SSH-Konfiguration (Key-only-Login, Firewall-Whitelisting). Weitere Scan-Aktivität von dieser IP ist nicht mehr zu erwarten.
>
> Viele Grüße

## Baustein 2 — bei kompromittiertem Befund (Englisch)

> Hello,
>
> Thank you for the notice. While investigating the affected server (`178.105.45.225`) we identified signs of unauthorized access (details: [insert short summary — e.g. "unknown SSH public key in /root/.ssh/authorized_keys" or "unknown Docker container running a scanner process"]). We have taken the affected server offline and are rebuilding the environment on a fresh instance with hardened SSH configuration (key-only login, firewall whitelisting). No further scan activity from this IP address is to be expected.
>
> Best regards

---

# Was dieses Runbook NICHT macht

- Es **bereinigt nichts**. Wenn etwas gefunden wird → Neuaufsetzen, nicht flicken.
- Es **härtet nichts automatisch** (fail2ban, UFW, Key-only-SSH). Das ist ein separates Dokument.
- Es **verändert die Lovable-App nicht**. Der Fehler liegt auf Server-Ebene, nicht in eurem Code.
- Alle Befehle bis auf `docker inspect` sind **reine Lesebefehle**. Nichts wird verändert oder gelöscht.

---

# Zusammenfassung in 3 Sätzen

1. Auf den Hetzner einloggen und Schritt 1–6 der Reihe nach durchgehen.
2. Alle Schritte ✅ → Antwort-Baustein 1 an Hetzner senden.
3. Auch nur einer ❌ → Server als kompromittiert behandeln, neu aufsetzen, Antwort-Baustein 2 senden.
