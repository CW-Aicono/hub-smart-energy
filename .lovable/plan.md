## Ziel

Aktuell ist der Energiebericht ausschließlich für **Kommunen** (mit Bundesland-Profil nach KlimaG / NKlimaG etc.) ausgelegt. Für die anderen 3 Mandantentypen wird heute nur ein Hinweis „nicht verfügbar" gezeigt. Es sollen passende, eigenständige Berichtsvorlagen ergänzt werden – jeweils mit eigener Rechtsgrundlage, Pflichtkapiteln und KI-Textbausteinen.

## Recherche – Berichtsanforderungen pro Sparte

### Gewerbe / Industrie

Relevante deutsche/EU-Pflichten und Standards:

- **EDL-G (Energiedienstleistungsgesetz)** – Pflicht-Energieaudit alle 4 Jahre für Nicht-KMU nach **DIN EN 16247-1**.
- **EnEfG (Energieeffizienzgesetz, 2023)** – Pflicht-Energie- oder Umweltmanagementsystem (ISO 50001 / EMAS) ab > 7,5 GWh/a Endenergie; Veröffentlichung von Endenergieverbrauch und Einsparmaßnahmen ab > 2,5 GWh/a.
- **CSRD / ESRS E1** – nicht-finanzielle Berichterstattung zu Energie & CO₂ (Scope 1/2, optional Scope 3) für berichtspflichtige Unternehmen.
- **GHG-Protocol** – Standardgliederung Scope 1/2/3, marktbasiert vs. standortbasiert.
- **BAFA-Förderbedingungen** für Energieeffizienz / Bundesförderung EEW.

Typische Pflichtkapitel: Standortübersicht, Endenergie nach Energieträger, Lastgang/Spitzenlast, spezifischer Verbrauch (kWh/m²·a, kWh/Stück, kWh/€ Umsatz), CO₂-Bilanz Scope 1/2 (marktbasiert+standortbasiert), Maßnahmenliste mit ROI, Amortisation, EnPI-Kennzahlen.

### Kommune (bereits umgesetzt)

Bundesland-Profile (NKlimaG, BayKlimaG, EWKG SH, EWG Bln, …), Witterungsbereinigung, BMWi/BMUB-Benchmarks, GEG-Emissionsfaktoren. **Wird nicht angefasst.**

### Privat (Eigenheim / Mehrfamilienhaus)

Keine gesetzliche Berichtspflicht, aber sinnvolle Bezugsdokumente:

- **GEG (Gebäudeenergiegesetz)** – Energieausweis-Logik (Endenergie kWh/m²·a, Primärenergie, CO₂).
- **Heizkostenverordnung (HKVO)** + EU-EED – jährliche Heizkostenabrechnung, monatliche Verbrauchsinformation.
- Vergleich mit Durchschnittshaushalt (BDEW-Kennwerte: Strom 1500–4500 kWh/a, Gas 8000–20000 kWh/a je Haushaltsgröße).

Pflichtkapitel: Haushaltsdaten (Personen, Wohnfläche, Baujahr), Verbrauch pro Energieträger (Strom, Gas/Öl/Wärme), Vergleich mit Durchschnittshaushalt, CO₂-Fußabdruck, Kosten, PV-Eigenverbrauch/Einspeisung, einfache Spartipps.

### Sonstige (Vereine, NGOs, Kirchen, Bildungseinrichtungen ohne kommunalen Träger)

Keine spezifische Gesetzespflicht; freiwilliger Nachhaltigkeitsbericht – meist orientiert an:

- **DNK (Deutscher Nachhaltigkeitskodex)** – Kriterien 11–13 (Inanspruchnahme natürlicher Ressourcen, Ressourcenmanagement, klimarelevante Emissionen).
- **EMASeasy** für kleine Organisationen.

Pflichtkapitel: Organisations-/Liegenschaftsübersicht, Verbrauch nach Energieträger, CO₂-Bilanz vereinfacht (Scope 1+2), Maßnahmen & Ziele, Mitarbeiter-/Mitgliedersensibilisierung.

## Architektur-Entscheidung

Statt eines `if (tenant_type !== "kommune")` Gates wird die bestehende `EnergyReport.tsx` zum **Dispatcher**: sie lädt je nach `tenant.tenant_type` die passende Report-Komponente. Die kommunale Variante wandert 1:1 in eine eigene Datei – kein Funktionsverlust.

```text
src/pages/EnergyReport.tsx              → Dispatcher (entscheidet anhand tenant_type)
src/components/report/templates/
   ├─ KommuneReport.tsx                 → bisheriger Inhalt (refactored)
   ├─ GewerbeIndustrieReport.tsx        → neu
   ├─ PrivatReport.tsx                  → neu
   └─ SonstigeReport.tsx                → neu
src/lib/report/
   ├─ federalStateProfiles.ts           → bleibt (Kommune)
   └─ tenantTypeProfiles.ts             → neu: legalBasis/sections/extraTopics je tenant_type
supabase/functions/generate-report-text/index.ts → erweitern: zusätzliche SYSTEM_PROMPTs pro tenant_type
```

## Inhaltsmodell pro neuer Vorlage

Alle Vorlagen teilen sich die generischen Bausteine (Auswahl Berichtsjahr, Liegenschaften/Objekte, KPI-Grid, Verbrauchstrend, CO₂, Druck/Archiv, KI-Texte, Entwurfsspeicherung) – wiederverwendet aus `src/components/report/*`. Unterschiede:

**GewerbeIndustrieReport**

- Profil-Card mit Rechtsgrundlage-Auswahl: *EDL-G Audit*, *EnEfG*, *CSRD/ESRS E1*, *Freiwillig (ISO 50001)*.
- Eigene Kapitel: Scope 1 / Scope 2 (marktbasiert + standortbasiert), spezifischer Verbrauch (kWh/m², optional kWh/Stück oder kWh/€ – Eingabefelder), Lastgang-Kennwerte (P_max, Jahresvollbenutzungsstunden – aus vorhandenen 5-min Daten), Maßnahmen-Tabelle mit ROI/Amortisation (wiederverwendet `MeasuresTable`), EnPI-Übersicht.
- KI-Sektionen: `executive_summary`, `methodik_audit`, `massnahmen_roi`, `ausblick_dekarbonisierung`.

**PrivatReport**

- Eingaben: Personen im Haushalt, Wohnfläche, Baujahr, Heizungsart (kommt teils aus Location-Profil).
- Kapitel: Verbrauchsübersicht, Vergleich mit BDEW-Durchschnittshaushalt (Ampel), CO₂-Fußabdruck, Energiekosten, PV-Eigenverbrauchsquote (falls vorhanden), Spartipps.
- KI-Sektionen: `zusammenfassung`, `vergleich_durchschnitt`, `spartipps`.
- Schlichteres Layout, kein juristisches Vorwort.

**SonstigeReport**

- Profil-Card mit Auswahl: *Freiwilliger Nachhaltigkeitsbericht*, *DNK*, *EMASeasy*.
- Kapitel ähnlich Gewerbe, aber ohne EnPI/ROI-Pflicht; Fokus auf Verbrauch, CO₂ (Scope 1+2 vereinfacht), Maßnahmen, Ziele.
- KI-Sektionen: `vorwort`, `nachhaltigkeitskontext`, `massnahmen`, `ausblick`.

## Detail-Schritte

1. `**src/lib/report/tenantTypeProfiles.ts**` – Typdefinitionen + Profil-Konstanten je `TenantType` (Rechtsgrundlagen, Pflicht-Sections, Default-Extras, Label, AI-Sektion-Keys).
2. **Refactor** der bestehenden `EnergyReport.tsx`: Kommunalen Inhalt unverändert in `**src/components/report/templates/KommuneReport.tsx**` verschieben.
3. **Dispatcher in `EnergyReport.tsx**` schreiben: bei `tenant_type === "kommune"` → `KommuneReport`, bei `gewerbe_industrie` → `GewerbeIndustrieReport`, etc. (Loading-/Auth-Guards bleiben oben.)
4. `**GewerbeIndustrieReport.tsx**` neu, mit Profilauswahl (EDL-G/EnEfG/CSRD), Scope-1/2-KPIs, spezifischen Kennzahlen, Lastgang-Block, Maßnahmen-ROI, KI-Texten.
5. `**PrivatReport.tsx**` neu, mit Haushaltsprofil-Eingaben, BDEW-Vergleich (Konstanten in `tenantTypeProfiles.ts`), Spartipps-Block, vereinfachten KI-Texten.
6. `**SonstigeReport.tsx**` neu, ähnlich Gewerbe aber schlanker, DNK/EMASeasy-Profilauswahl.
7. `**supabase/functions/generate-report-text/index.ts**` erweitern: neuer Request-Parameter `tenantType` + `section`-Union erweitert; eigene SYSTEM_PROMPTs pro Mandantentyp; `profile` wird optional (für Privat nicht benötigt). Backward-kompatibel mit Kommune-Aufrufen.
8. `**energy_report_drafts**` wird beibehalten; `profile_code` für Nicht-Kommunen mit dem gewählten Rechtsrahmen-Code befüllt (z. B. `EDL-G`, `CSRD`, `BDEW`, `DNK`). Kein Schema-Change nötig.
9. **Hinweis-Card** in `EnergyReport.tsx` entfernen (wird durch Dispatcher ersetzt).

## Nicht im Scope

- Keine neuen DB-Tabellen oder RLS-Änderungen.
- Keine Änderungen an der kommunalen Logik, Bundesland-Profilen oder bestehenden Komponenten in `src/components/report/`.
- Keine Migration für `energy_report_drafts`.
- Keine Änderungen an Branding, i18n-Übersetzungsfiles (deutsche Texte inline, analog zur bestehenden Kommune-Variante).

## Offene Punkte zur Bestätigung

- Sollen für **Gewerbe/Industrie** alle vier Rechtsrahmen (EDL-G, EnEfG, CSRD, ISO 50001) direkt angeboten werden, oder zunächst nur **EnEfG + CSRD** als die häufigsten?  
ANTWORT: Ja, alle vier Rechtsramen direkt anbieten.  

- Bei **Privat**: Sollen die Haushaltsdaten (Personen, Wohnfläche) ad-hoc im Report-Konfigurationsformular eingegeben werden, oder dauerhaft am Hauptstandort/Tenant gespeichert (würde eine kleine Migration erfordern)?  
ANTWORT: ad-hoc Eingabe im Report-Formular, da sich einige Daten (Auszug, Anbau, etc.) immer mal ändern könnten.