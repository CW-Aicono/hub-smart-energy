

## Plan: 12-15 Seiten PPTX-Präsentation — AME Hub × Smart Energy Hub

### Ziel
Eine professionelle PowerPoint-Präsentation für Vorstände, Geschäftsführer und Entscheider aus Bau, Politik und Projektierung. Fokus: Zusammenspiel von Hardware (AME Mobile Energy Hub) und Software (Smart Energy Hub Plattform).

### Vorgehen
- pptxgenjs-Script erstellen und ausführen
- Alp-Mann Logo aus den PDFs einbetten
- System-Architektur-Grafiken aus den PDFs einbetten
- Farbpalette: Dunkelblau/Petrol (#1A3C5E) + Grün (#4CAF50) + Weiß — passend zu beiden Marken
- Font: Georgia (Header) / Calibri (Body)
- Alle Texte auf Deutsch

### Folienstruktur (14 Folien)

| # | Folie | Inhalt |
|---|-------|--------|
| 1 | **Titelfolie** | „Die Infrastruktur für ein CO₂-freies Europa — Mobil. Intelligent. Sofort einsatzbereit." Logos beider Projekte, Datum |
| 2 | **Das Problem** | 3 Kernprobleme: Abregelung/Verschwendung, Netzüberlastung, Unwirtschaftlichkeit herk. Speicher. Icons + Kurztext |
| 3 | **Die Hardware-Lösung: AME Hub** | Systemarchitektur-Grafik (aus PDF), Kerndaten: 5 MWh, 150 kW WP, R290, Wechselbrücke |
| 4 | **4 USPs des AME Hub** | Visuelles Grid: Kosteneffizienz (100 €/kWh), Thermischer Turbo (>90% Wirkungsgrad), Mobilität (Plug & Play), Sicherheit (LFP + Schwarzstart) |
| 5 | **Die Software-Lösung: Smart Energy Hub** | Dashboard-Screenshot/Beschreibung, KI-Arbitrage, Echtzeit-Monitoring, Multi-Standort, PV-Prognose, Ladeinfrastruktur |
| 6 | **Das Zusammenspiel: Hardware × Software** | Flussdiagramm: AME Hub ↔ Smart Energy Hub. KI-Steuerung, Wetterdaten, Börsenpreise, Wärmelastprofile → optimierte Betriebsstrategie |
| 7 | **Revenue Stacking: 4 Erlösströme** | Strom-Arbitrage, Wärme-Direktvermarktung, Reduzierte Netzentgelte, CO₂-Vermeidung. Große Zahlen mit Beschreibung |
| 8 | **ROI & Wirtschaftlichkeit** | Vergleichstabelle: Standard-Speicher vs. AME Hub (CAPEX, Erlöse, Amortisation 11 vs. 4,5 Jahre). Förder-Stacking bis 45% |
| 9 | **Marktvergleich: AME Hub vs. Tesla Megapack** | Feature-Vergleichstabelle (Sektorkopplung, Mobilität, Förderfähigkeit, Zielgruppe) |
| 10 | **CO₂-Impact & Nachhaltigkeit** | CO₂-Balkendiagramm (45t → 12t, >70% Reduktion), R290 Kältemittel, LFP recycelbar, Grid-Balancing |
| 11 | **Technische Spezifikationen** | Kompakte Spec-Tabelle: Speicher, Wärmepumpe, Bauform, Steuerung, Zertifizierungen |
| 12 | **Anwendungsszenarien** | 3 Use-Cases: Quartiersentwicklung, Industriebetrieb, Kommunale Wärmeplanung — jeweils mit Icon und Kurzbeschreibung |
| 13 | **Skalierung & Marktpotenzial** | GuV-Auszug 2026-2030 (Einheiten, Umsatz, Marktgebiete), Cluster-Architektur, Fabless Assembly |
| 14 | **Call to Action / Kontakt** | Abschluss-Statement, Kontaktdaten, Logos |

### Technische Umsetzung
- pptxgenjs-Script in `/tmp/create_presentation.js`
- Logo und Systemarchitektur-Grafiken als base64 einbetten
- Output: `/mnt/documents/AME_Hub_Smart_Energy_Hub_Praesentation.pptx`
- QA: LibreOffice → PDF → pdftoppm → visuelle Inspektion aller Folien

