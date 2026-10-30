# Roadmap

## Ladestatus (30.10.)
- [x] v1.16.1: Alle OCPP-Zustände getrennt anzeigen; Stationsmeldungen nicht durch offene Sitzungen überschreiben. 23 Tests erfolgreich, angemeldete ELMI-Detailansicht und neun Zustände in öffentlicher Prüfansicht verifiziert; vier Sprachen gepflegt. Keine Stationskonfiguration oder Fernbefehle geändert.
- [x] v1.16.2: Fernstart auch bei „Vorbereitung“ (Fahrzeug angesteckt) zulässig; ELMI-Statuscode 0x0B0B0000 im Protokoll nicht mehr als Fehler markiert.

## Paketabrechnung v5 (Dirk, 30.10.)
- [x] Schritt 1 (v1.16.3): Ladepunkt-EK 6,00 €, Remote-Support-EK 112 € (partnerbuchbar), Preisversionierung mit Gültig-ab + Historie, Tooltip „Freischaltung Partner“, Bundles als „Altvertrag – nicht mehr buchbar“. 29 Tests, Build OK, DB-Werte verifiziert.
- [x] Schritt 2 (v1.17.0): Preis-Vorbelegung + Begründungspflicht, Einrichtung einmalig, Mengen automatisch, Voraussetzungen/Hinweis Paket 6, Modul-Abschaltung beim Kündigen, Schalter „Abrechnung nach Paketen“ mit Vorschlag.
- [x] Schritt 3 (v1.18.0): Monatsübersicht mit UVP/EK, tägliche Mengen-Snapshots, Support > 4 h „Prüfen“, Partnerrabatt auf EK, Änderung zum Vormonat/Gelbmarkierung, Nachberechnung, Partner-Hinweise, neue Kunden nach Paketen.
- [x] Offen aus Schritt 3: Endkunden-Entwurf des Partners mit Partnerpreisen (v1.19.0).
- [x] Schritt 4 (v1.19.0): Sammelrechnung Wiederverkauf, Provisionsgutschrift, Endkunden-Entwürfe mit eigenen Positionen, Warnung Direktrechnung, Eigenbedarf „An Partner“, Storno-Rechnung, ZUGFeRD in allen PDFs, Leitweg-ID, Lexware weiter als Entwurf.
- [ ] Wartet auf Nutzer: eine erzeugte Rechnung mit einem ZUGFeRD-Prüfwerkzeug validieren (PDF/A-3-Container nicht zertifiziert); Lexware-Einstellung E-Rechnung prüfen
- [x] Schritt 5 (v1.20.0): Paket-Preisliste mit EK/UVP/eigenem Preis/Marge je Segment, Rabattanfrage auf Pakete/Mengenpreise, Margen auf Paketbasis, Provision + Gutschriften, Kachel „Offene Abrechnung“.
- [ ] Schritt 6: Kunden-Ebene „Paket & Rechnungen“, Abnahmetests A–C

## Paketumstellung (30.10.)
- [x] v1.16.0: Neue Buchungen und Rechnungsauswahl nur Pakete/Zusatzleistungen; monatliche Nettopreise, 8 € je Ladepunkt; Bestandsverträge unverändert. 39 Tests, angemeldete Portal-/Partnerauswahl und Vertrag mit anteiligem Entwurf (6,39 €) geprüft; Prüfdaten entfernt. Vorhandener Ladepunkt-Partner-EK 5,25 € unverändert, da kein neuer genannt.

## Partnerabrechnung und Ratierlichkeit (30.10.)
- [x] v1.15.0: Intervalle je Lizenz, getrennte Endkunden-/EK-Entwürfe, zeitanteilige Ergänzungen, täglicher Nachlauf, Partnerabsender/Freigabe/PDF/E-Mail/SEPA. Angemeldete Testverkäufe, zwei Kunden, Retry und Sperre unvollständiger Absender geprüft; Testdaten entfernt.
- [ ] Wartet auf Nutzer: Partner-Rechnungsabsender vervollständigen, anschließend Freigabe/PDF-Ende-zu-Ende prüfen; Live-Deploy und Live-Prüfung offen. Versand und Bankabbuchung nicht ausgeführt.

- [x] Portal-Navigation: eigene Symbole, Module & Bundles gemeinsam mit zwei Reitern (v1.8.1; angemeldeter Menü- und Reiterwechsel geprüft)

- [x] Benutzerliste repariert; Portal-Admin, Partner-Admin, Kunden-Admin vereinheitlicht (v1.6.2; 16 Tests erfolgreich, angemeldete Browserprüfung mangels Sitzung offen)

- [x] Dashboard: Zeitraum pro Grafik
- [x] Energieanalyse (Vergleich, Heatmap, Dauerlinie, Kennzahlen, Export, Link teilen)
- [ ] Energieanalyse für ESB nutzbar: Modul „Analytics Studio“ für Mandant freischalten (Entscheidung Nutzer)

- [x] Super-Admin: Benutzer löschen (Mülleimer, Dialog, Selbst-/Letzter-SA-Schutz)

- [x] Abrechnung: Preis je aktivem Ladepunkt (kombinierbar mit Pauschale) + Kostenvorschau
- [x] Modul-Rabatte (%, €, dauerhaft/befristet), auch für Partner

## Offen (neu 06.10.)
- [x] Super-Admin zu „AICONO Portal“ umbauen: kaufmännisch (Buchhaltung/Abrechnung) und technisch (Gateways, Templates, Monitoring, Support), eigene Admins/Benutzer, aufgeräumte Struktur – Plan mit Nutzer abstimmen
- [x] Modulpreise: Spalte „AICONO e.V.“ entfernen, keine Trennung Kommunen/Industrie

