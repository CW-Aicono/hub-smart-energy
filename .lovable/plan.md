

## KI-gestützte Einsparpotential-Erkennung im EMS Copilot

### Idee

Neben den bestehenden **Investitionsempfehlungen** (PV, Speicher, Wärmepumpe) erhält der Copilot einen neuen Analyse-Modus: **"Einsparpotentiale erkennen"**. Dieser analysiert die tatsächlichen Messdaten (Lastprofile, Tagesverläufe, Wochenenden vs. Werktage, Spitzenwerte) und identifiziert konkrete Verhaltens- und Betriebsoptimierungen — ohne neue Investitionen.

### Was die KI erkennen kann

| Muster | Beispiel | Datenbasis |
|---|---|---|
| Grundlast-Anomalien | "Nachts 12 kW Grundlast — typisch wären 4 kW" | `meter_power_readings_5min` Nacht-Stunden |
| Wochenend-Verbrauch | "Samstag/Sonntag gleicher Verbrauch wie werktags" | Tagesvergleich `meter_period_totals` |
| Lastspitzen | "Regelmäßige Peaks >80 kW um 07:30 — staffeltes Einschalten spart Leistungspreis" | Peak-Analyse aus 5-Min-Daten |
| Heizungs-/Kühlungszeiten | "Heizung läuft bis 22:00, Gebäude ab 18:00 leer" | Wärme-Zähler Tagesverlauf |
| PV-Eigenverbrauch | "Nur 35% Eigenverbrauch — Lastverschiebung auf Mittagsstunden möglich" | PV-Erzeugung vs. Gesamtverbrauch |
| Saisonale Abweichungen | "März 2026 +18% vs. Vorjahr bei gleicher Witterung" | Jahresvergleich + Gradtage |

### Umsetzung

**1. Neuer Tab im Copilot** (`src/pages/Copilot.tsx`)
- Tab "Einsparpotentiale" neben dem bestehenden "Analyse"-Tab
- Button "Einsparpotentiale analysieren" — wählt Standort und Zeitraum (letzte 30/90 Tage)
- Ergebnisliste mit Karten: Titel, Beschreibung, geschätzte Einsparung (kWh, €, CO₂), Priorität, konkrete Handlungsanweisung

**2. Datenaufbereitung in der Edge Function** (`supabase/functions/copilot-analysis/index.ts`)
- Neuer Analyse-Typ `savings_potential` (neben dem bestehenden `single_location` / `portfolio`)
- Aggregiert aus der Datenbank:
  - Tagesverläufe der letzten 30 Tage (5-Min-Daten → Stundenmittel)
  - Werktag vs. Wochenende Durchschnittsprofil
  - Nacht-Grundlast (22:00–05:00)
  - Top-5-Lastspitzen mit Zeitstempel
  - PV-Erzeugung vs. Verbrauch (wenn PV vorhanden)
  - Energiepreise und CO₂-Faktoren des Mandanten
- Diese aufbereiteten Kennzahlen gehen als Kontext an die KI — nicht die Rohdaten

**3. KI-Analyse via Structured Output**
- Neues Tool-Schema `savings_analysis` mit Feldern:
  - `findings[]`: Titel, Beschreibung, Kategorie (Grundlast/Lastspitzen/Betriebszeiten/PV/Saisonal), geschätzte Einsparung kWh/Jahr, geschätzte Einsparung EUR/Jahr, CO₂-Einsparung kg/Jahr, Priorität (hoch/mittel/niedrig), Handlungsanweisung (konkreter Text)
  - `summary`: Gesamt-Einsparpotential kWh, EUR, CO₂, wichtigste Erkenntnis

**4. Persistenz**
- Ergebnisse werden in der bestehenden `copilot_analyses`-Tabelle gespeichert (mit `analysis_type = 'savings_potential'`)
- Keine neuen Tabellen nötig

**5. CO₂ und Kosten**
- CO₂-Faktoren aus `co2_emission_factors` des Mandanten
- Energiepreise aus `energy_prices` des Standorts
- Die KI berechnet: `einsparung_kwh × preis_per_kwh = einsparung_eur` und `einsparung_kwh × co2_factor = co2_kg`

### Technische Details

```text
User wählt Standort + Zeitraum
        ↓
Edge Function sammelt:
  - Stundenprofile (Werktag/WE)
  - Grundlast (Nacht-Minimum)
  - Top-Peaks
  - PV vs. Verbrauch
  - Preise + CO₂-Faktoren
        ↓
Gemini 2.5 Pro analysiert
(Structured Output via Tool-Calling)
        ↓
Ergebnis: 3-8 konkrete Findings
mit kWh, €, CO₂ pro Stück
        ↓
Gespeichert in copilot_analyses
Angezeigt als Karten-Liste
```

### Betroffene Dateien
- `supabase/functions/copilot-analysis/index.ts` — neuer `savings_potential` Zweig mit Datenaufbereitung und KI-Schema
- `src/pages/Copilot.tsx` — neuer Tab mit Ergebnis-UI
- `src/hooks/useCopilotAnalysis.tsx` — erweiterte Typen für Savings-Findings

