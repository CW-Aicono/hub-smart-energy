
# Plan: Diagnose-Runbook zum Hetzner-Abuse-Report

## Ziel

Ein neues Markdown-Dokument, das Schritt für Schritt (kopierbare SSH-Befehle, keine Vorkenntnisse) prüft, ob der OCPP-Server bei Hetzner (`178.105.45.225` / `ocpp.aicono.org`) kompromittiert wurde. Stilistisch am bestehenden `docs/HETZNER_TEST_ANLEITUNG.md` orientiert (nummerierte Schritte, graue Kopier-Kästen, ✅/❌-Blöcke, „Was tue ich, wenn…").

## Neue Datei

`docs/ocpp-persistent-server/ABUSE_REPORT_DIAGNOSE.md`

## Aufbau des Dokuments

1. **Kontext in 3 Sätzen** — was Hetzner/Skhron gemeldet hat, warum das ernst ist, was das Runbook leistet (Diagnose, noch keine Bereinigung).
2. **Vorbereitung** — SSH-Login auf den Server (Verweis auf die bestehende Anleitung, damit nichts doppelt steht).
3. **Schritt 1 — Aktive ausgehende SSH-Verbindungen prüfen**
   `ss -tunap | grep -E ':(22|222|2022|2222) '`
   Erwartung: leer. Treffer = akuter Scan läuft gerade.
4. **Schritt 2 — Laufende Prozesse auf bekannte Scanner/Miner prüfen**
   `ps auxf` und
   `ps auxf | grep -iE 'masscan|zmap|pnscan|sshscan|kinsing|xmrig|kdevtmpfsi|xmr|monero'`
5. **Schritt 3 — SSH-Login-Historie prüfen**
   - `last -Fa | head -30` (erfolgreiche Logins, fremde IPs?)
   - `lastb | head -30` (fehlgeschlagene Versuche — Menge/Herkunft)
   - `journalctl -u ssh --since "14 days ago" | grep -iE 'accepted|invalid|failed' | tail -80`
6. **Schritt 4 — Cronjobs & systemd-Timer auf unbekannte Einträge prüfen**
   - `crontab -l` (root)
   - `for u in $(cut -f1 -d: /etc/passwd); do crontab -u $u -l 2>/dev/null && echo "-- $u"; done`
   - `ls -la /etc/cron.*/ /var/spool/cron/ 2>/dev/null`
   - `systemctl list-timers --all`
7. **Schritt 5 — Docker-Container & -Images inventarisieren**
   - `docker ps -a` und `docker images`
   - Whitelist: nur `ocpp` (unser Node-Server), `caddy`, optional `ocpp-simulator`. Alles andere = verdächtig.
   - `docker inspect <container> | grep -iE 'cmd|entrypoint'` bei Unbekanntem.
8. **Schritt 6 — Auth-relevante Dateien auf Manipulation prüfen**
   - `ls -la /root/.ssh/authorized_keys` und Inhalt anzeigen
   - `getent passwd | awk -F: '$3>=1000'` (unerwartete User?)
   - `stat /etc/passwd /etc/shadow /etc/ssh/sshd_config` (Änderungsdatum plausibel?)
9. **Schritt 7 — Kurz-Auswertung** — Entscheidungsbaum:
   - **Alles unauffällig** → Verdacht auf Fehlalarm oder abgeschlossenen, kurzen Scan. Antwortentwurf an Hetzner (im Dokument enthalten), Härtung planen (Verweis auf späteres Hardening-Doku, das der User bei Bedarf separat anfordern kann).
   - **Auffällig (unbekannter Prozess, unbekannter Container, unbekannter authorized_keys-Eintrag, unbekannter User)** → Klartext: Server als kompromittiert behandeln, keine Nachbesserung — Neuaufsetzen. Kurzer Ablauf: neuen Hetzner-Server bestellen, `docs/ocpp-persistent-server/` frisch deployen, Wallbox-URLs zeigen weiterhin auf die gleiche Subdomain (DNS umziehen), alter Server wird abgeschaltet.
10. **Was ich (User) an Skhron/Hetzner zurückschreibe** — zwei fertige Textbausteine (deutsch + englisch), je nach Befund („untersucht, Ursache Y gefunden, Maßnahme Z ergriffen").
11. **Was das Runbook NICHT tut** — expliziter Hinweis: keine Bereinigung, keine automatische Härtung, keine Änderung an der Lovable-App. Alles nur Lese-Befehle bis auf Cron/Docker-Inspect.

## Was NICHT Teil dieses Plans ist

- Keine Änderungen an App-Code, an `docs/ocpp-persistent-server/src/**`, an Compose-Files oder am Caddyfile.
- Kein Hardening-Skript (fail2ban, UFW, Key-only-SSH) — das war eine separate Option und wurde nicht gewählt. Kann später separat beauftragt werden.
- Kein automatisiertes Diagnose-Skript — der User wünscht das Runbook zum manuellen Kopieren.

## Technische Notiz

- Reine Doku-Änderung, keine TypeScript-Builds, keine Migrations, keine Edge Functions betroffen.
- Zielgruppe = derselbe „Nicht-Terminal-Profi"-Nutzer wie bei `HETZNER_TEST_ANLEITUNG.md`; Sprache und Formatierung (grauer Kasten pro Befehl, ein Befehl pro Kasten, Erwartungswert direkt darunter) werden 1:1 übernommen.
