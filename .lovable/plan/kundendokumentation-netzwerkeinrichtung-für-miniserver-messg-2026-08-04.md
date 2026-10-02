# Kundendokumentation: Netzwerkeinrichtung für Miniserver & Messgeräte

## Ziel
Ein ausdruckbares, deutschsprachiges Dokument (Word/PDF) für Endkunden, das die Netzwerk-Voraussetzungen für den Betrieb von Loxone Miniserver, Modbus-TCP-Messgeräten, Wallboxen (OCPP) und der AICONO Cloud verständlich erklärt. Sprache: neutral, nicht AICONO-gebrandet. Detailtiefe: Mischform – einfache Kundenanleitung mit technischem Anhang für den IT-Dienstleister.

## Inhaltliche Bausteine (vom Kunden gewünscht)
1. DHCP vs. feste IP-Adressen – Empfehlung und Umsetzung
2. Cloud- & OCPP-Ports – ausgehende und ggf. eingehende Portfreigaben
3. Modbus TCP & Netzwerk-Tipps – Ports, LAN/WLAN, Stabilität, Trennung
4. Zuständigkeiten – Wer konfiguriert was vor Ort / bei AICONO

## Geplanter Aufbau des Dokuments

```text
1. Einleitung
   - Zweck des Dokuments
   - Für wen es gedacht ist

2. Zuständigkeiten vor der Inbetriebnahme
   - Kunde / Hausnetzwerk-Verantwortlicher
   - Elektrofachbetrieb
   - AICONO

3. Netzwerk-Grundlagen in Kürze
   - Router, DHCP, feste IP-Adressen
   - LAN vs. WLAN
   - Warum stabile IP-Adressen wichtig sind

4. IP-Adressvergabe
   - DHCP-Reservierung vs. statische IP
   - Empfohlene Vorgehensweise
   - Geräteliste mit festen IPs (Vorlage)

5. Benötigte Ports und Freigaben
   - Ausgehende Verbindungen zur AICONO Cloud
   - OCPP-Server (Wallbox-Kommunikation)
   - Modbus TCP (Messgeräte im lokalen Netz)
   - Hinweise zur Firewall

6. Empfehlungen für LAN und WLAN
   - Trennung von Büro- und Technik-Netzwerk (VLAN)
   - WLAN: dediziertes IoT-Netzwerk
   - Stabilität, Reichweite, Kabel bevorzugt

7. Checkliste vor Inbetriebnahme
   - Router-Einstellungen
   - Geräte-IP-Liste
   - Portfreigaben geprüft
   - Testzugriff Cloud/OCPP

8. Technischer Anhang für IT-Dienstleister
   - Detaillierte Port-Tabelle
   - Beispiel-Konfigurationen
   - Troubleshooting-Hinweise
```

## Umsetzungsschritte

1. **Projekt-Research (15 Min.)**
   - Bestehende Dokumentation und Configs im Projekt nach konkreten Ports durchsuchen (z. B. OCPP-Server-Port, Supabase/Cloud-Endpunkte, Modbus-Defaults).
   - Falls keine projektinternen Werte vorhanden sind, konservative Standardwerte verwenden und als "bitte mit AICONO bestätigen" kennzeichnen.

2. **Textentwurf verfassen (30 Min.)**
   - Klare, laiengerechte Sprache.
   - Fachbegriffe kurz erklären.
   - Tabellen für Ports, Geräte und Checkliste.

3. **Dokument als DOCX erstellen (30 Min.)**
   - docx-js verwenden.
   - US Letter oder A4, lesbare Schrift (Arial), klare Überschriften.
   - Tabellen für Ports und Checkliste.
   - Kein Branding/Logo.

4. **QA & Konvertierung (15 Min.)**
   - DOCX validieren.
   - In PDF konvertieren und jede Seite als Bild prüfen.
   - Layout, Seitenumbrüche, Tabellen auf Fehler prüfen.

5. **Bereitstellung**
   - Fertige Dateien unter `/mnt/documents/` ablegen.
   - Download-Link im Chat bereitstellen.

## Deliverables
- `Netzwerkeinrichtung_Miniserver_Messgeraete.docx`
- `Netzwerkeinrichtung_Miniserver_Messgeraete.pdf`

## Offene Punkte / Annahmen
- Die genauen AICONO-Cloud-Endpunkte und OCPP-Ports werden aus dem Projekt ermittelt oder, falls nicht auffindbar, mit Standardwerten und Hinweis auf Prüfung eingesetzt.
- Das Dokument bleibt neutral (kein Logo, keine AICONO-spezifische CI).
