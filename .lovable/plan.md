# PPTX: ZIM-Förderantrag HSD × AICONO

Erstellung einer Präsentation (.pptx) zum Download unter `/mnt/documents/`.

## Foliensequenz (11 Folien)

1. **Titel** — „ZIM-Förderprojekt 2026 · HSD × AICONO × Alpmann (Hardware-Partner)"
2. **Einleitung** — Warum jetzt? Energiewende + KMU + Forschung; Projekt-Konstellation HSD (Bockstette) + AICONO + Hardware-Lieferant
3. **Vorschlag 1: SwarmGrid** — Föderiertes Lernen für Quartiers-Energieoptimierung
4. **Vorschlag 2: ThermoTwin** — Selbstkalibrierender digitaler Zwilling für Wärmepumpen
5. **Vorschlag 3: GridGuard** — Prognostische Netzdienlichkeit / virtuelles Kraftwerk
6. **Vorschlag 4: EnergyVoice** — Konversationelle Energie-KI mit Aktionsfähigkeit
7. **Vorschlag 5: EcoTwin Kids** — Gamifizierter pädagogischer Energie-Zwilling
8. **Kombi-Idee Teil 1** — „SwarmGrid Kids": Vision, Innovationskern, Arbeitspakete
9. **Kombi-Idee Teil 2** — Architektur, Verwertung, Wirkungsmessung, Risiken
10. **Zahlen, Daten, Fakten** — Förderquoten (HSD 100% / AICONO 45% / Partner 40%), Budgets, Laufzeit 30 Monate, Bearbeitungsdauer 3–6 Monate, Marktpotenzial
11. **Call-to-Action** — Nächste Schritte: Skizze mit Bockstette, Hardware-Partner finden, Antrag Q2/2026

## Design

- **Palette**: AICONO-CI (Dark Navy `#0B1E3F`, Teal-Accent `#14B8A6`, Off-White `#F8FAFC`, Akzent-Gold `#F59E0B`)
- **Typografie**: Calibri (verfügbar), Titel 36–44pt bold, Body 18–22pt
- **Layout**: Title-Slide dunkel, Content-Slides hell, Kombi-Folien wieder dunkel mit Teal-Akzent; jede Idee mit großem Symbol-Block links + Inhalt rechts; KPI-Folie mit großen Zahlenkacheln
- **Sprache**: Deutsch

## Technische Umsetzung

- Node-Skript mit `pptxgenjs` in `/tmp/build-zim-pitch.js`
- Output: `/mnt/documents/ZIM-Foerderantrag-HSD-AICONO.pptx`
- QA: LibreOffice → PDF → `pdftoppm` → visuelle Prüfung aller 11 Folien, ggf. nachjustieren
- Am Ende `<presentation-artifact>` mit Download-Link

## Nicht enthalten

- Keine Code-Änderungen am Projekt
- Keine externen Bilder/Logos (sauberes Layout mit Shapes/Icons aus Unicode/Shapes)