## Offen – CRA / Sicherheit (Ideen, 06.10.)
- [ ] CRA: SBOM (CycloneDX/SPDX) im Build erzeugen
- [ ] CRA: automatische Abhängigkeits-Scans (CI)
- [ ] CRA: security.txt + Coordinated Vulnerability Disclosure
- [ ] CRA: 24-h-Meldeprozess für Sicherheitsvorfälle (CSIRT/ENISA)
- [ ] CRA: Security-by-Default-Review (Checkliste)

## Offen – wartet auf Nutzer (07.10.)
- [ ] Passwort Ladeserver (gemeinsames Secret Ladeserver ↔ Cloud)
- [ ] Live-Deploy v1.6.1 freigeben
- [ ] AICONO Partner GmbH: neuen Admin einladen oder Partner löschen
- [x] Roadmap nur im Staging + Board-Pflege
- [x] v1.6.3: Widget-Hinweis fehlende Werte, Shelly-Sensorfehler sichtbar, Portal-Modulvergabe, Änderungsprotokoll-Migration
- [ ] Bolan Live-Diagnose ausführen (docs/LIVE_DIAGNOSE_BOLAN_WIDGET.sql) – wartet auf Nutzer
- [ ] Live-Deploy v1.6.3 freigeben

## Bolan / Shelly (07.10.)
- [x] Werte nach 15 min verschwunden: Rohwerte werden jetzt zu 5-Min-Werten verdichtet (v1.6.5)
- [x] Shelly HTTP 429 / wechselnder Sync-Fehler: doppelte Abholung entfernt, Browser liest Zwischenspeicher
- [x] Tacho zeigt aktuellen Leistungswert, W-Einheit im Verlauf korrekt
- [ ] Live-Deploy v1.6.5 (wartet auf Nutzer)

## Anmeldung & Sicherheit (07.10.)
- [x] Einladungslink erst nach Passwort-Speichern verbraucht, erneut senden, Profil in allen Bereichen (v1.6.9)
- [ ] 2FA (Authenticator-App), zunächst Pflicht für Portal-Admins und Partner-Admins

- [x] Portal-Rollen (Admin/Kaufmännisch/Technisch) durch Admins pflegbar (v1.7.0)
- [x] Partner-Rabatt-Anfragen mit Freigabe/Ablehnung im AICONO Portal (v1.7.0)
- [ ] Schutz „letzter Portal-Admin“ zusätzlich serverseitig in der Datenbank erzwingen
- [x] Automatische Einmal- und Monatsrechnungen als Entwurf, Partner zum EK (v1.9.0)
- [ ] Ende-zu-Ende-Test Paketbuchung + Monatslauf mit angemeldetem Portal-Admin (wartet auf Nutzer)
- [x] Ladepunkte als Zähler im Energiemonitoring (v1.10.0)
- [ ] 5 Ladepunkte (Stadt Steinfurt 4, ESB 1) ohne Liegenschaft – Zuordnung nötig (wartet auf Nutzer)

## ESB Übersicht 13.10.
- [x] Live-Werte schneller (10 s), Ladestationen-Kachel, mehr Spaltenbreiten, 15-Min-Energieanalyse + Jahres-CSV, Sensor-Meldung entprellt (v1.11.0)
- [ ] Idee: Inbetriebnahme- und Abnahme-Tool (Anlagen-, Abnahme-, Prüfprotokoll, Funktionsnachweis, Datenblätter)

## Einladungen (14.10.)
- [x] Einladungs-/Reset-Links scanner-sicher über Zwischenseite, echte 7 Tage (v1.11.1)
- [x] Startpasswort vergeben mit Zwangswechsel bei erster Anmeldung (v1.11.1)
- [ ] Live-Deploy v1.11.1 (wartet auf Nutzer); bis dahin Sofort-Befehl für Schmidt/Wigger
- [ ] Idee: 2FA (Authenticator) für Portal- und Partner-Admins

## Impulszähler (20.10.)
- [x] Live-Kachel Mittelwert + Hinweis im Zählerdialog (v1.11.2)
- [x] „Gaszähler Hausanschluss“ als Impulszähler markiert, Verlauf 22.09.–04.10. aus Zählerständen neu berechnet
- [ ] Gaszähler Hausanschluss: seit 13.10. kein Zählerstand übertragen – Zählerstand im Miniserver/Worker zuordnen, dann 13.10.–heute neu berechnen (wartet auf Nutzer)

## ELMI All-in-One (20.10.)
- [x] Vorlage, Speichersteuerung über Loxone, PV-Überschuss mit Priorität, Netzentladung gesperrt, Loxone-Anleitung (v1.12.0)
- [x] Rückfrage an ELMI zu Kapitel 6.1 – vom Hersteller bestätigt (Protokoll v1.5): negativ = Entladen, 0xFFFE7960, FC 0x10, Skalierung 0,1 W
- [ ] Inbetriebnahme vor Ort: Miniserver nach Anleitung einrichten, Sollwert-UUID eintragen (wartet auf Nutzer)
- [ ] Peak-Shaving mit Netzentladung freischalten, sobald Netzbetreiber zustimmt

## Offene Punkte Live (Übersicht 23.10.)
- [x] Rechte eigener Rollen („Endkunde“) in Menü, Seiten, Dashboard-Anpassen durchsetzen (v1.12.1)
- [x] Tacho-/Kennzahl-Kacheln alle 15 s (v1.12.1)
- [ ] Energieanalyse leer auf Live – Prüfbefehle ausführen, dann Fix (wartet auf Nutzer)
- [ ] E-Mail-Adresse ändern (Profil + Admin)
- [ ] Inbetriebnahme-/Abnahmeprotokoll – Musterprotokolle/Mail benötigt (wartet auf Nutzer)
