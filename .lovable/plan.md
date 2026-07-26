## Ziel

Ein eigenständiges Pitchdeck `**AICONO_CCV_Kooperationsangebot.pptx**` (Ablage `/mnt/documents/`), das bei CCV Interesse an einer strategischen Partnerschaft für **alle Payment-Vorgänge im AICONO EMS** weckt — nicht nur Ad-hoc am Ladepunkt, sondern auch Energy Sharing, PPA-Abrechnung, Mieterstrom und künftige In-App-Zahlungen.

Basis-Look & Wording aus `AICONO_EMS_Kundenpraesentation.pptx` (dunkler Header „AUSGANGSLAGE / LÖSUNG / …", Footer-Kicker, Blau/Teal, Montserrat/Inter). Deutschsprachig, ~14 Slides, projektionstauglich (Titel ≥40 pt, Body ≥24 pt).

## Recherche-Basis (CCV)

- CCV positioniert sich als Full-Stack Payment-Partner (Terminals + PSP + Acquiring + Vor-Ort-Service DE/NL/BE), Fokus u. a. Retail, Vending/Unattended, **E-Mobility** (Cloud-Connect für AFIR-Ladepunkte via OCPI).
- Verkaufsargumente CCV: persönlicher Support ohne Warteschleife, flexible Verträge (ab 1 Monat), deutschlandweiter Außendienst, breites Terminal-Portfolio inkl. unattended.
- Für AICONO relevant: **CCV Cloud-Connect (OCPI 2.2.1)** für Ad-hoc am Ladepunkt sowie CCV-PSP/Acquiring für alle sonstigen In-Product-Zahlungen (Mieterstrom, PPA, Energy-Sharing-Abrechnungen, EV-App).

## Argumentationslinie des Decks

1. **Wer wir sind** — AICONO EMS Kurzprofil (aus Kundenpräsentation abgeleitet: modulares B2B/Kommunen-EMS, Mandanten, Gateway, Cloud).
2. **Warum jetzt** — AFIR-Pflicht für DC ≥ 50 kW, Wachstum Mieterstrom/Energy Sharing/PPA → EMS-Plattformen brauchen einen Payment-Partner, der beide Welten kann: **Unattended am Ladepunkt + digitale Wiederkehr-Zahlungen**.
3. **Payment-Landkarte im AICONO EMS** — vier Payment-Flüsse in einer Grafik:
  - Ad-hoc am DC-Ladepunkt (Terminal, OCPI)
  - EV-App PWA (Web/Mobile Payments, Wallet)
  - Energy Sharing (Abrechnung Erzeuger ↔ Verbraucher, SEPA/Karte)
  - PPA-Settlements (B2B-Rechnung, Lastschrift/Überweisung)
4. **Warum CCV** — Terminals + PSP + Acquiring aus einer Hand, DE-Support, OCPI-fähig, AFIR-konform, Vertragsflexibilität — spiegelt CCV-Wording.
5. **Technische Anschlussfähigkeit** — was bei AICONO bereits gebaut ist (Adapter-Interface `PaymentAdapter`, Mock-Adapter, Provider/Terminal/Rules-Verwaltung, Orchestrator-Edge-Function). CCV muss nur den Adapter aktivieren.
6. **Pilot-Vorschlag** — 1 Kommune + 1 Stadtwerk als Referenz, Sandbox → Live in 60 Tagen.
7. **Kommerzielles Modell** — Revenue-Share/Rev-Sharing-Optionen, White-Label, gemeinsame Go-to-Market.
8. **Call to Action** — Termin für technisches Sandbox-Onboarding.

## Slide-Struktur (14 Slides)

1. **Cover** — „Kooperationsangebot an CCV. Payment für die Energiewende." + AICONO-Logo-Feld.
2. **Über AICONO** — 3–4 Kennzahlen/Facts (modulares EMS, Mandanten, Gateway, DE-Hosting).
3. **Der Markt** — AFIR + Mieterstrom + Energy Sharing + PPA als wachsende Payment-Cases (mit Zahlen/Trends).
4. **Payment im EMS heute** — Status quo Fragmentierung (Terminal-Provider ≠ PSP ≠ Acquirer ≠ Softwarehaus).
5. **Vision** — Ein Payment-Partner für alle Flows (Grafik mit vier Flüssen, mittig CCV-Logo-Slot).
6. **Flow 1: Ad-hoc am Ladepunkt** — CCV Cloud-Connect + OCPI 2.2.1, AFIR-konform.
7. **Flow 2: EV-App-PWA** — Web/Mobile Payments, wiederkehrende Zahlungen.
8. **Flow 3: Energy Sharing** — Peer-zu-Peer-Abrechnung, SEPA + Karte.
9. **Flow 4: PPA-Settlements** — B2B, größere Volumina, monatliche Auto-Rechnung.
10. **Warum CCV** — spiegelt CCV-USPs (Support DE, Außendienst, Vertragsflexibilität, E-Mobility-Erfahrung).
11. **Technische Anschlussfähigkeit** — Screenshot/Wireframe des vorhandenen Adapter-Layers, „CCV = Adapter ersetzt Mock".
12. **Pilot & Roadmap** — Sandbox (M1), Live-Pilot 2 Standorte (M2), Rollout Kommunen/B2B (M3+).
13. **Kommerzielles Modell** — Optionen: Rev-Share, White-Label, gemeinsame Leadliste, Referenz-Nutzung.
14. **Nächste Schritte / Kontakt** — konkreter Termin-CTA + Ansprechpartner.

## Technische Umsetzung

- Skill `**pptx**` verwenden, Erstellung via `pptxgenjs` (Node), Basis-Farben aus Kundenpräsentation ableiten (Deep Navy + Teal-Accent + Off-White).
- Typografie: Montserrat (Headline) / Inter (Body), Kicker 22 pt, Titel 44 pt, Body 24 pt, Chrome 18 pt — kompatibel mit den in der Basis verwendeten Größen.
- Layouts variieren: Cover, Section-Header (dunkel), 3er/4er-Kachelraster, zweispaltig Text+Icon, Prozess-Flow, Roadmap-Timeline, Kontakt-Slide.
- Kein CCV-Logo einbetten (rechtlich unklar) — stattdessen Platzhalter „CCV" in Textform mit klarer Kennzeichnung als Entwurf.
- QA-Pflichtlauf gemäß pptx-Skill: `python -m markitdown` + Slide-für-Slide-Rendering (`soffice → pdftoppm`) + Screenshot-Review, bevor die Datei ausgeliefert wird.
- Ausgabe: `/mnt/documents/AICONO_CCV_Kooperationsangebot.pptx`, danach `<presentation-artifact>`-Tag.

## Nicht Bestandteil

- Keine Code-/DB-Änderungen im EMS-Projekt.
- Keine E-Mail-/Outreach-Vorlagen (kann separat folgen).
- Keine finalen kommerziellen Konditionen — nur Modell-Optionen als Diskussionsbasis.