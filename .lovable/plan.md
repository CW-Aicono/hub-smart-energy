## Ziel

Den bestehenden kommunalen Energiebericht (`src/pages/EnergyReport.tsx`) so erweitern, dass er den landesspezifischen Anforderungen (z.B. NKlimaG Niedersachsen, EWärmeG BW, KSG Berlin etc.) entspricht und KI-gestützt Texte (Vorwort, Einleitung, Maßnahmenempfehlungen, Ausblick) generiert – orientiert am KEAN-Musterbericht und am realen Holle-Bericht.

## Sichtung der Vorlagen

**KEAN-Mustervorlage (Niedersachsen, 23 S.):** Vorwort → Einleitung → 1. Energieverwendung (Liegenschaften, Kostenanalyse) → 2. Verbrauchsanalyse (Wärme/Strom/Wasser/CO₂) → 3. Liegenschaftsvergleich (Strom-Wärme-Diagramm) → 4. Einzelanalyse pro Liegenschaft (Datenblatt) → 5. Ausblick → Anlage Emissionsfaktoren.

**Holle-Bericht (KEMeasy, 85 S.):** Identische Struktur, ergänzt um Trennung Gebäude/Anlagen (Straßenbeleuchtung, Klärwerk), Witterungsbereinigung, Einsparpotenzial-Abschätzung, Platzierung nach Handlungsbedarf, ausführliche Einzeldatenblätter mit Diagrammen pro Liegenschaft.

Beide folgen dem gleichen Niedersachsen-Schema. Andere Bundesländer haben abweichende Pflichten (BW: EWärmeG-Anteile, Berlin: EWG Bln + Solarpflicht, Bayern: BayKlimaG, NRW etc.).

## Plan

### 1. Bundesland im Hauptstandort

Migration: Spalte `locations.federal_state text` (Enum-artig, optional). Nur am Hauptstandort gepflegt; Fallback per Auto-Detect aus PLZ/Lat-Lon.

- Auto-Detect Edge Function `detect-federal-state`: nimmt PLZ + Lat/Lon, mappt PLZ-Bereiche → Bundesland (statisches Lookup, keine externe API nötig).
- Im Standort-Edit-Dialog (`src/components/locations/`) Dropdown „Bundesland" mit 16 Optionen + „Automatisch ermitteln"-Button; nur sichtbar wenn `is_main_location = true`.
- TenantHook erweitern um `mainFederalState`.

### 2. Bundesland-Profile (Report-Templates)

Neue Datei `src/lib/report/federalStateProfiles.ts` mit Profil pro Bundesland:

```ts
{
  code: "NI",
  name: "Niedersachsen",
  legalBasis: "NKlimaG §… (3-Jahres-Turnus)",
  reportingCycle: 3,            // Jahre
  requiredSections: ["vorwort","einleitung","kostenanalyse","verbrauch","co2","einzelanalyse","ausblick"],
  weatherCorrection: true,
  benchmarkSource: "BMWi/BMUB 2015",
  emissionFactors: "GEG 2020",
  extras: []                    // z.B. ["solarpflicht-check"] für BE
}
```

Initial vollständig nur **NI** (validiert gegen KEAN/Holle). Andere Länder als Stub mit korrektem rechtlichen Rahmen + Cycle, Sektionen werden inkrementell ergänzt. Nutzer kann Profil im Report-Dialog auch manuell überschreiben.

### 3. Bericht-Erweiterungen (Report-Builder)

In `src/pages/EnergyReport.tsx`:

