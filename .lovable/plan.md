# Plan: Bewertungs-Pitchdeck (PPTX) für AICONO EMS

## Ziel

Eine kompakte PowerPoint-Präsentation (.pptx, ~12–15 Folien) erstellen, die den aktuellen Projektstand zusammenfasst und eine grobe **Unternehmens-/Projektbewertung** liefert.

## Inhalt der Folien (Entwurf)

1. **Titel** — AICONO EMS – Projektbewertung Stand Juni 2026
2. **Executive Summary** — Was ist AICONO EMS? Multi-Tenant B2B-Energieplattform mit lokalen Gateways, EV-Charging, Mieterstrom, Energy-Sharing, Sales-Scout, Partner-Portal.
3. **Produktportfolio (Übersicht)** — Hauptprodukt + Teilprodukte als Bento-Grid
4. **Kernplattform (Tenant-Backend)** — Dashboard, Energiemonitoring, Reporting, Multi-Location, Automation, Alarmregeln, CO₂-Bilanz, AI-Copilot
5. **Hardware-Layer** — AICONO EMS Gateway (HA-Add-on), AICONO OS, MQTT Cloud Bridge, OCPP Persistent Server, Integrationen (Schneider, Siemens, Shelly, Loxone, …)
6. **EV-Charging-Modul** — OCPP 1.6, PV-Überschussladen, Billing, Public Status, Stability Score
7. **Mieterstrom & Energy-Sharing** — Communitys, Rechnungs-PDF, SEPA-XML, KMU-Klassifikation
8. **Sales Scout & PPA** — Mobile PWA, Lead-Pipeline, Angebots-PDF, Marketplace
9. **Partner-Portal & White-Label-Strategie** — partner.aicono.org, RBAC, Branding
10. **Super-Admin-Tools** — Lexware-Billing, Monitoring, Bundles, Lizenzen, Recovery
11. **Technologie & Skalierung** — React/Vite, Supabase self-hosted (Hetzner), Docker, RLS-Multi-Tenancy, i18n (DE/EN/ES/NL)
12. **Bewertung – Methodik** — Cost-to-build (Replacement Cost), SaaS-Multiples, strategischer Wert; deutlich machen, dass es eine **grobe Indikation** ohne Revenue-Daten ist
13. **Bewertung – Zahlen** — Range Low/Mid/High mit Begründung (Code-Umfang, Feature-Breite, Hardware-Integration, Vertikalisierung)
14. **Werttreiber & Risiken** — Werttreiber (Tiefe der Integrationen, Multi-Tenant, Hardware), Risiken (Wirtschaftsmodell offen, Single-Founder-Codebase, Compliance/DSGVO)
15. **Disclaimer** — Keine Wirtschaftsprüfer-Bewertung, nur indikative Größenordnung

## Bewertungsmethodik (Vorab-Indikation)

- **Replacement Cost**: Geschätzter Aufwand, das Produkt heute nachzubauen (Team-Jahre × Marktsätze).
- **Strategischer Wert**: Multi-Tenant-Architektur, eigene Gateway-Hardware, vollständige OCPP-Stack, Partner-Modell.
- **Da keine ARR/MRR-Zahlen bekannt sind**: kein SaaS-Revenue-Multiple, sondern Asset-/Tech-Bewertung.

## Vorgehen (nach Plan-Approval)

1. Codebase-Inventur: Zeilen-/Dateienzahl, Edge Functions, Migrationen, Tabellen, Module zählen (Lovable Cloud + Hetzner)
2. PPTX mit `pptxgenjs` (Skill: pptx) erstellen — dunkles AICONO-CI-Design (Navy/Teal-Akzent), Montserrat-ähnliche Fonts
3. QA: Slides → PDF → JPG, jede Folie visuell prüfen, Fixes
4. Datei nach `/mnt/documents/AICONO_EMS_Bewertung_2026-06.pptx` legen und als Artifact ausliefern

## Offene Fragen

- Soll die Bewertung in **EUR** oder **USD** dargestellt werden? (Default: EUR)
- Zielgruppe der Folien: **intern** (für dich) oder **investorenfähig** (mehr Politur, weniger interne Begriffe)? (Default: intern/sachlich)
- Sollen reale ARR/MRR-Zahlen einfließen, falls du welche nennst, oder rein **Tech-/Asset-Bewertung**? (Default: Tech-/Asset, da keine Zahlen vorliegen)  
  
Antworten:  
- Bewertung in EUR  
- intern  
- reine Tech-/Asset-Bewertung