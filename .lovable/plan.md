

# Anleitung: OCPP ws:// Proxy – Word-Dokument erstellen

## Ziel
Erstellung einer detaillierten, laienverständlichen Word-Anleitung (.docx) basierend auf der bestehenden Dokumentation in `docs/OCPP_WS_PROXY_SETUP.md`. Das Dokument wird in `/mnt/documents/` abgelegt.

## Inhalt des Dokuments
Die bestehende Markdown-Anleitung wird 1:1 übernommen und ergänzt um:
- Professionelles Layout mit AICONO-Branding (Farben, Überschriften)
- Noch detailliertere Erklärungen für absolute Laien (z.B. "Was ist SSH?", "Was ist ein Terminal?")
- Visuelle Hervorhebungen für Befehle, Warnungen und Platzhalter
- Checkliste am Ende zum Abhaken

## Struktur (ca. 8-10 Seiten)
1. **Deckblatt** – Titel, Version, Datum
2. **Was ist der OCPP-Proxy?** – Einfache Erklärung mit Diagramm (Text-basiert)
3. **Voraussetzungen** – Was du brauchst (inkl. Erklärung SSH/Terminal)
4. **Schritt 1-9** – Identisch zur bestehenden Anleitung, aber mit zusätzlichen Erklärungen bei jedem Schritt (z.B. "Was passiert hier?")
5. **Fehlerbehebung** – Die drei häufigsten Probleme mit Lösungen
6. **Zusammenfassung / Schnellreferenz** – Tabelle mit allen wichtigen Werten
7. **Checkliste** – Zum Abhaken aller Schritte

## Technische Umsetzung
- Word-Dokument via `docx`-js (Node.js) generieren
- Corporate Design: Blau (#1E3A5F) für Überschriften, Grau für Code-Blöcke
- Ausgabe: `/mnt/documents/AICONO_OCPP_Proxy_Einrichtung.docx`