- Neuer Konfigurationsschritt „Bundesland-Profil": automatisch aus Hauptstandort vorausgewählt.
- Sektionen rendern auf Basis von `profile.requiredSections`.
- Neue Komponenten in `src/components/report/`:
  - `CoverPage.tsx` – Wappen/Logo, Berichtstitel, Zuständige Stelle, Erstellungsdatum, Betrachtungszeitraum (Holle-Stil).
  - `ForewordSection.tsx` – KI-generiertes Vorwort, mit Bürgermeister-Name aus Tenant-Settings.
  - `IntroductionSection.tsx` – KI-generierte Einleitung mit Verweis auf Landesgesetz.
  - `CostAnalysisSection.tsx` – Wärme/Strom/Wasser-Kostenentwicklung (gestapeltes Balkendiagramm) + Verteilung nach Gebäudekategorien (Pie).
  - `ConsumptionSection.tsx` – Wärme/Strom/Wasser-Verbräuche pro Energieträger über Jahre (witterungsbereinigt für Wärme).
  - `Co2Section.tsx` – Entwicklung CO₂ Strom/Wärme nach Jahren.
  - `BuildingComparisonSection.tsx` – Strom-Wärme-Kennwert-Streudiagramm vs. Benchmark.
  - `SavingPotentialSection.tsx` – KI-Schätzung pro Liegenschaft (kWh und €), basierend auf Abweichung vom Benchmark.
  - `PriorityRankingSection.tsx` – Tabelle „Handlungsbedarf" sortiert nach Einsparpotenzial.
  - `OutlookSection.tsx` – KI-generierter Ausblick mit Bezug auf bereits geplante `energy_measures`.

Bestehende `PropertyProfile.tsx` als Einzeldatenblatt pro Liegenschaft beibehalten/erweitern (Witterungsbereinigung, Mehrjahres-Trend).

### 4. Witterungsbereinigung

Neue Hilfsfunktion `src/lib/weatherCorrection.ts`: Gradtagszahlen via Open-Meteo (existierende Wetter-Provider-Policy). Korrekturfaktor = HGT_normal / HGT_jahr. Nur auf Wärme-Verbrauch anwenden, nicht auf Strom/Wasser. Ergebnisse in Report-Tabellen mit „witterungsbereinigt" gekennzeichnet.

### 5. KI-Texterstellung

Edge Function `supabase/functions/generate-report-text/index.ts` (Lovable AI, `google/gemini-3-flash-preview`):

Eingabe: `{ section, profile, locationData, year, tenantInfo }` → liefert deutschsprachigen Fließtext im Stil des Holle-Berichts. Tool-Calling für strukturierte Ausgabe (`{ html, summary }`).

Sektionen mit KI-Unterstützung:
- Vorwort (anpassbar an Bürgermeister/Land)
- Einleitung (Bezug auf konkretes Landesgesetz aus Profil)
- Maßnahmenempfehlungen pro Liegenschaft (Input: Benchmark-Abweichung + Baujahr + Heizungsart)
- Ausblick

Im UI pro Sektion „Mit KI generieren / neu generieren / manuell überschreiben"-Button. Generierte Texte speichern in `energy_report_archive.report_config.aiTexts`.

### 6. PDF-Export

Bestehender HTML→PDF-Pfad bleibt; neue Sektionen liefern semantisches HTML mit print-CSS (page-break-before für Einzeldatenblätter).

### 7. Memory

Neue Datei `mem://features/reports/communal-energy-report.md` mit:
- Bundesland-Pflicht & Auto-Detect aus PLZ
- KEAN-/Holle-Schema als Referenz
- Witterungsbereinigung Pflicht für Wärme
- KI-Texte über Edge Function, niemals client-seitig

Index-Eintrag ergänzen.

## Technische Details

- Migration: `ALTER TABLE locations ADD COLUMN federal_state text;` + Trigger optional.
- PLZ-Mapping als JSON in `src/lib/federalStatePostalRanges.ts` (16 Bundesländer, PLZ-Bereiche).
- Recharts für alle neuen Diagramme (bereits im Stack).
- Keine neue externe API – Wetterdaten via Open-Meteo (Provider-Policy), KI via Lovable AI.
- Multi-Tenancy: alle Queries weiterhin mit `tenant_id`-Filter; Reports landen in `energy_report_archive` (existiert).

## Out of Scope (bewusst)

- Vollständige inhaltliche Profile für alle 16 Länder in einem Schritt – initial nur NI vollständig, Stubs für Rest.
- Wappen-Upload pro Kommune (kann via vorhandenes `tenant.logo_url` genutzt werden).
- Vollautomatischer Versand an Gremien.
